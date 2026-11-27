package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestAbortWithOpenAiMessageHidesServerErrorDetails(t *testing.T) {
	for _, path := range []string{"/v1/chat/completions", "/v1/messages", "/v1beta/models/test:generateContent"} {
		for _, message := range []string{
			"system cpu overloaded (current: 92.4%, threshold: 90%)",
			"system memory overloaded (current: 92.4%, threshold: 90%)",
			"system disk overloaded (current: 92.4%, threshold: 90%)",
			"private channel selection failure",
		} {
			t.Run(path+"/"+message, func(t *testing.T) {
				recorder := httptest.NewRecorder()
				c, _ := gin.CreateTestContext(recorder)
				c.Request = httptest.NewRequest(http.MethodPost, path, nil)
				c.Set(common.RequestIdKey, "0fac886f50ef44c08ebdc72c90ebf5bf")

				abortWithOpenAiMessage(c, http.StatusServiceUnavailable, message, "system_cpu_overloaded")

				require.True(t, c.IsAborted())
				require.Equal(t, http.StatusServiceUnavailable, recorder.Code)
				require.Contains(t, recorder.Body.String(), types.UpstreamUnavailableMessage)
				require.Contains(t, recorder.Body.String(), "0fac886f50ef44c08ebdc72c90ebf5bf")
				require.Contains(t, recorder.Body.String(), string(types.ErrorCodeUpstreamUnavailable))
				require.NotContains(t, recorder.Body.String(), message)
				require.NotContains(t, recorder.Body.String(), "system_cpu_overloaded")
				if path == "/v1/messages" {
					require.Contains(t, recorder.Body.String(), `"type":"error"`)
				}
			})
		}
	}
}

func TestAbortWithOpenAiMessagePreservesClientError(t *testing.T) {
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)

	abortWithOpenAiMessage(c, http.StatusBadRequest, "Model name is required", types.ErrorCodeInvalidRequest)

	require.True(t, c.IsAborted())
	require.Equal(t, http.StatusBadRequest, recorder.Code)
	require.Contains(t, recorder.Body.String(), "Model name is required")
	require.Contains(t, recorder.Body.String(), string(types.ErrorCodeInvalidRequest))
}
