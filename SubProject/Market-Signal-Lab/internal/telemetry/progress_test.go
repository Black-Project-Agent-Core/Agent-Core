package telemetry

import (
	"marketsignallab/internal/domain"
	"testing"
	"time"
)

func TestProgressIsIndeterminateUntilPlanDenominatorExists(t *testing.T) {
	p := NewProgressTracker("run-1", domain.CanonicalScanStages())
	p.AdvanceWorkUnits(3)
	got := p.Snapshot(time.Unix(10, 0))
	if got.ProgressDeterminate || got.ProgressPercent != 0 {
		t.Fatalf("snapshot=%+v", got)
	}
}
func TestProgressUsesOnlyCurrentPlannedWorkUnits(t *testing.T) {
	p := NewProgressTracker("run-1", domain.CanonicalScanStages())
	p.SetPlannedWorkUnits(84)
	p.AdvanceWorkUnits(57)
	got := p.Snapshot(time.Unix(10, 0))
	if got.ProgressPercent != 67.9 {
		t.Fatalf("%v", got.ProgressPercent)
	}
	p.AdvanceWorkUnits(100)
	got = p.Snapshot(time.Unix(12, 0))
	if got.ProgressPercent != 100 || got.CompletedWorkUnits != 157 {
		t.Fatalf("%+v", got)
	}
}
func TestStageLifecycleSnapshot(t *testing.T) {
	p := NewProgressTracker("r", domain.CanonicalScanStages())
	t0 := time.Unix(100, 0)
	p.StartStage(domain.StagePreparingScanPlan, t0)
	p.CompleteStage(domain.StagePreparingScanPlan, t0.Add(time.Second))
	p.WarnStage(domain.StageMappingMarketSurfaces, t0.Add(2*time.Second))
	got := p.Snapshot(t0.Add(3 * time.Second))
	if got.Stages[0].Status != domain.ScanStageCompleted {
		t.Fatalf("%+v", got.Stages[0])
	}
}
