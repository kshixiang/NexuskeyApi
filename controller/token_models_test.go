package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type tokenModelsResponse struct {
	Code    bool   `json:"code"`
	Message string `json:"message"`
	Data    struct {
		Object             string   `json:"object"`
		Models             []string `json:"models"`
		ModelLimitsEnabled bool     `json:"model_limits_enabled"`
		Count              int      `json:"count"`
	} `json:"data"`
}

func withSelfUseModeEnabled(t *testing.T) {
	t.Helper()

	original := operation_setting.SelfUseModeEnabled
	operation_setting.SelfUseModeEnabled = true
	t.Cleanup(func() {
		operation_setting.SelfUseModeEnabled = original
	})
}

func setupTokenModelsTest(t *testing.T) (*model.User, *model.Token) {
	t.Helper()
	withSelfUseModeEnabled(t)

	db := setupModelListControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.Token{}))

	user := &model.User{
		Id:       2001,
		Username: "token-models-user",
		Password: "password",
		Group:    "default",
		Status:   common.UserStatusEnabled,
	}
	require.NoError(t, db.Create(user).Error)

	token := &model.Token{
		UserId:      user.Id,
		Key:         "test-token-models-key",
		Status:      common.TokenStatusEnabled,
		Name:        "test-token",
		ExpiredTime: -1,
		Group:       "default",
	}
	require.NoError(t, db.Create(token).Error)

	return user, token
}

func decodeTokenModelsResponse(t *testing.T, recorder *httptest.ResponseRecorder) tokenModelsResponse {
	t.Helper()

	require.Equal(t, http.StatusOK, recorder.Code)
	var payload tokenModelsResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &payload))
	require.True(t, payload.Code)
	require.Equal(t, "ok", payload.Message)
	require.Equal(t, "token_models", payload.Data.Object)
	return payload
}

func TestGetTokenModelsByGroup(t *testing.T) {
	user, token := setupTokenModelsTest(t)
	db := model.DB
	require.NoError(t, db.Create(&[]model.Ability{
		{Group: "default", Model: "zz-group-model-a", ChannelId: 1, Enabled: true},
		{Group: "default", Model: "zz-group-model-b", ChannelId: 1, Enabled: true},
		{Group: "other", Model: "zz-other-group-model", ChannelId: 2, Enabled: true},
	}).Error)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/usage/token/models", nil)
	ctx.Set("id", user.Id)
	ctx.Set("token_key", token.Key)
	require.NoError(t, middleware.SetupContextForToken(ctx, token))

	GetTokenModels(ctx)

	payload := decodeTokenModelsResponse(t, recorder)
	require.Equal(t, 2, payload.Data.Count)
	require.ElementsMatch(t, []string{"zz-group-model-a", "zz-group-model-b"}, payload.Data.Models)
	require.False(t, payload.Data.ModelLimitsEnabled)
}

func TestGetTokenModelsWithModelLimits(t *testing.T) {
	user, token := setupTokenModelsTest(t)
	token.ModelLimitsEnabled = true
	token.ModelLimits = "zz-limit-model-a,zz-limit-model-b,zz-limit-model-c"
	require.NoError(t, model.DB.Save(token).Error)

	db := model.DB
	require.NoError(t, db.Create(&[]model.Ability{
		{Group: "default", Model: "zz-limit-model-a", ChannelId: 1, Enabled: true},
		{Group: "default", Model: "zz-limit-model-b", ChannelId: 1, Enabled: true},
		{Group: "default", Model: "zz-not-in-limit", ChannelId: 1, Enabled: true},
	}).Error)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/usage/token/models", nil)
	ctx.Set("id", user.Id)
	ctx.Set("token_key", token.Key)
	require.NoError(t, middleware.SetupContextForToken(ctx, token))

	GetTokenModels(ctx)

	payload := decodeTokenModelsResponse(t, recorder)
	require.True(t, payload.Data.ModelLimitsEnabled)
	require.Equal(t, 3, payload.Data.Count)
	require.ElementsMatch(t, []string{"zz-limit-model-a", "zz-limit-model-b", "zz-limit-model-c"}, payload.Data.Models)
}

func TestGetTokenModelsHTTPResponse(t *testing.T) {
	_, token := setupTokenModelsTest(t)
	require.NoError(t, model.DB.Create(&[]model.Ability{
		{Group: "default", Model: "zz-http-model", ChannelId: 1, Enabled: true},
	}).Error)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/usage/token/models", nil)
	ctx.Set("token_key", token.Key)

	GetTokenModels(ctx)

	payload := decodeTokenModelsResponse(t, recorder)
	require.Equal(t, 1, payload.Data.Count)
	require.Equal(t, []string{"zz-http-model"}, payload.Data.Models)
}
