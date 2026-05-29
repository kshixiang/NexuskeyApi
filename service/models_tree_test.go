package service

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestBuildModelsTreeFromAbilities_GroupsAndDedupes(t *testing.T) {
	t.Parallel()

	abilities := []model.AbilityWithChannel{
		{Ability: model.Ability{Model: "gpt-4o"}, ChannelType: constant.ChannelTypeOpenAI},
		{Ability: model.Ability{Model: "gpt-4o-mini"}, ChannelType: constant.ChannelTypeOpenAI},
		{Ability: model.Ability{Model: "gpt-4o"}, ChannelType: constant.ChannelTypeOpenAI},
		{Ability: model.Ability{Model: "claude-3-5-sonnet"}, ChannelType: constant.ChannelTypeAnthropic},
		{Ability: model.Ability{Model: ""}, ChannelType: constant.ChannelTypeOpenAI},
		{Ability: model.Ability{Model: "ignored"}, ChannelType: constant.ChannelTypeUnknown},
	}

	tree := buildModelsTreeFromAbilities(abilities)

	require.Equal(t, dto.ModelsTreeVersion, tree.Version)
	require.Equal(t, "models_tree", tree.Object)
	require.Equal(t, 2, tree.ChannelCount)
	require.Equal(t, 3, tree.ModelCount)
	require.NotEmpty(t, tree.GeneratedAt)

	require.Len(t, tree.Channels, 2)
	require.Equal(t, constant.ChannelTypeOpenAI, tree.Channels[0].Type)
	require.Equal(t, "openai", tree.Channels[0].Key)
	require.Equal(t, "OpenAI", tree.Channels[0].Name)
	require.Equal(t, []string{"gpt-4o", "gpt-4o-mini"}, modelIDs(tree.Channels[0].Models))

	require.Equal(t, constant.ChannelTypeAnthropic, tree.Channels[1].Type)
	require.Equal(t, "anthropic", tree.Channels[1].Key)
	require.Equal(t, []string{"claude-3-5-sonnet"}, modelIDs(tree.Channels[1].Models))
}

func TestChannelTypeKey(t *testing.T) {
	t.Parallel()

	require.Equal(t, "openai", channelTypeKey(constant.ChannelTypeOpenAI))
	require.Equal(t, "anthropic", channelTypeKey(constant.ChannelTypeAnthropic))
	require.Equal(t, "", channelTypeKey(constant.ChannelTypeUnknown))
}

func modelIDs(models []dto.ModelsTreeModel) []string {
	ids := make([]string, 0, len(models))
	for _, m := range models {
		ids = append(ids, m.ID)
	}
	return ids
}
