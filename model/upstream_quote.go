package model

import (
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"gorm.io/gorm"
)

type UpstreamQuoteChannel struct {
	ID        int    `json:"id"`
	Source    string `json:"source" gorm:"size:32;uniqueIndex;not null"`
	Name      string `json:"name"`
	SourceURL string `json:"source_url"`
	Imported  int64  `json:"imported_at"`
}

type UpstreamQuoteGroup struct {
	ID                 int      `json:"id"`
	ChannelID          int      `json:"channel_id" gorm:"uniqueIndex:idx_upstream_group_source;not null"`
	SourceGroup        string   `json:"source_group" gorm:"size:64;uniqueIndex:idx_upstream_group_source;not null"`
	OriginalName       string   `json:"original_name"`
	Name               string   `json:"name"`
	SalesName          string   `json:"sales_name"`
	APIKey             string   `json:"-" gorm:"type:text"`
	KeyHint            string   `json:"key_hint" gorm:"-"`
	BaseURL            string   `json:"base_url"`
	Protocol           string   `json:"protocol"`
	Multiplier         float64  `json:"multiplier"`
	FinalMultiplier    *float64 `json:"final_multiplier,omitempty"`
	UpstreamMultiplier *float64 `json:"upstream_multiplier,omitempty" gorm:"-"`
	CreditCost         float64  `json:"credit_cost"`
	Revision           int      `json:"revision"`
	ActiveVersion      int      `json:"active_version"`
}

type UpstreamQuoteModel struct {
	ID             int    `json:"id"`
	GroupID        int    `json:"group_id" gorm:"uniqueIndex:idx_upstream_model;not null"`
	ModelID        string `json:"model_id" gorm:"size:191;uniqueIndex:idx_upstream_model;not null"`
	QuoteVersion   int    `json:"quote_version"`
	LastSeenImport int64  `json:"last_seen_import"`
}

type UpstreamQuoteVersion struct {
	ID         int    `json:"id"`
	GroupID    int    `json:"group_id" gorm:"index;not null"`
	Digest     string `json:"-" gorm:"size:64;index;not null"`
	Snapshot   string `json:"-" gorm:"type:text;not null"`
	ImportedAt int64  `json:"imported_at"`
}

type UpstreamSaleVersion struct {
	ID              int      `json:"id"`
	GroupID         int      `json:"group_id" gorm:"index;not null"`
	ChannelID       int      `json:"channel_id"`
	Markup          float64  `json:"multiplier"`
	FinalMultiplier *float64 `json:"final_multiplier,omitempty"`
	CreditCost      float64  `json:"-"`
	Protocol        string   `json:"-"`
	CreatedAt       int64    `json:"created_at"`
}

type UpstreamSaleModel struct {
	ID           int     `json:"id"`
	VersionID    int     `json:"version_id" gorm:"uniqueIndex:idx_upstream_sale_model;not null"`
	ModelName    string  `json:"model_name" gorm:"size:191;uniqueIndex:idx_upstream_sale_model;not null"`
	UpstreamName string  `json:"upstream_name"`
	QuoteVersion int     `json:"quote_version"`
	Expression   string  `json:"expression" gorm:"type:text"`
	FixedPrice   float64 `json:"fixed_price"`
	Fixed        bool    `json:"fixed"`
	Endpoints    string  `json:"endpoints"`
}

type UpstreamSaleRoute struct {
	Channel         Channel
	Group           string
	SalesName       string
	FinalMultiplier *float64
	Version         int
	QuoteVersion    int
	Expression      string
	FixedPrice      float64
	Fixed           bool
	Endpoints       string
}

const upstreamGroupPrefix = "upstream-sale-"

func UpstreamSaleGroupKey(id int) string {
	return upstreamGroupPrefix + strconv.Itoa(id)
}

func IsUpstreamSaleGroup(key string) bool {
	return strings.HasPrefix(key, upstreamGroupPrefix)
}

func ExcludeUpstreamSaleChannels(db *gorm.DB) *gorm.DB {
	return db.Where(commonGroupCol+" NOT LIKE ?", upstreamGroupPrefix+"%")
}

func activeUpstreamSaleModels() *gorm.DB {
	return DB.Table("upstream_sale_models AS sale").
		Joins("JOIN upstream_sale_versions AS ver ON ver.id = sale.version_id").
		Joins("JOIN upstream_quote_groups AS grp ON grp.id = ver.group_id AND grp.active_version = ver.id").
		Joins("JOIN channels AS ch ON ch.id = ver.channel_id").
		Where("ch.status = ?", common.ChannelStatusEnabled)
}

func ResolveUpstreamSaleRoute(group, modelName string) (*UpstreamSaleRoute, error) {
	id, err := strconv.Atoi(strings.TrimPrefix(group, upstreamGroupPrefix))
	if err != nil || group != UpstreamSaleGroupKey(id) {
		return nil, nil
	}
	var row struct {
		Channel               `gorm:"embedded"`
		Version, QuoteVersion int
		Expression, Endpoints string
		ModelName, SalesName  string
		FinalMultiplier       *float64
		Fixed                 bool
		FixedPrice            float64
	}
	result := activeUpstreamSaleModels().Where("grp.id = ? AND sale.model_name = ?", id, modelName).
		Select("ch.*, grp.sales_name, ver.final_multiplier, ver.id AS version, " +
			"sale.model_name, sale.quote_version, sale.expression, sale.endpoints, sale.fixed, sale.fixed_price").Limit(1).Scan(&row)
	if result.Error != nil || result.RowsAffected == 0 || row.Group != group || row.ModelName != modelName || row.Key == "" {
		return nil, result.Error
	}
	return &UpstreamSaleRoute{
		Channel: row.Channel, Group: group, SalesName: row.SalesName, FinalMultiplier: row.FinalMultiplier,
		Version: row.Version, QuoteVersion: row.QuoteVersion,
		Expression: row.Expression, FixedPrice: row.FixedPrice, Fixed: row.Fixed, Endpoints: row.Endpoints,
	}, nil
}

type PublishedUpstreamGroup struct {
	Name            string
	FinalMultiplier *float64
}

func PublishedUpstreamGroups() map[string]PublishedUpstreamGroup {
	if DB == nil {
		return nil
	}
	var rows []struct {
		ID int
		PublishedUpstreamGroup
	}
	DB.Table("upstream_quote_groups AS grp").Select("grp.id, grp.sales_name AS name, ver.final_multiplier").
		Joins("JOIN upstream_sale_versions AS ver ON ver.id = grp.active_version").
		Joins("JOIN channels AS ch ON ch.id = ver.channel_id").
		Where("ch.status = ?", common.ChannelStatusEnabled).Scan(&rows)
	groups := make(map[string]PublishedUpstreamGroup, len(rows))
	for _, row := range rows {
		groups[UpstreamSaleGroupKey(row.ID)] = row.PublishedUpstreamGroup
	}
	return groups
}

func PublishedUpstreamGroupModels(group string) map[string][]constant.EndpointType {
	id, err := strconv.Atoi(strings.TrimPrefix(group, upstreamGroupPrefix))
	if err != nil || group != UpstreamSaleGroupKey(id) {
		return nil
	}
	var rows []UpstreamSaleModel
	activeUpstreamSaleModels().Where("grp.id = ?", id).Select("sale.model_name, sale.endpoints").Scan(&rows)
	models := make(map[string][]constant.EndpointType, len(rows))
	for _, row := range rows {
		for _, endpoint := range strings.Split(row.Endpoints, ",") {
			models[row.ModelName] = append(models[row.ModelName], constant.EndpointType(endpoint))
		}
	}
	return models
}

func PublishedUpstreamPricing() ([]Pricing, error) {
	var rows []struct {
		UpstreamSaleModel `gorm:"embedded"`
		GroupID           int
		SalesName         string
		FinalMultiplier   *float64
	}
	err := activeUpstreamSaleModels().Select("sale.*, grp.id AS group_id, grp.sales_name, ver.final_multiplier").Order("grp.id, sale.model_name").Scan(&rows).Error
	prices := make([]Pricing, 0, len(rows))
	for _, row := range rows {
		group := UpstreamSaleGroupKey(row.GroupID)
		price := Pricing{ModelName: row.ModelName, EnableGroup: []string{group}, SaleGroup: group, SaleGroupName: row.SalesName}
		price.SaleGroupMultiplier = row.FinalMultiplier
		for _, endpoint := range strings.Split(row.Endpoints, ",") {
			price.SupportedEndpointTypes = append(price.SupportedEndpointTypes, constant.EndpointType(endpoint))
		}
		if row.Fixed {
			price.QuotaType = 1
			price.ModelPrice = row.FixedPrice
		} else {
			price.BillingMode = billing_setting.BillingModeTieredExpr
			price.BillingExpr = row.Expression
		}
		prices = append(prices, price)
	}
	return prices, err
}
