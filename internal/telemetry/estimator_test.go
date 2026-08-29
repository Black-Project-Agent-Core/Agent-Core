package telemetry

import (
	"marketsignallab/internal/domain"
	"testing"
	"time"
)

func compat(n int) domain.RuntimeCompatibility {
	return domain.RuntimeCompatibility{PlannerVersion: "p1", SamplingSchemaVersion: "s1", TaxonomyVersion: "t1", IndexWeightingVersion: "w1", Sites: []string{"a", "b"}, Surfaces: []string{"popular", "new"}, PlannedWorkUnits: n}
}
func summary(id string, units int, sec int64) domain.ScanRuntimeSummary {
	return domain.ScanRuntimeSummary{RunID: id, Status: domain.MarketMapRunCompleted, DurationMs: sec * 1000, PlannedWorkUnits: units, CompletedWorkUnits: units, Compatibility: compat(units)}
}
func TestEstimateUnavailableWithoutEvidence(t *testing.T) {
	e := EstimateRemaining(EstimateInput{Now: time.Unix(10, 0), StartedAt: time.Unix(0, 0), PlannedWorkUnits: 100})
	if e.Kind != domain.ETAUnavailable || e.Confidence != domain.ETAConfidenceUnavailable {
		t.Fatalf("%+v", e)
	}
}
func TestEstimateCurrentRunOnlyIsLowRange(t *testing.T) {
	e := EstimateRemaining(EstimateInput{Now: time.Unix(30, 0), StartedAt: time.Unix(0, 0), PlannedWorkUnits: 100, CompletedWorkUnits: 10, CurrentUnitDurations: []time.Duration{2 * time.Second, 3 * time.Second, 2 * time.Second}})
	if e.Kind != domain.ETARange || e.Confidence != domain.ETAConfidenceLow || e.EstimatedRemainingMs <= 0 {
		t.Fatalf("%+v", e)
	}
}
func TestEstimateConfidenceGrowsWithHistory(t *testing.T) {
	for n, want := range map[int]domain.ETAConfidence{2: domain.ETAConfidenceLow, 4: domain.ETAConfidenceMedium, 6: domain.ETAConfidenceHigh} {
		runs := []domain.ScanRuntimeSummary{}
		for i := 0; i < n; i++ {
			runs = append(runs, summary(string(rune('a'+i)), 100, 200))
		}
		e := EstimateRemaining(EstimateInput{Now: time.Unix(30, 0), StartedAt: time.Unix(0, 0), PlannedWorkUnits: 100, CompletedWorkUnits: 10, ComparableRuns: runs, CurrentUnitDurations: []time.Duration{2 * time.Second, 2 * time.Second}})
		if e.Confidence != want {
			t.Fatalf("n=%d got=%s want=%s", n, e.Confidence, want)
		}
	}
}
func TestEstimateSlowsWhenCurrentRunSlows(t *testing.T) {
	runs := []domain.ScanRuntimeSummary{summary("a", 100, 100), summary("b", 100, 100), summary("c", 100, 100)}
	fast := EstimateRemaining(EstimateInput{Now: time.Unix(30, 0), StartedAt: time.Unix(0, 0), PlannedWorkUnits: 100, CompletedWorkUnits: 20, ComparableRuns: runs, CurrentUnitDurations: []time.Duration{time.Second, time.Second, time.Second}})
	slow := EstimateRemaining(EstimateInput{Now: time.Unix(30, 0), StartedAt: time.Unix(0, 0), PlannedWorkUnits: 100, CompletedWorkUnits: 20, ComparableRuns: runs, CurrentUnitDurations: []time.Duration{5 * time.Second, 5 * time.Second, 5 * time.Second}})
	if slow.EstimatedRemainingMs <= fast.EstimatedRemainingMs {
		t.Fatalf("fast=%+v slow=%+v", fast, slow)
	}
}
func TestRuntimeCompatibilityExcludesStructuralMismatch(t *testing.T) {
	a := compat(100)
	b := compat(100)
	if RuntimeCompatibilityScore(a, b) < 0.9 {
		t.Fatal("expected match")
	}
	b.TaxonomyVersion = "other"
	if RuntimeCompatibilityScore(a, b) >= 0.8 {
		t.Fatal("expected mismatch")
	}
}
