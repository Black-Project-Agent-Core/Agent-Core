package app

import (
	"testing"

	"marketsignallab/internal/domain"
	"marketsignallab/internal/storage"
)

func TestPersistTrendLifecycleStoresEventsForSevenThirtyNinetyDayWindows(t *testing.T) {
	st, err := storage.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	svc := New(st)
	row := domain.ProductSnapshot{ProductID: "p1", Direction: domain.DirectionRising, ExposureScore: 75, OpportunityScore: 70}
	run := domain.MarketMapRun{ID: "run-1", CompletedAt: "2026-08-16T01:00:00Z"}
	byWindow := map[int][]domain.ProductSnapshot{7: {row}, 30: {row}, 90: {row}}
	if err := svc.persistTrendLifecycle(run, "", byWindow); err != nil {
		t.Fatal(err)
	}
	for _, days := range []int{7, 30, 90} {
		events, err := st.ProductTrendEvents(domain.ProductTrendEventFilter{ProductID: "p1", WindowDays: days})
		if err != nil {
			t.Fatal(err)
		}
		if len(events) != 1 || events[0].EventType != domain.TrendEventEntered || !events[0].Active {
			t.Fatalf("window=%d events=%+v", days, events)
		}
	}
	// Retrying finalization for the same run is idempotent.
	if err := svc.persistTrendLifecycle(run, "", byWindow); err != nil {
		t.Fatal(err)
	}
	events, err := st.ProductTrendEvents(domain.ProductTrendEventFilter{ProductID: "p1", WindowDays: 30})
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 1 {
		t.Fatalf("duplicate lifecycle events=%+v", events)
	}
}
