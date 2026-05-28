package ratio_setting

// OfficialModelPricing is pricing resolved from external official presets (basellm, models.dev).
type OfficialModelPricing struct {
	Model                string   `json:"model"`
	MatchedModel         string   `json:"matched_model"`
	Found                bool     `json:"found"`
	Source               string   `json:"source,omitempty"` // basellm | modelsdev
	UsePrice             bool     `json:"use_price"`
	Price                float64  `json:"price,omitempty"`
	Ratio                float64  `json:"ratio,omitempty"`
	CompletionRatio      *float64 `json:"completion_ratio,omitempty"`
	CacheRatio           *float64 `json:"cache_ratio,omitempty"`
	CreateCacheRatio     *float64 `json:"create_cache_ratio,omitempty"`
	ImageRatio           *float64 `json:"image_ratio,omitempty"`
	AudioRatio           *float64 `json:"audio_ratio,omitempty"`
	AudioCompletionRatio *float64 `json:"audio_completion_ratio,omitempty"`
}

// Float64Ptr returns a pointer to v (for optional ratio fields in API responses).
func Float64Ptr(v float64) *float64 {
	return &v
}

// BuiltinModelPricing is kept for API compatibility.
type BuiltinModelPricing = OfficialModelPricing
