package storage

import (
	"marketsignallab/internal/domain"
	"testing"
)

func TestRankingStoreDeduplicatesExactSnapshotIDAndKeepsModelVersions(t *testing.T) {
	st, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}

	w := domain.RankingWindow{
		Days: 30, CurrentStart: "2026-07-16T00:00:00Z", CurrentEnd: "2026-08-15T00:00:00Z",
		PreviousStart: "2026-06-16T00:00:00Z", PreviousEnd: "2026-07-16T00:00:00Z",
	}
	a := domain.CatalogSnapshot{ID: "same", CatalogID: "sports", Window: w, ObservedAt: w.CurrentEnd, TrendScore: 70, ModelVersion: "catalog-snapshot-v0.1"}
	b := a
	b.TrendScore = 75
	if err := st.AppendCatalogSnapshot(a); err != nil {
		t.Fatal(err)
	}
	if err := st.AppendCatalogSnapshot(b); err != nil {
		t.Fatal(err)
	}

	xs, err := st.CatalogSnapshots(domain.CatalogSnapshotFilter{CatalogID: "sports", WindowDays: 30, AsOf: w.CurrentEnd})
	if err != nil {
		t.Fatal(err)
	}
	if len(xs) != 1 || xs[0].TrendScore != 75 {
		t.Fatalf("snapshots=%+v", xs)
	}

	b.ID = "new-model"
	b.ModelVersion = "catalog-snapshot-v0.2"
	if err := st.AppendCatalogSnapshot(b); err != nil {
		t.Fatal(err)
	}
	xs, err = st.CatalogSnapshots(domain.CatalogSnapshotFilter{CatalogID: "sports", WindowDays: 30, AsOf: w.CurrentEnd})
	if err != nil {
		t.Fatal(err)
	}
	if len(xs) != 2 {
		t.Fatalf("model versions=%d want 2", len(xs))
	}
}

func TestRankingStoreFiltersProductSnapshots(t *testing.T) {
	st, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	w := domain.RankingWindow{Days: 30, CurrentStart: "2026-07-16T00:00:00Z", CurrentEnd: "2026-08-15T00:00:00Z", PreviousStart: "2026-06-16T00:00:00Z", PreviousEnd: "2026-07-16T00:00:00Z"}
	for _, row := range []domain.ProductSnapshot{
		{ID: "p1-a", ProductID: "p1", CatalogID: "sports", Window: w, ModelVersion: "product-snapshot-v0.1", ExposureScore: 70},
		{ID: "p2-a", ProductID: "p2", CatalogID: "fashion", Window: w, ModelVersion: "product-snapshot-v0.1", ExposureScore: 80},
	} {
		if err := st.AppendProductSnapshot(row); err != nil {
			t.Fatal(err)
		}
	}
	got, err := st.ProductSnapshots(domain.ProductSnapshotFilter{CatalogID: "sports", WindowDays: 30, AsOf: w.CurrentEnd})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got[0].ProductID != "p1" {
		t.Fatalf("got=%+v", got)
	}
}
