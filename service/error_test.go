package service

import (
	"context"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/types"
	"github.com/stretchr/testify/require"
)

func TestUpstreamPayloadError(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name, payload, event string
		wantError            bool
	}{
		{"error envelope", `{"error":{"message":"Private upstream message","type":"rate_limit_error","code":"vendor_quota"}}`, "", true},
		{"Claude error event", `{"type":"error","error":{"message":"Private upstream message"}}`, "error", true},
		{"Responses failure", `{"type":"response.failed","response":{"error":{"message":"Private upstream message"}}}`, "", true},
		{"Realtime response failure", `{"type":"response.done","response":{"status":"failed","status_details":{"error":{"message":"Private upstream message"}}}}`, "", true},
		{"named SSE event", `{"message":"Private upstream message"}`, "error", true},
		{"normal model output", `{"choices":[{"delta":{"content":"how to handle an error"}}],"error":null}`, "", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			err := UpstreamPayloadError([]byte(tc.payload), tc.event)
			if !tc.wantError {
				require.Nil(t, err)
				return
			}
			require.NotNil(t, err)
			require.Contains(t, err.Error(), "Private upstream message")
			publicErr := types.NewUpstreamUnavailableError("test-request")
			require.Equal(t, http.StatusServiceUnavailable, publicErr.StatusCode)
			require.Equal(t, types.ErrorCodeUpstreamUnavailable, publicErr.ToOpenAIError().Code)
			require.Contains(t, publicErr.Error(), "test-request")
			require.NotContains(t, publicErr.Error(), "Private upstream message")
		})
	}
}

func TestRelayErrorHandlerIdentifiesUpstreamBalanceErrors(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name      string
		body      string
		isBalance bool
	}{
		{"upstream error type", `{"error":{"message":"Request failed","type":"Insufficient account balance","code":429}}`, true},
		{"upstream error type without a message", `{"error":{"type":"Insufficient account balance","code":429}}`, true},
		{"upstream quota code", `{"error":{"message":"Request failed","code":"insufficient_quota"}}`, true},
		{"plain text balance error", "Insufficient account balance", true},
		{"ordinary rate limit", `{"error":{"message":"Too many requests","code":"rate_limit_exceeded"}}`, false},
	}
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			resp := &http.Response{
				StatusCode: http.StatusTooManyRequests,
				Body:       io.NopCloser(strings.NewReader(tc.body)),
			}
			err := RelayErrorHandler(context.Background(), resp, false)
			require.Equal(t, tc.isBalance, err.IsUpstreamBalanceError())
			require.Equal(t, http.StatusTooManyRequests, err.StatusCode)
		})
	}
}

func TestResetStatusCode(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name             string
		statusCode       int
		statusCodeConfig string
		expectedCode     int
	}{
		{
			name:             "map string value",
			statusCode:       429,
			statusCodeConfig: `{"429":"503"}`,
			expectedCode:     503,
		},
		{
			name:             "map int value",
			statusCode:       429,
			statusCodeConfig: `{"429":503}`,
			expectedCode:     503,
		},
		{
			name:             "skip invalid string value",
			statusCode:       429,
			statusCodeConfig: `{"429":"bad-code"}`,
			expectedCode:     429,
		},
		{
			name:             "skip status code 200",
			statusCode:       200,
			statusCodeConfig: `{"200":503}`,
			expectedCode:     200,
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			newAPIError := &types.NewAPIError{
				StatusCode: tc.statusCode,
			}
			ResetStatusCode(newAPIError, tc.statusCodeConfig)
			require.Equal(t, tc.expectedCode, newAPIError.StatusCode)
		})
	}
}
