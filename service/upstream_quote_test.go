package service

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

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
