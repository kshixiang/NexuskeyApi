package service

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/types"
)

func TestCalculateFixedTokenQuotaUsesInputOutputAndCachePrices(t *testing.T) {
	quota := calculateFixedTokenQuota(700_000, 100_000, 300_000, types.FixedTokenPrice{
		Input:  2,
		Output: 8,
		Cache:  0.5,
	}, 1)

	if quota != int(2.35*common.QuotaPerUnit) {
		t.Fatalf("quota = %d, want %d", quota, int(2.35*common.QuotaPerUnit))
	}
}
