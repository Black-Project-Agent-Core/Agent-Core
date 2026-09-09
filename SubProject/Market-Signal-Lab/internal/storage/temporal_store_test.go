package storage

import (
	"path/filepath"
	"testing"

	"marketsignallab/internal/domain"
)

func TestProductReleaseIsImmutableAndConflictsAreAudited(t *testing.T) {
	st, err := Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}

	first := domain.ProductReleaseRecord{
		ID: "release-1", ProductID: "product-1", ReleasedAt: "2025-03-14",
		Precision: domain.ReleasePrecisionDate, SourceType: "envato_market_api",
		SourceField: "published_at", VerifiedAt: "2026-08-16T00:00:00Z",
	}
	stored, conflict, err := st.UpsertProductRelease(first)
	if err != nil {
		t.Fatal(err)
	}
	if conflict != nil || stored.ReleasedAt != first.ReleasedAt {
		t.Fatalf("stored=%+v conflict=%+v", stored, conflict)
	}

	same := first
	same.ID = "release-2"
	same.VerifiedAt = "2026-08-17T00:00:00Z"
	stored, conflict, err = st.UpsertProductRelease(same)
	if err != nil {
		t.Fatal(err)
	}
	if conflict != nil || stored.ID != first.ID || stored.ReleasedAt != first.ReleasedAt {
		t.Fatalf("same value changed immutable record: stored=%+v conflict=%+v", stored, conflict)
	}

	changed := first
	changed.ID = "release-3"
	changed.ReleasedAt = "2025-03-15"
	changed.VerifiedAt = "2026-08-18T00:00:00Z"
	stored, conflict, err = st.UpsertProductRelease(changed)
	if err != nil {
		t.Fatal(err)
	}
	if conflict == nil || stored.ReleasedAt != first.ReleasedAt || conflict.ExistingReleasedAt != first.ReleasedAt || conflict.CandidateReleasedAt != changed.ReleasedAt {
		t.Fatalf("immutable conflict not preserved: stored=%+v conflict=%+v", stored, conflict)
	}
	conflicts, err := st.ProductReleaseConflicts("product-1")
	if err != nil {
		t.Fatal(err)
	}
	if len(conflicts) != 1 || conflicts[0].Status != domain.ReleaseConflictPending {
		t.Fatalf("conflicts=%+v", conflicts)
	}
}

func TestTrendEventsAreAppendOnlyAndPreviousRunExcludesCurrent(t *testing.T) {
	st, err := Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	events := []domain.ProductTrendEvent{
		{ID: "event-1", ProductID: "product-1", RunID: "run-1", WindowDays: 7, EventType: domain.TrendEventEntered, OccurredAt: "2026-08-01T00:00:00Z"},
		{ID: "event-2", ProductID: "product-1", RunID: "run-2", PriorRunID: "run-1", WindowDays: 7, EventType: domain.TrendEventContinued, OccurredAt: "2026-08-08T00:00:00Z"},
	}
	for _, event := range events {
		if err := st.AppendProductTrendEvent(event); err != nil {
			t.Fatal(err)
		}
	}
	gotEvents, err := st.ProductTrendEvents(domain.ProductTrendEventFilter{ProductID: "product-1", WindowDays: 7})
	if err != nil {
		t.Fatal(err)
	}
	if len(gotEvents) != 2 || gotEvents[0].ID != "event-1" || gotEvents[1].ID != "event-2" {
		t.Fatalf("events=%+v", gotEvents)
	}

	runs := []domain.MarketMapRun{
		{ID: "run-1", CompatibilityKey: "same", Status: domain.MarketMapRunCompleted, CompletedAt: "2026-08-01T00:00:00Z"},
		{ID: "run-2", CompatibilityKey: "same", Status: domain.MarketMapRunCompleted, CompletedAt: "2026-08-08T00:00:00Z"},
	}
	for _, run := range runs {
		if err := st.AppendMarketMapRun(run); err != nil {
			t.Fatal(err)
		}
	}
	prior, ok, err := st.LatestCompletedMarketMapRunExcluding("same", "run-2")
	if err != nil {
		t.Fatal(err)
	}
	if !ok || prior.ID != "run-1" {
		t.Fatalf("prior=%+v ok=%v", prior, ok)
	}
}
