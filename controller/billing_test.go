package controller

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/assert"
)

func TestQuotaToDisplayAmount(t *testing.T) {
	setting := operation_setting.GetGeneralSetting()
	originalDisplayType := setting.QuotaDisplayType
	originalCustomSymbol := setting.CustomCurrencySymbol
	originalCustomRate := setting.CustomCurrencyExchangeRate
	t.Cleanup(func() {
		setting.QuotaDisplayType = originalDisplayType
		setting.CustomCurrencySymbol = originalCustomSymbol
		setting.CustomCurrencyExchangeRate = originalCustomRate
	})

	setting.QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD
	amount, unit := quotaToDisplayAmount(int(common.QuotaPerUnit * 2))
	assert.Equal(t, 2.0, amount)
	assert.Equal(t, "USD", unit)

	setting.QuotaDisplayType = operation_setting.QuotaDisplayTypeTokens
	amount, unit = quotaToDisplayAmount(1234)
	assert.Equal(t, 1234.0, amount)
	assert.Equal(t, "TOKENS", unit)

	setting.QuotaDisplayType = operation_setting.QuotaDisplayTypeCustom
	setting.CustomCurrencySymbol = "CR"
	setting.CustomCurrencyExchangeRate = 2.5
	amount, unit = quotaToDisplayAmount(int(common.QuotaPerUnit * 2))
	assert.Equal(t, 5.0, amount)
	assert.Equal(t, "CR", unit)
}

func TestIsTokenActiveForUsage(t *testing.T) {
	now := time.Now().Unix()
	tests := []struct {
		name  string
		token model.Token
		want  bool
	}{
		{
			name:  "enabled token with quota",
			token: model.Token{Status: common.TokenStatusEnabled, ExpiredTime: -1, RemainQuota: 1},
			want:  true,
		},
		{
			name:  "unlimited token",
			token: model.Token{Status: common.TokenStatusEnabled, ExpiredTime: -1, UnlimitedQuota: true},
			want:  true,
		},
		{
			name:  "exhausted token",
			token: model.Token{Status: common.TokenStatusEnabled, ExpiredTime: -1},
			want:  false,
		},
		{
			name:  "expired token",
			token: model.Token{Status: common.TokenStatusEnabled, ExpiredTime: now - 1, RemainQuota: 1},
			want:  false,
		},
		{
			name:  "disabled token",
			token: model.Token{Status: common.TokenStatusDisabled, ExpiredTime: -1, RemainQuota: 1},
			want:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, isTokenActiveForUsage(&tt.token))
		})
	}
}
