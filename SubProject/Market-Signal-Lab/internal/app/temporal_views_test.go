package app

import (
	"testing"

	"marketsignallab/internal/domain"
	"marketsignallab/internal/storage"
)

func TestProductTemporalSummarySeparatesReleaseScanAndTrendTime(t *testing.T) {
	st, err := storage.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	svc := New(st)
	product, err := st.UpsertProduct(domain.ProductEntity{ID: "p1", SourceType: "envato_market_api", ExternalItemID: "123", CanonicalCatalogID: "cat", FirstSeenAt: "2026-08-01T01:00:00Z", LastSeenAt: "2026-08-20T02:00:00Z", Status: "observed"})
	if err != nil {
		t.Fatal(err)
	}
	_, _, err = st.UpsertProductRelease(domain.ProductReleaseRecord{ProductID: product.ID, ReleasedAt: "2025-03-14T10:20:00Z", Precision: domain.ReleasePrecisionDateTime, SourceType: "envato_market_api", SourceField: "published_at", VerifiedAt: "2026-08-01T01:00:00Z"})
	if err != nil {
		t.Fatal(err)
	}
	observations := []domain.ProductObservation{
		{ID: "o1", SessionID: "s1", ProductID: product.ID, QueryID: "q", CatalogID: "cat", ObservedAt: "2026-08-01T01:00:00Z", MarketMapRunID: "run-1"},
		{ID: "o2", SessionID: "s2", ProductID: product.ID, QueryID: "q", CatalogID: "cat", ObservedAt: "2026-08-08T01:00:00Z", MarketMapRunID: "run-2"},
		{ID: "o3", SessionID: "s3", ProductID: product.ID, QueryID: "q", CatalogID: "cat", ObservedAt: "2026-08-20T02:00:00Z", MarketMapRunID: "run-3"},
	}
	for _, row := range observations {
		if err := st.AppendProductObservation(row); err != nil {
			t.Fatal(err)
		}
	}
	events := []domain.ProductTrendEvent{
		{ID: "e1", ProductID: product.ID, RunID: "run-1", WindowDays: 30, EventType: domain.TrendEventEntered, Active: true, OccurredAt: "2026-08-01T01:00:00Z"},
		{ID: "e2", ProductID: product.ID, RunID: "run-2", WindowDays: 30, EventType: domain.TrendEventContinued, Active: true, OccurredAt: "2026-08-08T01:00:00Z"},
		{ID: "e3", ProductID: product.ID, RunID: "run-3", WindowDays: 30, EventType: domain.TrendEventExited, Active: false, OccurredAt: "2026-08-20T02:00:00Z"},
		{ID: "e4", ProductID: product.ID, RunID: "run-3", WindowDays: 7, EventType: domain.TrendEventEntered, Active: true, OccurredAt: "2026-08-20T02:00:00Z"},
	}
	for _, row := range events {
		if err := st.AppendProductTrendEvent(row); err != nil {
			t.Fatal(err)
		}
	}
	got, err := svc.ProductTemporalSummary(product.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !got.ReleaseAvailable || got.ReleasedAt != "2025-03-14T10:20:00Z" || got.FirstDetectedAt != "2026-08-01T01:00:00Z" || got.LastScannedAt != "2026-08-20T02:00:00Z" {
		t.Fatalf("summary=%+v", got)
	}
	if got.LastTrendSeenAt != "2026-08-20T02:00:00Z" || got.ScanCount != 3 || len(got.ActiveWindows) != 1 || got.ActiveWindows[0] != 7 {
		t.Fatalf("summary=%+v", got)
	}
	if got.WindowStates[30].Active || !got.WindowStates[7].Active {
		t.Fatalf("window states=%+v", got.WindowStates)
	}
}

func TestAutopilotHistoryResolvesPriorRunAndDirection(t *testing.T) {
	st, err := storage.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	svc := New(st)
	for _, run := range []domain.MarketMapRun{
		{ID: "run-1", PlanID: "plan", Mode: domain.MarketMapModeStandard, CompatibilityKey: "same", StartedAt: "2026-08-01T00:00:00Z", CompletedAt: "2026-08-01T00:10:00Z", Status: domain.MarketMapRunCompleted, ProductsObserved: 100, Coverage: 90, Confidence: 75},
		{ID: "run-2", PlanID: "plan", Mode: domain.MarketMapModeStandard, CompatibilityKey: "same", StartedAt: "2026-08-08T00:00:00Z", CompletedAt: "2026-08-08T00:10:00Z", Status: domain.MarketMapRunCompleted, ProductsObserved: 120, Coverage: 95, Confidence: 80},
	} {
		if err := st.AppendMarketMapRun(run); err != nil {
			t.Fatal(err)
		}
	}
	if err := st.AppendMarketDirectionSnapshot(domain.MarketDirectionSnapshot{ID: "d2", RunID: "run-2", PriorRunID: "run-1", AsOf: "2026-08-08T00:10:00Z", Temperature: 68, Direction: "rising", CompositionOnly: false}); err != nil {
		t.Fatal(err)
	}
	rows, err := svc.AutopilotHistory()
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 || rows[0].RunID != "run-2" || rows[0].PriorRunID != "run-1" || rows[0].Direction != "rising" {
		t.Fatalf("rows=%+v", rows)
	}
}
