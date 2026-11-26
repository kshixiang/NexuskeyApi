package controller

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestWriteRelayErrorUsesProtocolAfterStreamStarts(t *testing.T) {
	for _, tc := range []struct {
		format types.RelayFormat
		want   string
	}{
		{types.RelayFormatOpenAI, `data: {"error":`},
		{types.RelayFormatOpenAIResponses, "event: error\n"},
		{types.RelayFormatClaude, "event: error\n"},
	} {
		t.Run(string(tc.format), func(t *testing.T) {
			recorder := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(recorder)
			c.Request = httptest.NewRequest(http.MethodPost, "/", nil)
			helper.SetEventStreamHeaders(c)
			c.Writer.WriteHeaderNow()
			writeRelayError(c, tc.format, types.NewUpstreamUnavailableError("request-1"))
			require.Equal(t, http.StatusOK, recorder.Code)
			require.Contains(t, recorder.Body.String(), tc.want)
			require.Contains(t, recorder.Body.String(), string(types.ErrorCodeUpstreamUnavailable))
		})
	}
}

func TestRelayClassifiesProviderAndLocalErrors(t *testing.T) {
	providerError := types.WithOpenAIError(types.OpenAIError{Message: "Provider rate limit", Code: "rate_limit_exceeded"}, http.StatusTooManyRequests)
	require.True(t, isUpstreamRelayError(providerError))
	localError := types.NewErrorWithStatusCode(errors.New("invalid request"), types.ErrorCodeInvalidRequest, http.StatusBadRequest)
	require.False(t, isUpstreamRelayError(localError))
}
