package model

import (
	"testing"

	"github.com/QuantumNous/new-api/types"
	"github.com/stretchr/testify/require"
)

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
