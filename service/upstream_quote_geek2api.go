package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"maps"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
)

type geek2APIGroup struct {
	ID                   int      `json:"id"`
	Name                 string   `json:"name"`
	Rate                 *float64 `json:"rate_multiplier"`
	ImageRateIndependent bool     `json:"image_rate_independent"`
	ImageRate            *float64 `json:"image_rate_multiplier"`
}

type geek2APIModel struct {
	Name    string          `json:"name"`
	Pricing json.RawMessage `json:"pricing"`
}

type geek2APIPriceWindow struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

type geek2APITimePricing struct {
	Timezone string                        `json:"timezone"`
	Daily    string                        `json:"peak_pricing_windows"`
	Weekly   map[int][]geek2APIPriceWindow `json:"peak_pricing_weekly_windows"`
	Peak     kedayaTier                    `json:"peak"`
	OffPeak  kedayaTier                    `json:"off_peak"`
}

func parseGeek2APIQuotes(raw []byte) ([]UpstreamImportGroup, error) {
	var catalog []struct {
		Platform string          `json:"platform"`
		Groups   []geek2APIGroup `json:"groups"`
		Models   []geek2APIModel `json:"models"`
	}
	if err := common.Unmarshal(raw, &catalog); err != nil {
		return nil, err
	}
	groups := make([]UpstreamImportGroup, 0)
	groupIndices := make(map[int]int)
	modelIndices := make(map[int]map[string]int)
	for _, row := range catalog {
		for _, source := range row.Groups {
			if source.ID <= 0 {
				return nil, fmt.Errorf("Geek2API group %q has no valid ID", source.Name)
			}
			index, exists := groupIndices[source.ID]
			if !exists {
				index = len(groups)
				groupIndices[source.ID] = index
				modelIndices[source.ID] = make(map[string]int)
				groups = append(groups, UpstreamImportGroup{SourceID: strconv.Itoa(source.ID), Name: source.Name})
			}
			group := &groups[index]
			models := modelIndices[source.ID]
			for _, item := range row.Models {
				quote, err := geek2APIQuote(item, source, row.Platform)
				if err != nil {
					return nil, fmt.Errorf("Geek2API group %q model %q: %w", source.Name, item.Name, err)
				}
				key := strings.ToLower(item.Name)
				if previous, duplicate := models[key]; duplicate {
					if !bytes.Equal(group.Quotes[previous].Reference, quote.Reference) {
						return nil, fmt.Errorf("Geek2API group %q has conflicting quotes for %q", source.Name, item.Name)
					}
					continue
				}
				models[key] = len(group.Quotes)
				group.Quotes = append(group.Quotes, quote)
			}
		}
	}
	return groups, nil
}

func geek2APIQuote(item geek2APIModel, group geek2APIGroup, platform string) (UpstreamQuote, error) {
	var price struct {
		kedayaTier
		Mode        string               `json:"billing_mode"`
		Final       bool                 `json:"is_final_price"`
		ImagePrices map[string]float64   `json:"image_prices"`
		TimePricing *geek2APITimePricing `json:"time_pricing"`
	}
	if len(item.Pricing) != 0 {
		if err := common.Unmarshal(item.Pricing, &price); err != nil {
			return UpstreamQuote{}, err
		}
	}
	kind := quoteMeter(price.Mode)
	factor := 1.0
	switch {
	case price.Final:
	case kind == "image" && group.ImageRateIndependent:
		if group.ImageRate != nil {
			factor = *group.ImageRate
		}
	case group.Rate != nil:
		factor = *group.Rate
	}
	if !validUpstreamAmount(factor) {
		return UpstreamQuote{}, fmt.Errorf("invalid price multiplier")
	}
	reference, err := common.Marshal(map[string]any{
		"pricing": item.Pricing, "platform": platform, "group_multiplier": group.Rate, "applied_multiplier": factor,
	})
	if err != nil {
		return UpstreamQuote{}, err
	}
	quote := UpstreamQuote{ModelID: item.Name, Kind: kind, Unit: "usd", Endpoints: quoteEndpoints(platform), Reference: reference}
	switch kind {
	case "token":
		// Geek2API lists token prices per million already.
		if price.TimePricing == nil {
			quote.Tiers = []UpstreamTier{price.kedayaTier.tier(factor)}
			quote.Tiers[0].Name = "base"
		} else {
			quote.Tiers, err = price.TimePricing.tiers(factor)
		}
	case "fixed":
		quote.FixedPrice = scaleQuote(price.Fixed, factor)
	case "image":
		for _, spec := range slices.Sorted(maps.Keys(price.ImagePrices)) {
			amount := multiplyUpstreamAmount(price.ImagePrices[spec], factor)
			quote.Media = append(quote.Media, UpstreamMediaPrice{Spec: spec, Meter: "per_request", Price: &amount})
		}
	}
	return quote, err
}

func (pricing geek2APITimePricing) tiers(factor float64) ([]UpstreamTier, error) {
	var tiers []UpstreamTier
	addPeak := func(period geek2APIPriceWindow, day int) error {
		start, startErr := time.Parse("15:04", strings.TrimSpace(period.Start))
		end, endErr := time.Parse("15:04", strings.TrimSpace(period.End))
		window := &UpstreamWindow{Timezone: pricing.Timezone, Start: start.Hour()*60 + start.Minute(), End: end.Hour()*60 + end.Minute()}
		if strings.TrimSpace(period.End) == "24:00" {
			window.End, endErr = 1440, nil
		}
		if startErr != nil || endErr != nil || (day > 0 && window.Start >= window.End) {
			return fmt.Errorf("invalid peak pricing period %s–%s", period.Start, period.End)
		}
		if _, err := upstreamWindowCondition(window); err != nil {
			return err
		}
		if day > 0 {
			for _, tier := range tiers {
				if tier.Window.Start == window.Start && tier.Window.End == window.End {
					tier.Window.Weekdays = append(tier.Window.Weekdays, day%7)
					return nil
				}
			}
			window.Weekdays = []int{day % 7}
		}
		tier := pricing.Peak.tier(factor)
		tier.Name, tier.Window = "peak", window
		tiers = append(tiers, tier)
		return nil
	}
	if pricing.Weekly != nil {
		for day := 1; day <= 7; day++ {
			for _, period := range pricing.Weekly[day] {
				if err := addPeak(period, day); err != nil {
					return nil, err
				}
			}
		}
	} else if strings.TrimSpace(pricing.Daily) != "" {
		for _, period := range strings.Split(pricing.Daily, ",") {
			start, end, _ := strings.Cut(period, "-")
			if err := addPeak(geek2APIPriceWindow{Start: start, End: end}, 0); err != nil {
				return nil, err
			}
		}
	}
	fallback := pricing.OffPeak.tier(factor)
	fallback.Name = "off_peak"
	return append(tiers, fallback), nil
}
