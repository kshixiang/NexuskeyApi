package model

import (
	"strings"
	"sync"
)

var pricingMetadataLock sync.Mutex

// 简化的供应商映射规则
var defaultVendorRules = map[string]string{
	"gpt":      "OpenAI",
	"dall-e":   "OpenAI",
	"whisper":  "OpenAI",
	"o1":       "OpenAI",
	"o3":       "OpenAI",
	"claude":   "Anthropic",
	"gemini":   "Google",
	"moonshot": "Moonshot",
	"kimi":     "Moonshot",
	"chatglm":  "智谱",
	"glm-":     "智谱",
	"qwen":     "阿里巴巴",
	"deepseek": "DeepSeek",
	"abab":     "MiniMax",
	"ernie":    "百度",
	"spark":    "讯飞",
	"hunyuan":  "腾讯",
	"command":  "Cohere",
	"@cf/":     "Cloudflare",
	"360":      "360",
	"yi":       "零一万物",
	"jina":     "Jina",
	"mistral":  "Mistral",
	"grok":     "xAI",
	"llama":    "Meta",
	"doubao":   "字节跳动",
	"kling":    "快手",
	"jimeng":   "即梦",
	"vidu":     "Vidu",
}

// 供应商默认图标映射
var defaultVendorIcons = map[string]string{
	"OpenAI":     "OpenAI",
	"Anthropic":  "Claude.Color",
	"Google":     "Gemini.Color",
	"Moonshot":   "Moonshot",
	"智谱":         "Zhipu.Color",
	"阿里巴巴":       "Qwen.Color",
	"DeepSeek":   "DeepSeek.Color",
	"MiniMax":    "Minimax.Color",
	"百度":         "Wenxin.Color",
	"讯飞":         "Spark.Color",
	"腾讯":         "Hunyuan.Color",
	"Cohere":     "Cohere.Color",
	"Cloudflare": "Cloudflare.Color",
	"360":        "Ai360.Color",
	"零一万物":       "Yi.Color",
	"Jina":       "Jina",
	"Mistral":    "Mistral.Color",
	"xAI":        "XAI",
	"Meta":       "Ollama",
	"字节跳动":       "Doubao.Color",
	"快手":         "Kling.Color",
	"即梦":         "Jimeng.Color",
	"Vidu":       "Vidu",
	"微软":         "AzureAI",
	"Microsoft":  "AzureAI",
	"Azure":      "AzureAI",
}

// loadPricingMetadata applies the same metadata and vendor rules to ordinary and published pricing.
func loadPricingMetadata(modelNames []string) (map[string]*Model, []PricingVendor, error) {
	// Serialize default vendor creation across pricing requests and cache refreshes.
	pricingMetadataLock.Lock()
	defer pricingMetadataLock.Unlock()

	var allMeta []Model
	if err := DB.Find(&allMeta).Error; err != nil {
		return nil, nil, err
	}
	metaMap := make(map[string]*Model)
	prefixList := make([]*Model, 0)
	suffixList := make([]*Model, 0)
	containsList := make([]*Model, 0)
	for i := range allMeta {
		meta := &allMeta[i]
		switch meta.NameRule {
		case NameRuleExact:
			metaMap[meta.ModelName] = meta
		case NameRulePrefix:
			prefixList = append(prefixList, meta)
		case NameRuleSuffix:
			suffixList = append(suffixList, meta)
		case NameRuleContains:
			containsList = append(containsList, meta)
		}
	}
	for _, rule := range []struct {
		models []*Model
		match  func(string, string) bool
	}{
		{prefixList, strings.HasPrefix},
		{suffixList, strings.HasSuffix},
		{containsList, strings.Contains},
	} {
		for _, meta := range rule.models {
			for _, modelName := range modelNames {
				if _, exists := metaMap[modelName]; !exists && rule.match(modelName, meta.ModelName) {
					metaMap[modelName] = meta
				}
			}
		}
	}

	var vendors []Vendor
	if err := DB.Find(&vendors).Error; err != nil {
		return nil, nil, err
	}
	vendorMap := make(map[int]*Vendor)
	for i := range vendors {
		vendorMap[vendors[i].Id] = &vendors[i]
	}
	if err := initDefaultVendorMapping(metaMap, vendorMap, modelNames); err != nil {
		return nil, nil, err
	}
	pricingVendors := make([]PricingVendor, 0, len(vendorMap))
	for _, vendor := range vendorMap {
		pricingVendors = append(pricingVendors, PricingVendor{
			ID: vendor.Id, Name: vendor.Name, Description: vendor.Description, Icon: vendor.Icon,
		})
	}
	return metaMap, pricingVendors, nil
}

// initDefaultVendorMapping fills missing vendor associations while preserving configured vendors.
func initDefaultVendorMapping(metaMap map[string]*Model, vendorMap map[int]*Vendor, modelNames []string) error {
	for _, modelName := range modelNames {
		meta, exists := metaMap[modelName]
		if exists {
			if _, valid := vendorMap[meta.VendorID]; valid {
				continue
			}
			// A wildcard rule can match models belonging to different vendors.
			copy := *meta
			meta = &copy
		} else {
			meta = &Model{ModelName: modelName, Status: 1, NameRule: NameRuleExact}
		}

		// 匹配供应商
		vendorID := 0
		modelLower := strings.ToLower(modelName)
		for pattern, vendorName := range defaultVendorRules {
			if strings.Contains(modelLower, pattern) {
				var err error
				vendorID, err = getOrCreateVendor(vendorName, vendorMap)
				if err != nil {
					return err
				}
				break
			}
		}

		meta.VendorID = vendorID
		metaMap[modelName] = meta
	}
	return nil
}

// 查找或创建供应商
func getOrCreateVendor(vendorName string, vendorMap map[int]*Vendor) (int, error) {
	// 查找现有供应商
	for id, vendor := range vendorMap {
		if vendor.Name == vendorName {
			return id, nil
		}
	}

	// 创建新供应商
	newVendor := &Vendor{
		Name:   vendorName,
		Status: 1,
		Icon:   getDefaultVendorIcon(vendorName),
	}

	if err := newVendor.Insert(); err != nil {
		return 0, err
	}

	vendorMap[newVendor.Id] = newVendor
	return newVendor.Id, nil
}

// 获取供应商默认图标
func getDefaultVendorIcon(vendorName string) string {
	if icon, exists := defaultVendorIcons[vendorName]; exists {
		return icon
	}
	return ""
}
