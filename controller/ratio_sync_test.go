package controller

import "testing"

func TestShouldReplaceModelsDevCandidatePrefersOfficialProvider(t *testing.T) {
	tests := []struct {
		name    string
		current modelsDevCandidate
		next    modelsDevCandidate
		want    bool
	}{
		{
			name:    "official replaces non-official",
			current: modelsDevCandidate{Provider: "openrouter", Input: 1},
			next:    modelsDevCandidate{Provider: "openai", Input: 4},
			want:    true,
		},
		{
			name:    "non-official does not replace official",
			current: modelsDevCandidate{Provider: "openai", Input: 4},
			next:    modelsDevCandidate{Provider: "openrouter", Input: 1},
			want:    false,
		},
		{
			name:    "first non-official candidate remains fallback",
			current: modelsDevCandidate{Provider: "first-party-proxy", Input: 4},
			next:    modelsDevCandidate{Provider: "second-party-proxy", Input: 1},
			want:    false,
		},
		{
			name:    "official non-zero price replaces zero price",
			current: modelsDevCandidate{Provider: "anthropic", Input: 0},
			next:    modelsDevCandidate{Provider: "openai", Input: 4},
			want:    true,
		},
		{
			name:    "cheaper official price wins",
			current: modelsDevCandidate{Provider: "openai", Input: 4},
			next:    modelsDevCandidate{Provider: "google", Input: 2},
			want:    true,
		},
		{
			name:    "provider name breaks official price tie",
			current: modelsDevCandidate{Provider: "openai", Input: 4},
			next:    modelsDevCandidate{Provider: "anthropic", Input: 4},
			want:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := shouldReplaceModelsDevCandidate(tt.current, tt.next); got != tt.want {
				t.Fatalf("shouldReplaceModelsDevCandidate() = %v, want %v", got, tt.want)
			}
		})
	}
}
