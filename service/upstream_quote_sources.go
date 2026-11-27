package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
)

type upstreamCatalog struct {
	Code int             `json:"code"`
	Data json.RawMessage `json:"data"`
}

func FetchUpstreamQuoteSnapshot(ctx context.Context, source string) (UpstreamImport, error) {
	var endpoint, token string
	switch source {
	case "kedaya":
		endpoint = "https://kedaya.ai/api/v1/model-plaza"
	case "string":
		endpoint = "https://www.string.ink/api/v1/public/pricing"
	case "geek2api":
		endpoint = "https://www.geek2api.com/api/v1/model-plaza"
		token = strings.TrimSpace(common.GetEnvOrDefaultString("GEEK2API_QUOTE_BEARER_TOKEN", ""))
		if token == "" {
			return UpstreamImport{}, errors.New("Geek2API requires GEEK2API_QUOTE_BEARER_TOKEN to fetch quotes; you can also upload or paste a JSON snapshot")
		}
	default:
		return UpstreamImport{}, errors.New("unknown upstream quote source")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return UpstreamImport{}, err
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	client := http.Client{Timeout: 15 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	}}
	res, err := client.Do(req)
	if err != nil {
		return UpstreamImport{}, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return UpstreamImport{}, fmt.Errorf("upstream quote source returned HTTP %d", res.StatusCode)
	}
	raw, err := io.ReadAll(io.LimitReader(res.Body, (8<<20)+1))
	if err != nil {
		return UpstreamImport{}, err
	}
	if len(raw) > 8<<20 {
		return UpstreamImport{}, errors.New("upstream snapshot is too large")
	}
	return ParseUpstreamQuoteSnapshot(source, raw)
}

func ParseUpstreamQuoteSnapshot(source string, raw []byte) (UpstreamImport, error) {
	result := UpstreamImport{Source: source}
	var envelope upstreamCatalog
	if err := common.Unmarshal(raw, &envelope); err != nil {
		return result, err
	}
	if envelope.Code != 0 || len(envelope.Data) == 0 {
		return result, errors.New("invalid upstream quote snapshot")
	}
	var err error
	switch source {
	case "kedaya":
		result.Groups, err = parseKedayaQuotes(envelope.Data)
	case "string":
		result.Groups, err = parseStringQuotes(envelope.Data)
	case "geek2api":
		result.Groups, err = parseGeek2APIQuotes(envelope.Data)
	default:
		err = errors.New("unknown upstream quote source")
	}
	if err == nil {
		err = ValidateUpstreamImport(result)
	}
	return result, err
}

type kedayaTier struct {
	Label   string   `json:"tier_label"`
	Min     int      `json:"min_tokens"`
	Max     *int     `json:"max_tokens"`
	Input   *float64 `json:"input_price"`
	Output  *float64 `json:"output_price"`
	Read    *float64 `json:"cache_read_price"`
	Write   *float64 `json:"cache_write_price"`
	Write1h *float64 `json:"cache_write_1h_price"`
	Fixed   *float64 `json:"per_request_price"`
}

func (rate kedayaTier) tier(factor float64) UpstreamTier {
	return UpstreamTier{Name: rate.Label, Input: scaleQuote(rate.Input, factor), Output: scaleQuote(rate.Output, factor),
		CacheRead: scaleQuote(rate.Read, factor), CacheWrite: scaleQuote(rate.Write, factor), Cache1h: scaleQuote(rate.Write1h, factor)}
}

func parseKedayaQuotes(raw []byte) ([]UpstreamImportGroup, error) {
	var catalog struct {
		Groups []struct {
			ID       int               `json:"id"`
			Name     string            `json:"name"`
			Platform string            `json:"platform"`
			Rate     *float64          `json:"rate_multiplier"`
			Peak     bool              `json:"peak_rate_enabled"`
			Start    string            `json:"peak_start"`
			End      string            `json:"peak_end"`
			PeakRate *float64          `json:"peak_rate_multiplier"`
			Models   []json.RawMessage `json:"models"`
		} `json:"groups"`
	}
	if err := common.Unmarshal(raw, &catalog); err != nil {
		return nil, err
	}
	groups := make([]UpstreamImportGroup, 0, len(catalog.Groups))
	for _, source := range catalog.Groups {
		group := UpstreamImportGroup{Name: source.Name}
		if source.ID > 0 {
			group.SourceID = strconv.Itoa(source.ID)
		}
		for _, rawModel := range source.Models {
			var item struct {
				Name     string   `json:"name"`
				Platform string   `json:"platform"`
				Rate     *float64 `json:"rate_multiplier"`
				Pricing  struct {
					kedayaTier
					Mode      string       `json:"billing_mode"`
					Intervals []kedayaTier `json:"intervals"`
				} `json:"pricing"`
				TimePricing json.RawMessage `json:"time_pricing"`
			}
			if err := common.Unmarshal(rawModel, &item); err != nil {
				return nil, err
			}
			if item.Name == "" {
				continue
			}
			factor := 1.0
			if source.Rate != nil {
				factor = *source.Rate
			}
			if item.Rate != nil {
				factor = *item.Rate
			}
			ref, err := common.Marshal(map[string]any{
				"model": rawModel, "group_multiplier": source.Rate, "peak_enabled": source.Peak,
				"peak_start": source.Start, "peak_end": source.End, "peak_multiplier": source.PeakRate,
			})
			if err != nil {
				return nil, err
			}
			quote := UpstreamQuote{ModelID: item.Name, Kind: quoteMeter(item.Pricing.Mode), Unit: "usd",
				Endpoints: quoteEndpoints(item.Platform), Reference: ref}
			switch quote.Kind {
			case "token":
				quote.Tiers = []UpstreamTier{item.Pricing.kedayaTier.tier(factor * 1e6)}
				if len(item.Pricing.Intervals) > 0 {
					quote.Tiers = nil
					for i, rate := range item.Pricing.Intervals {
						tier := rate.tier(factor * 1e6)
						if rate.Max != nil {
							tier.Limit, tier.Operator = rate.Max, "<="
							if strings.HasPrefix(rate.Label, "<") && !strings.HasPrefix(rate.Label, "<=") {
								tier.Operator = "<"
							}
						} else if i != len(item.Pricing.Intervals)-1 {
							tier.Limit, tier.Operator = &rate.Min, ">"
						}
						quote.Tiers = append(quote.Tiers, tier)
					}
				}
			case "fixed":
				quote.FixedPrice = scaleQuote(item.Pricing.Fixed, factor)
			case "image", "video":
				for _, rate := range item.Pricing.Intervals {
					quote.Media = append(quote.Media, UpstreamMediaPrice{Spec: rate.Label, Meter: "per_request", Price: scaleQuote(rate.Fixed, factor)})
				}
				if len(quote.Media) == 0 {
					quote.Media = []UpstreamMediaPrice{{Spec: "default", Meter: "per_request", Price: scaleQuote(item.Pricing.Fixed, factor)}}
				}
			}
			group.Quotes = append(group.Quotes, quote)
		}
		groups = append(groups, group)
	}
	return groups, nil
}

type stringQuoteTier struct {
	Min     int      `json:"min_tokens"`
	Input   *float64 `json:"effective_input_usd_per_mtok"`
	Output  *float64 `json:"effective_output_usd_per_mtok"`
	Read    *float64 `json:"effective_cache_read_usd_per_mtok"`
	Write   *float64 `json:"effective_cache_write_usd_per_mtok"`
	Write1h *float64 `json:"effective_cache_write_1h_usd_per_mtok"`
	Fixed   *float64 `json:"effective_per_request_price_usd"`
}

func (rate stringQuoteTier) tier(name string, credits float64) UpstreamTier {
	return UpstreamTier{Name: name, Input: scaleQuote(rate.Input, credits), Output: scaleQuote(rate.Output, credits),
		CacheRead: scaleQuote(rate.Read, credits), CacheWrite: scaleQuote(rate.Write, credits), Cache1h: scaleQuote(rate.Write1h, credits)}
}

type stringQuoteSection struct {
	ID      int               `json:"source_channel_id"`
	Name    string            `json:"source_name"`
	Family  string            `json:"display_family"`
	Variant string            `json:"display_variant"`
	Rows    []json.RawMessage `json:"rows"`
}

func parseStringQuotes(raw []byte) ([]UpstreamImportGroup, error) {
	var catalog struct {
		Credits  float64              `json:"credits_fx_rate"`
		Primary  stringQuoteSection   `json:"model_pricing"`
		Sections []stringQuoteSection `json:"model_pricing_sections"`
		Images   []struct {
			Model    string            `json:"image_model"`
			Platform string            `json:"platform"`
			Rows     []json.RawMessage `json:"rows"`
		} `json:"image_pricing_sections"`
		Videos []struct {
			Model string            `json:"model"`
			Rules []json.RawMessage `json:"rules"`
		} `json:"video_pricing_sections"`
	}
	if err := common.Unmarshal(raw, &catalog); err != nil {
		return nil, err
	}
	if len(catalog.Sections) == 0 && len(catalog.Primary.Rows) > 0 {
		catalog.Sections = []stringQuoteSection{catalog.Primary}
	}
	groups := make([]UpstreamImportGroup, 0, len(catalog.Sections)+2)
	for _, source := range catalog.Sections {
		name := source.Variant
		if name == "" {
			name = source.Name
		}
		group := UpstreamImportGroup{Name: name}
		if source.ID > 0 {
			group.SourceID = source.Family + ":" + strconv.Itoa(source.ID)
		}
		for _, rawRow := range source.Rows {
			var row struct {
				stringQuoteTier
				Platform  string            `json:"platform"`
				Models    []string          `json:"models"`
				Mode      string            `json:"billing_mode"`
				Intervals []stringQuoteTier `json:"intervals"`
			}
			if err := common.Unmarshal(rawRow, &row); err != nil {
				return nil, err
			}
			ref, err := common.Marshal(map[string]any{"row": rawRow, "credits_fx_rate": catalog.Credits})
			if err != nil {
				return nil, err
			}
			for _, name := range row.Models {
				quote := UpstreamQuote{ModelID: name, Kind: quoteMeter(row.Mode), Unit: "usd", Endpoints: quoteEndpoints(row.Platform), Reference: ref}
				quote.FixedPrice = row.Fixed
				quote.Tiers = []UpstreamTier{row.tier("base", 1)}
				for i, rate := range row.Intervals {
					// The source presents minimum lengths with an ambiguous boundary; the import stays unconfirmed.
					tier := rate.tier(fmt.Sprintf("context_%d", i+1), 1)
					tier.Limit, tier.Operator = &rate.Min, ">="
					quote.Tiers = append([]UpstreamTier{tier}, quote.Tiers...)
				}
				group.Quotes = append(group.Quotes, quote)
			}
		}
		groups = append(groups, group)
	}
	images := UpstreamImportGroup{Name: "Images", SourceID: "images"}
	for _, item := range catalog.Images {
		ref, err := common.Marshal(item.Rows)
		if err != nil {
			return nil, err
		}
		quote := UpstreamQuote{ModelID: item.Model, Kind: "image", Unit: "usd", Reference: ref}
		for _, rawRate := range item.Rows {
			var rate struct {
				Size string   `json:"size"`
				USD  *float64 `json:"price_usd"`
			}
			if err := common.Unmarshal(rawRate, &rate); err != nil {
				return nil, err
			}
			quote.Media = append(quote.Media, UpstreamMediaPrice{Spec: rate.Size, Meter: "per_image", Price: rate.USD})
		}
		images.Quotes = append(images.Quotes, quote)
	}
	videos := UpstreamImportGroup{Name: "Videos", SourceID: "videos"}
	for _, item := range catalog.Videos {
		ref, err := common.Marshal(item.Rules)
		if err != nil {
			return nil, err
		}
		quote := UpstreamQuote{ModelID: item.Model, Kind: "video", Unit: "usd", Reference: ref}
		for _, rawRule := range item.Rules {
			var rule struct {
				Unit   string   `json:"unit"`
				Scenes []string `json:"scenes"`
				Rows   []struct {
					Match map[string]string `json:"match"`
					Price *float64          `json:"price"`
					Input *float64          `json:"input_video_price"`
				} `json:"rows"`
			}
			if err := common.Unmarshal(rawRule, &rule); err != nil {
				continue
			}
			for _, rate := range rule.Rows {
				spec, _ := common.Marshal(rate.Match)
				label := string(spec) + " " + strings.Join(rule.Scenes, "/")
				quote.Media = append(quote.Media, UpstreamMediaPrice{Spec: label, Meter: rule.Unit, Price: rate.Price})
				if rate.Input != nil {
					quote.Media = append(quote.Media, UpstreamMediaPrice{Spec: label, Meter: "reference_per_second", Price: rate.Input})
				}
			}
		}
		videos.Quotes = append(videos.Quotes, quote)
	}
	if len(images.Quotes) > 0 {
		groups = append(groups, images)
	}
	if len(videos.Quotes) > 0 {
		groups = append(groups, videos)
	}
	return groups, nil
}

func scaleQuote(value *float64, factor float64) *float64 {
	if value == nil {
		return nil
	}
	return common.GetPointer(multiplyUpstreamAmount(*value, factor))
}

func quoteMeter(source string) string {
	switch source {
	case "token", "image", "video":
		return source
	case "fixed", "request", "per_request":
		return "fixed"
	default:
		return "unknown"
	}
}

func quoteEndpoints(platform string) []string {
	if platform == "anthropic" || platform == "claude" {
		return []string{"anthropic"}
	}
	if platform == "openai" {
		return []string{"openai", "openai-response"}
	}
	return []string{"openai"}
}
