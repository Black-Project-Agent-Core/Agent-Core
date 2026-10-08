package universe

import (
	"fmt"
	"marketsignallab/internal/domain"
	"testing"
)

func TestCoveragePercentUsesUniqueCompletedQueries(t *testing.T) {
	got := CoveragePercent(50, []string{"q1", "q1", "q2"})
	if got != 4.0 {
		t.Fatalf("coverage=%v want 4.0", got)
	}
}

func TestResolveSessionStatusMarksBudgetExhaustedScopePartial(t *testing.T) {
	got := ResolveSessionStatus(50, 24, 60, 60, false, false)
	if got != domain.ResearchSessionPartial {
		t.Fatalf("status=%s", got)
	}
	if CoveragePercent(50, makeQueryIDs(24)) != 48.0 {
		t.Fatal("expected 48% coverage")
	}
}

func makeQueryIDs(n int) []string {
	out := make([]string, n)
	for i := range out {
		out[i] = fmt.Sprintf("q%d", i)
	}
	return out
}
