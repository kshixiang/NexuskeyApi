package model

import (
	"fmt"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/stretchr/testify/require"
)

func TestGetUsageLogsShowsRecordedUpstreamSaleVersion(t *testing.T) {
	truncateTables(t)
	require.NoError(t, DB.AutoMigrate(&UpstreamQuoteGroup{}, &UpstreamSaleVersion{}))
	group := UpstreamQuoteGroup{ChannelID: 1, SourceGroup: t.Name(), SalesName: "Current sales name"}
	require.NoError(t, DB.Create(&group).Error)
	t.Cleanup(func() {
		DB.Where("group_id = ?", group.ID).Delete(&UpstreamSaleVersion{})
		DB.Delete(&group)
	})

	groupKey := UpstreamSaleGroupKey(group.ID)
	channel := Channel{Name: groupKey, Group: groupKey}
	require.NoError(t, DB.Create(&channel).Error)
	oldVersion := UpstreamSaleVersion{GroupID: group.ID, ChannelID: channel.Id, FinalMultiplier: common.GetPointer(0.9)}
	currentVersion := UpstreamSaleVersion{GroupID: group.ID, FinalMultiplier: common.GetPointer(1.2)}
	require.NoError(t, DB.Create(&oldVersion).Error)
	require.NoError(t, DB.Create(&currentVersion).Error)
	require.NoError(t, DB.Model(&group).Update("active_version", currentVersion.ID).Error)

	legacy := Log{Type: LogTypeConsume, UserId: 1, ChannelId: channel.Id, Group: groupKey, Quota: 123,
		Other: fmt.Sprintf(`{"group_ratio":1,"upstream_sale_version":%d}`, oldVersion.ID)}
	snapshot := legacy
	snapshot.Other = fmt.Sprintf(`{"group_ratio":1,"upstream_sale_version":%d,"sale_group_name":"Name when used","sale_group_multiplier":0.9}`, oldVersion.ID)
	require.NoError(t, DB.Create(&legacy).Error)
	require.NoError(t, DB.Create(&snapshot).Error)

	adminLogs, _, err := GetAllLogs(LogTypeConsume, 0, 0, "", "", "", 0, 10, channel.Id, "", "")
	require.NoError(t, err)
	userLogs, _, err := GetUserLogs(1, LogTypeConsume, 0, 0, "", "", 0, 10, "", "")
	require.NoError(t, err)
	for _, logs := range [][]*Log{adminLogs, userLogs} {
		require.Len(t, logs, 2)
		require.JSONEq(t, snapshot.Other, logs[0].Other)
		require.JSONEq(t, fmt.Sprintf(`{"group_ratio":1,"upstream_sale_version":%d,"sale_group_name":"Current sales name","sale_group_multiplier":0.9}`, oldVersion.ID), logs[1].Other)
		require.Equal(t, groupKey, logs[1].Group)
		require.Equal(t, 123, logs[1].Quota)
	}
}

func TestFormatUserLogsMasksRelayErrors(t *testing.T) {
	t.Parallel()

	balanceError := &Log{
		Type:    LogTypeError,
		Content: "status_code=429, Request failed",
		Other:   `{"error_type":"Insufficient account balance","error_code":"429","status_code":429}`,
	}
	legacyBalanceError := &Log{
		Type:    LogTypeError,
		Content: "status_code=429, Insufficient account balance",
	}
	rateLimit := &Log{
		Type:    LogTypeError,
		Content: "status_code=429, Too many requests",
		Other:   `{"error_type":"openai_error","error_code":"rate_limit_exceeded","status_code":429}`,
	}
	consumption := &Log{
		Type:    LogTypeConsume,
		Content: "completed",
		Other:   `{"violation_fee":true,"upstream_error_type":"vendor_error","upstream_error_code":"vendor_rejection"}`,
	}

	formatUserLogs([]*Log{balanceError, legacyBalanceError, rateLimit, consumption}, 0)

	for _, log := range []*Log{balanceError, legacyBalanceError, rateLimit} {
		require.Equal(t, types.UpstreamUnavailableMessage, log.Content)
		require.JSONEq(t, `{"error_type":"upstream_unavailable","error_code":"upstream_unavailable","status_code":503}`, log.Other)
	}
	require.Equal(t, "completed", consumption.Content)
	require.JSONEq(t, `{"violation_fee":true}`, consumption.Other)
}
