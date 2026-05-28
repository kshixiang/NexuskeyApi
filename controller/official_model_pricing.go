package controller

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

const (
	basellmOfficialRatioPath   = "/llm-metadata/api/newapi/ratio_config-v1-base.json"
	officialPricingFetchTimeout = 15 * time.Second
	officialPricingCacheTTL     = 6 * time.Hour
)

var (
	basellmOfficialRatioURL = strings.TrimRight(officialRatioPresetBaseURL, "/") + basellmOfficialRatioPath
	modelsDevOfficialAPIURL = strings.TrimRight(modelsDevPresetBaseURL, "/") + modelsDevPath

	officialPricingClient     = &http.Client{Timeout: officialPricingFetchTimeout}
	officialPricingCacheMu    sync.Mutex
	modelsDevPricingCache     officialPricingHTTPPayload
	basellmPricingCache       officialPricingHTTPPayload
)

type officialPricingHTTPPayload struct {
	body      []byte
	fetchedAt time.Time
}

func (p *officialPricingHTTPPayload) fresh() bool {
	return len(p.body) > 0 && time.Since(p.fetchedAt) < officialPricingCacheTTL
}

func fetchOfficialPricingJSON(ctx context.Context, url string, cache *officialPricingHTTPPayload) ([]byte, error) {
	officialPricingCacheMu.Lock()
	if cache.fresh() {
		body := append([]byte(nil), cache.body...)
		officialPricingCacheMu.Unlock()
		return body, nil
	}
	officialPricingCacheMu.Unlock()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := officialPricingClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status: %s", resp.Status)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxRatioConfigBytes))
	if err != nil {
		return nil, err
	}
	if len(body) == 0 {
		return nil, fmt.Errorf("empty response body")
	}

	officialPricingCacheMu.Lock()
	cache.body = append([]byte(nil), body...)
	cache.fetchedAt = time.Now()
	officialPricingCacheMu.Unlock()

	return body, nil
}

func modelLookupKeys(model string) []string {
	model = strings.TrimSpace(model)
	if model == "" {
		return nil
	}
	formatted := ratio_setting.FormatMatchingModelName(model)
	if formatted == model {
		return []string{model}
	}
	return []string{model, formatted}
}

func lookupFloatInMap(data map[string]any, keys []string) (float64, string, bool) {
	for _, key := range keys {
		if value, ok := asFloat64(data[key]); ok {
			return value, key, true
		}
	}
	return 0, "", false
}

func lookupModelInRatioData(model, source string, data map[string]any) ratio_setting.OfficialModelPricing {
	keys := modelLookupKeys(model)
	formatted := ratio_setting.FormatMatchingModelName(model)
	result := ratio_setting.OfficialModelPricing{
		Model:        strings.TrimSpace(model),
		MatchedModel: formatted,
		Source:       source,
	}

	if len(keys) == 0 {
		return result
	}

	if priceMap := valueMap(data["model_price"]); priceMap != nil {
		if price, matched, ok := lookupFloatInMap(priceMap, keys); ok {
			result.Found = true
			result.UsePrice = true
			result.Price = price
			result.MatchedModel = matched
			return result
		}
	}

	ratioMap := valueMap(data["model_ratio"])
	if ratioMap == nil {
		return result
	}

	ratio, matched, ok := lookupFloatInMap(ratioMap, keys)
	if !ok {
		return result
	}

	result.Found = true
	result.MatchedModel = matched
	result.Ratio = ratio

	if completionMap := valueMap(data["completion_ratio"]); completionMap != nil {
		if value, _, ok := lookupFloatInMap(completionMap, []string{matched}); ok {
			result.CompletionRatio = ratio_setting.Float64Ptr(value)
		}
	}
	if cacheMap := valueMap(data["cache_ratio"]); cacheMap != nil {
		if value, _, ok := lookupFloatInMap(cacheMap, []string{matched}); ok {
			result.CacheRatio = ratio_setting.Float64Ptr(value)
		}
	}
	if createCacheMap := valueMap(data["create_cache_ratio"]); createCacheMap != nil {
		if value, _, ok := lookupFloatInMap(createCacheMap, []string{matched}); ok {
			result.CreateCacheRatio = ratio_setting.Float64Ptr(value)
		}
	}
	if imageMap := valueMap(data["image_ratio"]); imageMap != nil {
		if value, _, ok := lookupFloatInMap(imageMap, []string{matched}); ok {
			result.ImageRatio = ratio_setting.Float64Ptr(value)
		}
	}
	if audioMap := valueMap(data["audio_ratio"]); audioMap != nil {
		if value, _, ok := lookupFloatInMap(audioMap, []string{matched}); ok {
			result.AudioRatio = ratio_setting.Float64Ptr(value)
		}
	}
	if audioCompletionMap := valueMap(data["audio_completion_ratio"]); audioCompletionMap != nil {
		if value, _, ok := lookupFloatInMap(audioCompletionMap, []string{matched}); ok {
			result.AudioCompletionRatio = ratio_setting.Float64Ptr(value)
		}
	}

	return result
}

func parseBasellmRatioConfig(body []byte) (map[string]any, error) {
	var wrapped struct {
		Success bool            `json:"success"`
		Data    json.RawMessage `json:"data"`
		Message string          `json:"message"`
	}
	if err := common.DecodeJson(bytes.NewReader(body), &wrapped); err == nil && wrapped.Data != nil {
		var type1Data map[string]any
		if err := common.Unmarshal(wrapped.Data, &type1Data); err == nil {
			return type1Data, nil
		}
	}

	var direct map[string]any
	if err := common.DecodeJson(bytes.NewReader(body), &direct); err != nil {
		return nil, fmt.Errorf("failed to decode basellm ratio config: %w", err)
	}
	return direct, nil
}

func lookupBasellmOfficialModelPricing(ctx context.Context, model string) (ratio_setting.OfficialModelPricing, error) {
	body, err := fetchOfficialPricingJSON(ctx, basellmOfficialRatioURL, &basellmPricingCache)
	if err != nil {
		return ratio_setting.OfficialModelPricing{Model: model}, err
	}

	data, err := parseBasellmRatioConfig(body)
	if err != nil {
		return ratio_setting.OfficialModelPricing{Model: model}, err
	}

	return lookupModelInRatioData(model, "basellm", data), nil
}

func lookupModelsDevModel(model string, upstreamData map[string]modelsDevProvider) (modelsDevCandidate, string, bool) {
	keys := modelLookupKeys(model)
	if len(keys) == 0 {
		return modelsDevCandidate{}, "", false
	}

	providers := make([]string, 0, len(upstreamData))
	for provider := range upstreamData {
		providers = append(providers, provider)
	}
	sort.Strings(providers)

	var selected modelsDevCandidate
	var matchedName string
	found := false

	for _, provider := range providers {
		providerData := upstreamData[provider]
		for _, key := range keys {
			modelData, ok := providerData.Models[key]
			if !ok {
				continue
			}
			candidate, ok := buildModelsDevCandidate(provider, modelData.Cost)
			if !ok {
				continue
			}
			if !found || shouldReplaceModelsDevCandidate(selected, candidate) {
				selected = candidate
				matchedName = key
				found = true
			}
		}
	}

	return selected, matchedName, found
}

func modelsDevCandidateToOfficial(model, matched string, candidate modelsDevCandidate) ratio_setting.OfficialModelPricing {
	result := ratio_setting.OfficialModelPricing{
		Model:        model,
		MatchedModel: matched,
		Found:        true,
		Source:       "modelsdev",
	}

	if candidate.Input == 0 {
		result.Ratio = 0
		return result
	}

	result.Ratio = roundRatioValue(candidate.Input * float64(ratio_setting.USD) / modelsDevInputCostRatioBase)

	if candidate.Output != nil {
		completionRatio := roundRatioValue(*candidate.Output / candidate.Input)
		result.CompletionRatio = ratio_setting.Float64Ptr(completionRatio)
	}
	if candidate.CacheRead != nil {
		cacheRatio := roundRatioValue(*candidate.CacheRead / candidate.Input)
		result.CacheRatio = ratio_setting.Float64Ptr(cacheRatio)
	}

	return result
}

func lookupModelsDevOfficialModelPricing(ctx context.Context, model string) (ratio_setting.OfficialModelPricing, error) {
	body, err := fetchOfficialPricingJSON(ctx, modelsDevOfficialAPIURL, &modelsDevPricingCache)
	if err != nil {
		return ratio_setting.OfficialModelPricing{Model: model}, err
	}

	converted, err := convertModelsDevToRatioData(bytes.NewReader(body))
	if err != nil {
		return ratio_setting.OfficialModelPricing{Model: model}, err
	}

	// Re-parse for candidate metadata (provider-level costs).
	var upstreamData map[string]modelsDevProvider
	if err := common.DecodeJson(bytes.NewReader(body), &upstreamData); err != nil {
		return ratio_setting.OfficialModelPricing{Model: model}, err
	}

	candidate, matched, ok := lookupModelsDevModel(model, upstreamData)
	if ok {
		return modelsDevCandidateToOfficial(model, matched, candidate), nil
	}

	// Fallback to converted ratio maps if candidate selection failed but maps contain the model.
	result := lookupModelInRatioData(model, "modelsdev", converted)
	return result, nil
}

func resolveOfficialModelPricing(ctx context.Context, model, source string) (ratio_setting.OfficialModelPricing, error) {
	model = strings.TrimSpace(model)
	if model == "" {
		return ratio_setting.OfficialModelPricing{}, fmt.Errorf("model is required")
	}

	source = strings.ToLower(strings.TrimSpace(source))
	switch source {
	case "", "auto":
		if pricing, err := lookupBasellmOfficialModelPricing(ctx, model); err == nil && pricing.Found {
			return pricing, nil
		}
		return lookupModelsDevOfficialModelPricing(ctx, model)
	case "basellm":
		return lookupBasellmOfficialModelPricing(ctx, model)
	case "modelsdev", "models.dev":
		return lookupModelsDevOfficialModelPricing(ctx, model)
	default:
		return ratio_setting.OfficialModelPricing{}, fmt.Errorf("unsupported source: %s", source)
	}
}
