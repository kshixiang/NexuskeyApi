package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/shopspring/decimal"
)

func UpstreamEndpointAllowed(path string, route *model.UpstreamSaleRoute) bool {
	var endpoint constant.EndpointType
	switch path {
	case "/v1/chat/completions", "/pg/chat/completions":
		endpoint = constant.EndpointTypeOpenAI
	case "/v1/responses":
		endpoint = constant.EndpointTypeOpenAIResponse
	case "/v1/messages":
		endpoint = constant.EndpointTypeAnthropic
	}
	return endpoint != "" && slices.Contains(strings.Split(route.Endpoints, ","), string(endpoint))
}

type UpstreamComparison struct {
	Model     string                  `json:"model"`
	At        time.Time               `json:"at"`
	Usage     billingexpr.TokenParams `json:"usage"`
	Unit      string                  `json:"unit"`
	Spec      string                  `json:"spec"`
	Quantity  float64                 `json:"quantity"`
	Sale      *float64                `json:"sale"`
	Published bool                    `json:"published"`
}

type UpstreamComparisonRow struct {
	Channel    string             `json:"channel"`
	Group      string             `json:"group"`
	Cost       float64            `json:"cost"`
	Components map[string]float64 `json:"components,omitempty"`
	Sale       float64            `json:"sale"`
	Margin     *float64           `json:"margin,omitempty"`
	Tier       string             `json:"tier"`
	Error      string             `json:"error,omitempty"`
	Estimated  bool               `json:"estimated"`
}

func CompareUpstreamQuotes(input UpstreamComparison) ([]UpstreamComparisonRow, error) {
	if !validUpstreamModel(input.Model) {
		return nil, errors.New("select a model")
	}
	buckets := []*float64{&input.Usage.P, &input.Usage.C, &input.Usage.CR, &input.Usage.CC, &input.Usage.CC1h}
	for _, bucket := range buckets {
		if !validUpstreamAmount(*bucket) {
			return nil, errors.New("invalid token quantity")
		}
	}
	if !validUpstreamAmount(input.Quantity) || (input.Sale != nil && !validUpstreamAmount(*input.Sale)) {
		return nil, errors.New("invalid quantity or sale price")
	}
	input.Usage.Len = input.Usage.P + input.Usage.CR + input.Usage.CC + input.Usage.CC1h
	if input.At.IsZero() {
		input.At = time.Now()
	}
	channels, err := ListUpstreamQuoteChannels()
	if err != nil {
		return nil, err
	}
	result := make([]UpstreamComparisonRow, 0)
	for _, channel := range channels {
		for _, group := range channel.Groups {
			if input.Published && group.ActiveVersion == 0 {
				continue
			}
			quotes, err := loadUpstreamQuotes(model.DB, group.ID)
			if input.Published {
				quotes, err = loadPublishedComparison(group.ActiveVersion, input.Model, &group)
			}
			if err != nil {
				return nil, err
			}
			for _, quote := range quotes {
				name := quote.Quote.LocalModel
				if name == "" {
					name = quote.Quote.ModelID
				}
				if name != input.Model {
					continue
				}
				row := UpstreamComparisonRow{Channel: channel.Name, Group: group.Name, Estimated: !quote.Quote.Confirmed}
				if err := evaluateUpstreamComparison(group, quote.Quote, input, &row); err != nil {
					row.Error = err.Error()
				}
				if quote.Sale != nil && input.Sale == nil && row.Error == "" {
					if err := applyPublishedComparisonPrice(quote.Sale, input, &row); err != nil {
						row.Error = err.Error()
					}
				}
				result = append(result, row)
			}
		}
	}
	return result, nil
}

func loadPublishedComparison(version int, name string, group *model.UpstreamQuoteGroup) ([]UpstreamQuotePreview, error) {
	var rows []struct {
		model.UpstreamSaleModel `gorm:"embedded"`
		Snapshot                string
		Markup                  float64
		CreditCost              float64
		Protocol                string
	}
	err := model.DB.Table("upstream_sale_models AS sale").
		Select("sale.*, quote.snapshot, ver.markup, ver.credit_cost, ver.protocol").
		Joins("JOIN upstream_quote_versions AS quote ON quote.id = sale.quote_version").
		Joins("JOIN upstream_sale_versions AS ver ON ver.id = sale.version_id").
		Where("sale.version_id = ? AND sale.model_name = ?", version, name).Scan(&rows).Error
	result := make([]UpstreamQuotePreview, 0, len(rows))
	for _, row := range rows {
		var quote UpstreamQuote
		if err := common.UnmarshalJsonStr(row.Snapshot, &quote); err != nil {
			return nil, err
		}
		group.Multiplier, group.CreditCost, group.Protocol = row.Markup, row.CreditCost, row.Protocol
		result = append(result, UpstreamQuotePreview{Quote: quote, Sale: &row.UpstreamSaleModel})
	}
	return result, err
}

func applyPublishedComparisonPrice(price *model.UpstreamSaleModel, input UpstreamComparison, row *UpstreamComparisonRow) error {
	row.Sale = price.FixedPrice
	if !price.Fixed {
		amount, _, err := billingexpr.RunExprWithRequest(price.Expression, input.Usage, billingexpr.RequestInput{At: input.At})
		if err != nil {
			return err
		}
		row.Sale = amount / 1e6
	}
	row.Margin = nil
	if row.Sale > 0 {
		margin := (row.Sale - row.Cost) / row.Sale
		row.Margin = &margin
	}
	return nil
}

func evaluateUpstreamComparison(group model.UpstreamQuoteGroup, quote UpstreamQuote, input UpstreamComparison, row *UpstreamComparisonRow) error {
	factor, err := upstreamCostFactor(group, quote.Unit)
	if err != nil {
		return err
	}
	switch quote.Kind {
	case "image", "video":
		var found bool
		for _, rate := range quote.Media {
			if rate.Spec == input.Spec && rate.Meter == input.Unit && rate.Price != nil && validUpstreamAmount(*rate.Price) {
				row.Cost = *rate.Price * factor * input.Quantity
				found = true
				break
			}
		}
		if !found {
			return errors.New("no confirmed price for this specification and meter")
		}
	case "fixed":
		if quote.FixedPrice == nil || !validUpstreamAmount(*quote.FixedPrice) {
			return errors.New("no per-call price")
		}
		row.Cost = *quote.FixedPrice * factor
	case "token":
		// Pricing comparison uses explicit, mutually exclusive token quantities.
		expression, err := upstreamTokenExpression(quote.Tiers, factor, "anthropic")
		if err != nil {
			return err
		}
		usedVars := billingexpr.UsedVars(expression)
		for _, bucket := range []struct {
			name, variable string
			value          float64
		}{{"input", "p", input.Usage.P}, {"output", "c", input.Usage.C}, {"cache_read", "cr", input.Usage.CR}, {"cache_write", "cc", input.Usage.CC}, {"cache_write_1h", "cc1h", input.Usage.CC1h}} {
			if bucket.value > 0 && !usedVars[bucket.variable] {
				return fmt.Errorf("no confirmed price for %s", bucket.name)
			}
		}
		at := billingexpr.RequestInput{At: input.At}
		total, trace, err := billingexpr.RunExprWithRequest(expression, input.Usage, at)
		if err != nil {
			return err
		}
		row.Cost, row.Tier = total/1e6, trace.MatchedTier
		row.Components = make(map[string]float64)
		for _, bucket := range []struct {
			name string
			use  billingexpr.TokenParams
		}{
			{"input", billingexpr.TokenParams{P: input.Usage.P}}, {"output", billingexpr.TokenParams{C: input.Usage.C}},
			{"cache_read", billingexpr.TokenParams{CR: input.Usage.CR}}, {"cache_write", billingexpr.TokenParams{CC: input.Usage.CC}},
			{"cache_write_1h", billingexpr.TokenParams{CC1h: input.Usage.CC1h}},
		} {
			bucket.use.Len = input.Usage.Len
			amount, _, err := billingexpr.RunExprWithRequest(expression, bucket.use, at)
			if err != nil {
				return err
			}
			row.Components[bucket.name] = amount / 1e6
		}
	default:
		return errors.New("unknown quote meter")
	}
	row.Sale = row.Cost * group.Multiplier
	if input.Sale != nil {
		row.Sale = *input.Sale
	}
	if row.Sale > 0 {
		margin := (row.Sale - row.Cost) / row.Sale
		row.Margin = &margin
	}
	return nil
}

type UpstreamQuote struct {
	ModelID       string               `json:"model_id"`
	LocalModel    string               `json:"local_model,omitempty"`
	Kind          string               `json:"kind"`
	Unit          string               `json:"unit"`
	Confirmed     bool                 `json:"confirmed"`
	UsageVerified bool                 `json:"usage_verified"`
	Endpoints     []string             `json:"endpoints"`
	FixedPrice    *float64             `json:"fixed_price,omitempty"`
	Tiers         []UpstreamTier       `json:"tiers,omitempty"`
	Media         []UpstreamMediaPrice `json:"media,omitempty"`
	Reference     json.RawMessage      `json:"reference,omitempty"`
}

type UpstreamMediaPrice struct {
	Spec  string   `json:"spec"`
	Meter string   `json:"meter"`
	Price *float64 `json:"price"`
}

type UpstreamTier struct {
	Name       string          `json:"name"`
	Limit      *int            `json:"limit,omitempty"`
	Operator   string          `json:"operator,omitempty"`
	Window     *UpstreamWindow `json:"window,omitempty"`
	Input      *float64        `json:"input"`
	Output     *float64        `json:"output"`
	CacheRead  *float64        `json:"cache_read,omitempty"`
	CacheWrite *float64        `json:"cache_write,omitempty"`
	Cache1h    *float64        `json:"cache_write_1h,omitempty"`
}

type UpstreamWindow struct {
	Timezone string `json:"timezone"`
	Start    int    `json:"start_minute"`
	End      int    `json:"end_minute"`
	Weekdays []int  `json:"weekdays,omitempty"`
}

func validUpstreamAmount(value float64) bool {
	return value >= 0 && value <= 1e9 && !math.IsNaN(value)
}

func upstreamAmount(value float64) string {
	return strconv.FormatFloat(value, 'f', -1, 64)
}

func multiplyUpstreamAmount(price, factor float64) float64 {
	return decimal.NewFromFloat(price).Mul(decimal.NewFromFloat(factor)).InexactFloat64()
}

func upstreamCostFactor(group model.UpstreamQuoteGroup, unit string) (float64, error) {
	switch unit {
	case "usd":
		return 1, nil
	case "credit":
		if group.CreditCost > 0 && validUpstreamAmount(group.CreditCost) {
			return group.CreditCost, nil
		}
		return 0, errors.New("set the actual USD cost per credit")
	default:
		return 0, errors.New("unsupported price currency")
	}
}

func upstreamWindowCondition(window *UpstreamWindow) (string, error) {
	if window == nil {
		return "", nil
	}
	if _, err := time.LoadLocation(window.Timezone); err != nil || window.Timezone == "" || window.Timezone == "Local" ||
		window.Start < 0 || window.Start >= 1440 || window.End < 0 || window.End > 1440 || window.Start == window.End {
		return "", errors.New("invalid pricing time window")
	}
	tz := strconv.Quote(window.Timezone)
	minute := "(hour(" + tz + ") * 60 + minute(" + tz + "))"
	days := make([]string, 0, len(window.Weekdays))
	for _, day := range window.Weekdays {
		if day < 0 || day > 6 {
			return "", errors.New("invalid pricing weekday")
		}
		days = append(days, strconv.Itoa(day))
	}
	weekday := "weekday(" + tz + ")"
	dayCondition := func(day string) string {
		if len(days) == 0 {
			return ""
		}
		return " && " + day + " in [" + strings.Join(days, ",") + "]"
	}
	start := minute + " >= " + strconv.Itoa(window.Start)
	end := minute + " < " + strconv.Itoa(window.End)
	if window.Start < window.End {
		return "(" + start + " && " + end + dayCondition(weekday) + ")", nil
	}
	return "((" + start + dayCondition(weekday) + ") || (" + end + dayCondition("(("+weekday+" + 6) % 7)") + "))", nil
}

func upstreamTokenExpression(tiers []UpstreamTier, factor float64, protocol string) (string, error) {
	if len(tiers) == 0 || len(tiers) > 20 {
		return "", errors.New("token quotes require one to twenty price tiers")
	}
	var expression string
	var dimensions [3]bool
	for i := len(tiers) - 1; i >= 0; i-- {
		tier := tiers[i]
		amounts := []*float64{tier.Input, tier.Output, tier.CacheRead, tier.CacheWrite, tier.Cache1h}
		variables := []string{"p", "c", "cr", "cc", "cc1h"}
		terms := make([]string, 0, len(amounts))
		for j, amount := range amounts {
			if j >= 2 {
				if i == len(tiers)-1 {
					dimensions[j-2] = amount != nil
				} else if dimensions[j-2] != (amount != nil) {
					return "", errors.New("all tiers must confirm the same cache dimensions")
				}
			}
			if amount == nil && j >= 2 {
				continue
			}
			if amount == nil || !validUpstreamAmount(*amount) || !validUpstreamAmount(*amount*factor) {
				return "", errors.New("missing or invalid token price")
			}
			if j >= 3 && *amount > 0 && protocol != "anthropic" {
				return "", errors.New("cache write pricing requires the Anthropic usage protocol")
			}
			terms = append(terms, variables[j]+" * "+upstreamAmount(multiplyUpstreamAmount(*amount, factor)))
		}
		name := strings.TrimSpace(tier.Name)
		if name == "" {
			name = fmt.Sprintf("tier_%d", i+1)
		}
		part := "tier(" + strconv.Quote(name) + ", " + strings.Join(terms, " + ") + ")"
		condition, err := upstreamWindowCondition(tier.Window)
		if err != nil {
			return "", err
		}
		if tier.Limit != nil {
			switch tier.Operator {
			case "<", "<=", ">", ">=":
			default:
				return "", errors.New("invalid context comparison")
			}
			if *tier.Limit < 0 {
				return "", errors.New("invalid context limit")
			}
			lenCondition := "len " + tier.Operator + " " + strconv.Itoa(*tier.Limit)
			if condition == "" {
				condition = lenCondition
			} else {
				condition = lenCondition + " && " + condition
			}
		}
		if i == len(tiers)-1 {
			if condition != "" {
				return "", errors.New("the last tier must be an unconditional fallback")
			}
			expression = part
		} else {
			if condition == "" {
				return "", errors.New("only the last tier may be unconditional")
			}
			expression = "(" + condition + " ? " + part + " : " + expression + ")"
		}
	}
	return expression, nil
}

func upstreamSalePrice(group model.UpstreamQuoteGroup, quote UpstreamQuote, multiplier float64) (model.UpstreamSaleModel, error) {
	result := model.UpstreamSaleModel{ModelName: quote.LocalModel, UpstreamName: quote.ModelID}
	if result.ModelName == "" {
		result.ModelName = quote.ModelID
	}
	if quote.Kind != "token" && quote.Kind != "fixed" {
		return result, errors.New("this meter is available for quote review")
	}
	if !quote.Confirmed || !quote.UsageVerified {
		return result, errors.New("confirm the cost and endpoint usage before publishing")
	}
	factor, err := upstreamCostFactor(group, quote.Unit)
	if err != nil {
		return result, err
	}
	factor = multiplyUpstreamAmount(factor, multiplier)
	var endpoints []string
	for _, endpoint := range quote.Endpoints {
		if (group.Protocol == "openai" && (endpoint == string(constant.EndpointTypeOpenAI) || endpoint == string(constant.EndpointTypeOpenAIResponse))) ||
			(group.Protocol == "anthropic" && endpoint == string(constant.EndpointTypeAnthropic)) {
			endpoints = append(endpoints, endpoint)
		} else {
			return result, errors.New("the quoted endpoint does not match the group's API protocol")
		}
	}
	if len(endpoints) == 0 {
		return result, errors.New("select a supported API endpoint")
	}
	result.Endpoints = strings.Join(endpoints, ",")
	if quote.Kind == "fixed" {
		if quote.FixedPrice == nil || !validUpstreamAmount(*quote.FixedPrice) || !validUpstreamAmount(*quote.FixedPrice*factor) {
			return result, errors.New("missing or invalid per-call price")
		}
		result.Fixed, result.FixedPrice = true, multiplyUpstreamAmount(*quote.FixedPrice, factor)
		return result, nil
	}
	expression, err := upstreamTokenExpression(quote.Tiers, factor, group.Protocol)
	if err != nil {
		return result, err
	}
	if _, err := billingexpr.CompileFromCache(expression); err != nil {
		return result, err
	}
	result.Expression = expression
	return result, nil
}
