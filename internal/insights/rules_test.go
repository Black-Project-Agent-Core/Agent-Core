package insights

import (
	"marketsignallab/internal/domain"
	"testing"
)

func TestEvaluateScanUsesDeterministicCodes(t *testing.T) {
	tests := []struct {
		name         string
		session      domain.ResearchSession
		rankingBuilt bool
		wantCode     string
		wantSeverity string
	}{
		{"ranked", domain.ResearchSession{Status: domain.ResearchSessionCompleted, CoverageEstimate: 100}, true, "RANKING_READY", "good"},
		{"first snapshot", domain.ResearchSession{Status: domain.ResearchSessionCompleted, CoverageEstimate: 100}, false, "INSUFFICIENT_HISTORY", "info"},
		{"low coverage", domain.ResearchSession{Status: domain.ResearchSessionCompleted, CoverageEstimate: 42}, false, "LOW_COVERAGE", "warning"},
		{"partial", domain.ResearchSession{Status: domain.ResearchSessionPartial, CoverageEstimate: 51}, false, "PARTIAL_SCOPE", "warning"},
		{"failed", domain.ResearchSession{Status: domain.ResearchSessionFailed}, false, "SCAN_FAILED", "error"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := EvaluateScan(tc.session, tc.rankingBuilt)
			if got.Code != tc.wantCode || got.Severity != tc.wantSeverity {
				t.Fatalf("got=%+v", got)
			}
		})
	}
}
