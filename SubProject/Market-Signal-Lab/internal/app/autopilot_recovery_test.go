package app

import (
	"marketsignallab/internal/domain"
	"marketsignallab/internal/storage"
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

const testInterruptedReason = "market map interrupted by previous application exit"

func recoveryTestRun(id string, status domain.MarketMapRunStatus) domain.MarketMapRun {
	return domain.MarketMapRun{
		ID:                    id,
		PlanID:                id + "-plan",
		Mode:                  domain.MarketMapModeQuick,
		CompatibilityKey:      "compat-key",
		SamplingSchemaVersion: "sampling-1",
		TaxonomyVersion:       "taxonomy-1",
		IndexWeightingVersion: "weighting-1",
		StartedAt:             "2026-08-23T10:00:00Z",
		Status:                status,
		RequestsUsed:          37,
		TargetsPlanned:        18,
		TargetsCompleted:      11,
		ObservationsCollected: 240,
		ProductsObserved:      96,
		AuthorsObserved:       54,
		Coverage:              61.1,
		Confidence:            42.5,
		DirectionStage:        domain.DirectionStageComposition,
		IntegrityStatus:       domain.IntegrityStatusNativeAlpha65,
		Errors:                []string{"category_fetch_failed: graphicriver"},
	}
}

func runByID(t *testing.T, st *storage.Store, id string) domain.MarketMapRun {
	t.Helper()
	run, ok, err := st.MarketMapRunByID(id)
	if err != nil {
		t.Fatal(err)
	}
	if !ok {
		t.Fatalf("run %s missing", id)
	}
	return run
}

func countReason(errs []string, reason string) int {
	n := 0
	for _, v := range errs {
		if v == reason {
			n++
		}
	}
	return n
}

func TestReconcileInterruptedAutopilotRunsTerminalizesStaleRunningRunsOnce(t *testing.T) {
	st, err := storage.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	stale := recoveryTestRun("stale-running", domain.MarketMapRunRunning)
	done := recoveryTestRun("already-completed", domain.MarketMapRunCompleted)
	done.CompletedAt = "2026-08-23T10:30:00Z"
	done.Errors = nil
	for _, run := range []domain.MarketMapRun{stale, done} {
		if err := st.AppendMarketMapRun(run); err != nil {
			t.Fatal(err)
		}
	}
	svc := NewWithAnalyticsEngine(st, &appTestEngine{name: "test-rust"})
	t.Cleanup(func() { _ = svc.Close() })

	reconciled, err := svc.ReconcileInterruptedAutopilotRuns()
	if err != nil {
		t.Fatal(err)
	}
	if reconciled != 1 {
		t.Fatalf("reconciled=%d want 1", reconciled)
	}

	recovered := runByID(t, st, stale.ID)
	if recovered.Status != domain.MarketMapRunFailed {
		t.Fatalf("status=%q want failed", recovered.Status)
	}
	if recovered.CompletedAt == "" {
		t.Fatal("recovered run must carry a recovery completedAt")
	}
	if _, err := time.Parse(time.RFC3339, recovered.CompletedAt); err != nil {
		t.Fatalf("completedAt=%q: %v", recovered.CompletedAt, err)
	}
	if got := countReason(recovered.Errors, testInterruptedReason); got != 1 {
		t.Fatalf("stable reason count=%d errors=%v", got, recovered.Errors)
	}
	if len(recovered.Errors) != len(stale.Errors)+1 || recovered.Errors[0] != stale.Errors[0] {
		t.Fatalf("existing errors not preserved: %v", recovered.Errors)
	}

	preserved := recovered
	preserved.Status = stale.Status
	preserved.CompletedAt = stale.CompletedAt
	preserved.Errors = stale.Errors
	if !reflect.DeepEqual(preserved, stale) {
		t.Fatalf("recovery mutated persisted fields:\ngot  %+v\nwant %+v", preserved, stale)
	}

	if untouched := runByID(t, st, done.ID); !reflect.DeepEqual(untouched, done) {
		t.Fatalf("completed run mutated:\ngot  %+v\nwant %+v", untouched, done)
	}

	again, err := svc.ReconcileInterruptedAutopilotRuns()
	if err != nil {
		t.Fatal(err)
	}
	if again != 0 {
		t.Fatalf("second reconcile=%d want 0", again)
	}
	if second := runByID(t, st, stale.ID); !reflect.DeepEqual(second, recovered) {
		t.Fatalf("second reconcile mutated recovered run:\ngot  %+v\nwant %+v", second, recovered)
	}
}
