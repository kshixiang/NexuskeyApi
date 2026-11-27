package service

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

var upstreamQuoteBalanceClient = &http.Client{
	Timeout: 5 * time.Second,
	CheckRedirect: func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	},
}

var errUpstreamWalletUnavailable = errors.New("Upstream wallet balance unavailable")

func SyncUpstreamQuoteChannelBalance(ctx context.Context, id int) (model.UpstreamQuoteBalance, error) {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	db := model.DB.WithContext(ctx)
	var channel model.UpstreamQuoteChannel
	if err := db.Take(&channel, id).Error; err != nil {
		return model.UpstreamQuoteBalance{}, err
	}
	_, page, _ := upstreamSource(channel.Source)
	endpoint, err := url.Parse(page)
	if err != nil || endpoint.Host == "" {
		return model.UpstreamQuoteBalance{}, errUpstreamWalletUnavailable
	}
	endpoint.RawQuery = ""
	endpoint.Path = "/v1/usage"
	if channel.Source == "string" {
		endpoint.Path = "/v1/sub2api/balance"
	}

	var keys []string
	if err := db.Model(&model.UpstreamQuoteGroup{}).
		Where("channel_id = ? AND api_key <> ?", id, "").Order("id").Pluck("api_key", &keys).Error; err != nil {
		return model.UpstreamQuoteBalance{}, err
	}
	if len(keys) == 0 {
		return model.UpstreamQuoteBalance{}, errors.New("Save an upstream API key before syncing the balance.")
	}

	started := time.Now().UnixMicro()
	seen := make(map[string]struct{}, len(keys))
	for _, key := range keys {
		if ctx.Err() != nil {
			break
		}
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		balance, err := fetchUpstreamQuoteBalance(ctx, endpoint.String(), key, channel.Source)
		if err != nil {
			continue
		}
		balance.BalanceUpdatedAt = started
		// An earlier request may finish after a newer balance has been saved.
		result := db.Model(&model.UpstreamQuoteChannel{}).
			Where("id = ? AND (balance_updated_at IS NULL OR balance_updated_at < ?)", id, started).
			Updates(map[string]any{
				"balance":            *balance.Balance,
				"balance_currency":   balance.BalanceCurrency,
				"balance_updated_at": balance.BalanceUpdatedAt,
			})
		if result.Error != nil {
			return model.UpstreamQuoteBalance{}, result.Error
		}
		if result.RowsAffected == 0 {
			if err := db.Take(&channel, id).Error; err != nil {
				return model.UpstreamQuoteBalance{}, err
			}
			return channel.UpstreamQuoteBalance, nil
		}
		return balance, nil
	}
	return model.UpstreamQuoteBalance{}, errUpstreamWalletUnavailable
}

func fetchUpstreamQuoteBalance(ctx context.Context, endpoint, key, source string) (model.UpstreamQuoteBalance, error) {
	var balance model.UpstreamQuoteBalance
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return balance, err
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Accept", "application/json")
	response, err := upstreamQuoteBalanceClient.Do(req)
	if err != nil {
		return balance, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return balance, errUpstreamWalletUnavailable
	}

	var data struct {
		Balance       *json.Number    `json:"balance"`
		Currency      string          `json:"currency"`
		Object        string          `json:"object"`
		SchemaVersion int             `json:"schema_version"`
		Unit          string          `json:"unit"`
		Mode          string          `json:"mode"`
		Subscription  json.RawMessage `json:"subscription"`
	}
	if err := common.DecodeJson(io.LimitReader(response.Body, 1<<20), &data); err != nil {
		return balance, err
	}
	currency := data.Unit
	if source == "string" {
		if data.Object != "sub2api.key_balance" || data.SchemaVersion != 1 {
			return balance, errUpstreamWalletUnavailable
		}
		currency = data.Currency
	} else if data.Mode != "unrestricted" || (len(data.Subscription) != 0 && string(data.Subscription) != "null") {
		return balance, errUpstreamWalletUnavailable
	}
	currency = strings.ToUpper(strings.TrimSpace(currency))
	if data.Balance == nil || len(currency) != 3 || strings.IndexFunc(currency, func(r rune) bool { return r < 'A' || r > 'Z' }) >= 0 {
		return balance, errUpstreamWalletUnavailable
	}
	amount, err := data.Balance.Float64()
	if err != nil || math.IsNaN(amount) || math.IsInf(amount, 0) {
		return balance, errUpstreamWalletUnavailable
	}
	balance.Balance = &amount
	balance.BalanceCurrency = currency
	return balance, nil
}
