package controller

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestGetPublicModelsTree_ServesFileWithETag(t *testing.T) {
	t.Parallel()

	gin.SetMode(gin.TestMode)

	dir := t.TempDir()
	path := filepath.Join(dir, "models-tree.json")
	payload := []byte(`{"version":1,"object":"models_tree","channels":[]}`)
	require.NoError(t, os.WriteFile(path, payload, 0o644))

	t.Setenv("MODELS_TREE_PATH", path)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/public/models-tree.json", nil)

	GetPublicModelsTree(c)

	require.Equal(t, http.StatusOK, w.Code)
	require.Equal(t, "application/json; charset=utf-8", w.Header().Get("Content-Type"))
	require.Equal(t, "public, max-age=60", w.Header().Get("Cache-Control"))
	require.NotEmpty(t, w.Header().Get("ETag"))
	require.JSONEq(t, string(payload), w.Body.String())

	w2 := httptest.NewRecorder()
	c2, _ := gin.CreateTestContext(w2)
	req2 := httptest.NewRequest(http.MethodGet, "/api/public/models-tree.json", nil)
	req2.Header.Set("If-None-Match", w.Header().Get("ETag"))
	c2.Request = req2

	GetPublicModelsTree(c2)

	require.Equal(t, http.StatusNotModified, w2.Code)
	require.Empty(t, w2.Body.String())
}
