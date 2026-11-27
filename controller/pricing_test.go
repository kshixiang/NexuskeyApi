package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestGetPricingPublishedModelVendors(t *testing.T) {
	previousDB, previousLogDB := model.DB, model.LOG_DB
	db := setupModelListControllerTestDB(t)
	model.InvalidatePricingCache()
	t.Cleanup(func() {
		model.InvalidatePricingCache()
		model.DB, model.LOG_DB = previousDB, previousLogDB
	})
	require.NoError(t, db.AutoMigrate(&model.UpstreamQuoteGroup{}, &model.UpstreamSaleVersion{}, &model.UpstreamSaleModel{}))

	customVendor := model.Vendor{Name: "Custom Vendor", Icon: "Custom"}
	require.NoError(t, db.Create(&customVendor).Error)
	require.NoError(t, db.Create(&[]model.Model{
		{ModelName: "claude-metadata", Description: "Claude description", Icon: "Claude", Tags: "chat"},
		{ModelName: "custom-model", VendorID: customVendor.Id},
		{ModelName: "hosted-", NameRule: model.NameRulePrefix, VendorID: customVendor.Id},
		{ModelName: "-shared", NameRule: model.NameRuleSuffix},
		{ModelName: "claude-dangling", VendorID: 99999},
	}).Error)

	// Warm the ordinary pricing cache before any upstream models are published.
	ordinaryChannel := model.Channel{Status: common.ChannelStatusEnabled}
	require.NoError(t, db.Create(&ordinaryChannel).Error)
	require.NoError(t, db.Create(&model.Ability{
		Model: "gpt-legacy", Group: "default", ChannelId: ordinaryChannel.Id, Enabled: true,
	}).Error)
	require.NotEmpty(t, model.GetPricing())
	require.NotEmpty(t, model.GetVendors())

	group := model.UpstreamQuoteGroup{SalesName: "Published group"}
	require.NoError(t, db.Create(&group).Error)
	channel := model.Channel{Status: common.ChannelStatusEnabled}
	require.NoError(t, db.Create(&channel).Error)
	version := model.UpstreamSaleVersion{GroupID: group.ID, ChannelID: channel.Id, FinalMultiplier: common.GetPointer(0.8)}
	require.NoError(t, db.Create(&version).Error)
	require.NoError(t, db.Model(&group).Update("active_version", version.ID).Error)

	cases := []struct {
		modelName string
		vendor    string
		icon      string
	}{
		{"claude-haiku-4.5", "Anthropic", "Claude.Color"},
		{"deepseek-flash", "DeepSeek", "DeepSeek.Color"},
		{"gpt-6-sol", "OpenAI", "OpenAI"},
		{"o3-mini", "OpenAI", "OpenAI"},
		{"gemini-pro", "Google", "Gemini.Color"},
		{"qwen-plus", "阿里巴巴", "Qwen.Color"},
		{"claude-metadata", "Anthropic", "Claude.Color"},
		{"claude-dangling", "Anthropic", "Claude.Color"},
		{"custom-model", "Custom Vendor", "Custom"},
		{"hosted-claude-custom", "Custom Vendor", "Custom"},
		{"claude-shared", "Anthropic", "Claude.Color"},
		{"gemini-shared", "Google", "Gemini.Color"},
		{"unknown-model", "", ""},
	}
	for _, tc := range cases {
		require.NoError(t, db.Create(&model.UpstreamSaleModel{
			VersionID: version.ID, ModelName: tc.modelName, Fixed: true, FixedPrice: 0.25, Endpoints: "openai",
		}).Error)
	}
	expression := `tier("base", p * 3 + c * 15)`
	require.NoError(t, db.Create(&model.UpstreamSaleModel{
		VersionID: version.ID, ModelName: "claude-tiered", Expression: expression, Endpoints: "anthropic",
	}).Error)

	// Both the initial response and a repeat request must include newly inferred vendors.
	for request := 0; request < 2; request++ {
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Request = httptest.NewRequest(http.MethodGet, "/api/pricing", nil)
		GetPricing(ctx)
		require.Equal(t, http.StatusOK, recorder.Code)
		var response struct {
			Success bool                  `json:"success"`
			Data    []model.Pricing       `json:"data"`
			Vendors []model.PricingVendor `json:"vendors"`
		}
		require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
		require.True(t, response.Success)
		vendors := make(map[int]model.PricingVendor)
		for _, vendor := range response.Vendors {
			vendors[vendor.ID] = vendor
		}
		prices := pricingByModelName(response.Data)
		for _, tc := range cases {
			price, ok := prices[tc.modelName]
			require.True(t, ok, tc.modelName)
			require.Equal(t, tc.vendor, vendors[price.VendorID].Name, tc.modelName)
			require.Equal(t, tc.icon, vendors[price.VendorID].Icon, tc.modelName)
			require.Equal(t, model.UpstreamSaleGroupKey(group.ID), price.SaleGroup)
			require.Equal(t, "Published group", price.SaleGroupName)
			require.Equal(t, common.GetPointer(0.8), price.SaleGroupMultiplier)
			require.Equal(t, 0.25, price.ModelPrice)
			require.Equal(t, 1, price.QuotaType)
		}
		require.Equal(t, "Claude description", prices["claude-metadata"].Description)
		require.Equal(t, "Claude", prices["claude-metadata"].Icon)
		require.Equal(t, "chat", prices["claude-metadata"].Tags)
		require.Equal(t, "OpenAI", vendors[prices["gpt-legacy"].VendorID].Name)
		require.Equal(t, "Anthropic", vendors[prices["claude-tiered"].VendorID].Name)
		require.Equal(t, "tiered_expr", prices["claude-tiered"].BillingMode)
		require.Equal(t, expression, prices["claude-tiered"].BillingExpr)
	}
	for _, name := range []string{"Anthropic", "OpenAI", "DeepSeek", "Google", "阿里巴巴"} {
		var count int64
		require.NoError(t, db.Model(&model.Vendor{}).Where("name = ?", name).Count(&count).Error)
		require.EqualValues(t, 1, count, name)
	}
}
