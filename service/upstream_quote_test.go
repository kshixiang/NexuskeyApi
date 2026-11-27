package service

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestGeek2APIQuoteSnapshot(t *testing.T) {
	snapshot := []byte(`{"code":0,"data":[
		{"platform":"openai","groups":[{"id":24,"name":"Shared","rate_multiplier":0.6}],"models":[
			{"name":"gpt-model","pricing":{"billing_mode":"token","input_price":5,"output_price":0,"cache_read_price":0.5}},
			{"name":"gpt-model","pricing":{"billing_mode":"token","input_price":5,"output_price":0,"cache_read_price":0.5}}
		]},
		{"platform":"gemini","groups":[{"id":24,"name":"Shared","rate_multiplier":0.6}],"models":[
			{"name":"gemini-model","pricing":{"billing_mode":"token","input_price":2,"output_price":12,"is_final_price":true}},
			{"name":"unpriced","pricing":null}
		]},
		{"platform":"deepseek","groups":[{"id":98,"name":"DeepSeek","rate_multiplier":0.7}],"models":[
			{"name":"deepseek-model","pricing":{"billing_mode":"token","input_price":1,"output_price":4,"time_pricing":{
				"timezone":"UTC","peak_pricing_weekly_windows":{"1":[{"start":"09:00","end":"12:00"}],"7":[{"start":"09:00","end":"12:00"}]},
				"off_peak":{"input_price":1,"output_price":4,"cache_write_price":0},
				"peak":{"input_price":2,"output_price":8,"cache_write_price":0}
			}}}
		]}
	]}`)
	imported, err := ParseUpstreamQuoteSnapshot("geek2api", snapshot)
	require.NoError(t, err)
	require.Len(t, imported.Groups, 2)
	shared := imported.Groups[0]
	require.Equal(t, "24", shared.SourceID)
	require.Len(t, shared.Quotes, 3)
	require.Equal(t, 3.0, *shared.Quotes[0].Tiers[0].Input)
	require.Equal(t, 0.0, *shared.Quotes[0].Tiers[0].Output)
	require.Equal(t, 0.3, *shared.Quotes[0].Tiers[0].CacheRead)
	require.Equal(t, 2.0, *shared.Quotes[1].Tiers[0].Input)
	groupRate, appliedRate := upstreamQuoteMultipliers(shared.Quotes[1])
	require.Equal(t, 0.6, *groupRate)
	require.Equal(t, 1.0, *appliedRate)
	require.Equal(t, "unknown", shared.Quotes[2].Kind)
	require.False(t, shared.Quotes[0].Confirmed)

	tiers := imported.Groups[1].Quotes[0].Tiers
	require.Len(t, tiers, 2)
	require.Equal(t, &UpstreamWindow{Timezone: "UTC", Start: 540, End: 720, Weekdays: []int{1, 0}}, tiers[0].Window)
	require.Equal(t, 1.4, *tiers[0].Input)
	require.Equal(t, 0.0, *tiers[0].CacheWrite)
	require.Nil(t, tiers[1].Window)
	require.Equal(t, 0.7, *tiers[1].Input)
}

func TestStringQuoteModelMultipliers(t *testing.T) {
	snapshot := []byte(`{"code":0,"data":{"model_pricing_sections":[{"source_name":"OpenAI","rows":[
		{"models":["gpt-astra"],"billing_mode":"token","price_multiplier":0.2,"effective_input_usd_per_mtok":1.6},
		{"models":["gpt-luna"],"billing_mode":"token","price_multiplier":1.8},
		{"models":["gpt-unpriced"],"billing_mode":"token"}
	]}]}}`)
	imported, err := ParseUpstreamQuoteSnapshot("string", snapshot)
	require.NoError(t, err)
	require.Len(t, imported.Groups, 1)
	quotes := imported.Groups[0].Quotes
	require.Len(t, quotes, 3)
	for index, want := range []float64{0.2, 1.8} {
		group, model := upstreamQuoteMultipliers(quotes[index])
		require.Nil(t, group)
		require.NotNil(t, model)
		require.Equal(t, want, *model)
	}
	_, missing := upstreamQuoteMultipliers(quotes[2])
	require.Nil(t, missing)
	require.Len(t, quotes[0].Tiers, 1)
	require.NotNil(t, quotes[0].Tiers[0].Input)
	require.Equal(t, 1.6, *quotes[0].Tiers[0].Input)
}

func TestStringQuoteStoredSnapshotPricing(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { require.NoError(t, sqlDB.Close()) })
	require.NoError(t, db.AutoMigrate(&model.UpstreamQuoteGroup{}, &model.UpstreamQuoteModel{},
		&model.UpstreamQuoteVersion{}, &model.UpstreamSaleVersion{}))

	group := model.UpstreamQuoteGroup{ChannelID: 1, SourceGroup: "openai:2", Protocol: "openai", Multiplier: 1}
	require.NoError(t, db.Create(&group).Error)
	// Seed the JSON shape saved before String AI multipliers were exposed.
	version := model.UpstreamQuoteVersion{GroupID: group.ID, Snapshot: `{
		"model_id":"gpt-astra","kind":"token","unit":"usd","confirmed":true,"usage_verified":true,
		"endpoints":["openai"],"tiers":[{"name":"base","input":1.6,"output":8}],
		"reference":{"row":{"price_multiplier":0.2,"input_usd_per_mtok":8,"output_usd_per_mtok":40,
			"effective_input_usd_per_mtok":1.6,"effective_output_usd_per_mtok":8},"credits_fx_rate":1}
	}`}
	require.NoError(t, db.Create(&version).Error)
	require.NoError(t, db.Create(&model.UpstreamQuoteModel{
		GroupID: group.ID, ModelID: "gpt-astra", QuoteVersion: version.ID,
	}).Error)

	for _, tc := range []struct {
		name   string
		markup float64
		want   float64
	}{
		{name: "at upstream cost", markup: 1, want: 0.24},
		{name: "with local markup", markup: 1.5, want: 0.36},
	} {
		t.Run(tc.name, func(t *testing.T) {
			preview, err := previewUpstreamGroup(db, group.ID, &tc.markup)
			require.NoError(t, err)
			require.Len(t, preview.Quotes, 1)
			item := preview.Quotes[0]
			require.Equal(t, version.ID, item.QuoteVersion)
			require.NotNil(t, item.UpstreamMultiplier)
			require.Equal(t, 0.2, *item.UpstreamMultiplier)
			require.Empty(t, item.Error)
			require.NotNil(t, item.Sale)
			amount, _, err := billingexpr.RunExpr(item.Sale.Expression, billingexpr.TokenParams{
				P: 100_000, C: 10_000, Len: 100_000,
			})
			require.NoError(t, err)
			require.InDelta(t, tc.want, amount/1e6, 1e-9)
		})
	}
}

func TestDefaultUpstreamGroupProtocol(t *testing.T) {
	haiku := UpstreamQuote{ModelID: "claude-haiku-4-5-20251001", Kind: "token", Endpoints: []string{"anthropic"}}
	openAI := UpstreamQuote{Kind: "token", Endpoints: []string{"openai", "openai-response"}}
	tests := []struct {
		name   string
		quotes []UpstreamQuote
		want   string
	}{
		{"Anthropic quotes", []UpstreamQuote{haiku}, "anthropic"},
		{"OpenAI quotes", []UpstreamQuote{openAI}, "openai"},
		{"mixed protocols", []UpstreamQuote{haiku, openAI}, "openai"},
		{"missing endpoint", []UpstreamQuote{haiku, {Kind: "fixed"}}, "openai"},
		{"media alongside Claude", []UpstreamQuote{{Kind: "image"}, haiku}, "anthropic"},
		{"no quotes", nil, "openai"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := defaultUpstreamGroupProtocol(tt.quotes); got != tt.want {
				t.Errorf("default protocol = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestSaveUpstreamImportRepairsExistingAnthropicGroup(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	previousDB := model.DB
	model.DB = db
	t.Cleanup(func() {
		model.DB = previousDB
		require.NoError(t, sqlDB.Close())
	})
	require.NoError(t, db.AutoMigrate(&model.UpstreamQuoteChannel{}, &model.UpstreamQuoteGroup{},
		&model.UpstreamQuoteModel{}, &model.UpstreamQuoteVersion{}))

	haiku := UpstreamQuote{ModelID: "claude-haiku-4-5-20251001", Kind: "token", Endpoints: []string{"anthropic"}}
	openAI := UpstreamQuote{ModelID: "gpt-4.1", Kind: "token", Endpoints: []string{"openai"}}
	input := UpstreamImport{Source: "kedaya", Groups: []UpstreamImportGroup{
		{Name: "Claude only", Quotes: []UpstreamQuote{haiku}},
		{Name: "Mixed", Quotes: []UpstreamQuote{haiku, openAI}},
	}}
	channel, err := SaveUpstreamImport(input)
	require.NoError(t, err)
	// Simulate groups created before the importer inferred their protocol.
	require.NoError(t, db.Model(&model.UpstreamQuoteGroup{}).Where("channel_id = ?", channel.ID).Update("protocol", "openai").Error)

	input.ChannelID = channel.ID
	input.Groups[1].Quotes = []UpstreamQuote{haiku}
	_, err = SaveUpstreamImport(input)
	require.NoError(t, err)
	var groups []model.UpstreamQuoteGroup
	require.NoError(t, db.Where("channel_id = ?", channel.ID).Order("id").Find(&groups).Error)
	require.Len(t, groups, 2)
	require.Equal(t, "anthropic", groups[0].Protocol)
	require.Equal(t, 2, groups[0].Revision)
	require.Equal(t, "openai", groups[1].Protocol, "the mixed group still retains its previously imported OpenAI quote")
}
