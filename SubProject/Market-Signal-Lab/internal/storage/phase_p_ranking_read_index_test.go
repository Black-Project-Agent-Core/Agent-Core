package storage

import (
	"encoding/json"
	"marketsignallab/internal/domain"
	"os"
	"path/filepath"
	"testing"
)

func TestProductSnapshotReadIndexPreservesLatestByIDAndSort(t *testing.T) {
	st, err := Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	rows := []domain.ProductSnapshot{
		{ID: "same", ProductID: "p2", ModelVersion: "v1", ExposureScore: 10, Window: domain.RankingWindow{Days: 30, CurrentEnd: "2026-08-01T00:00:00Z"}},
		{ID: "other", ProductID: "p1", ModelVersion: "v1", ExposureScore: 20, Window: domain.RankingWindow{Days: 30, CurrentEnd: "2026-08-02T00:00:00Z"}},
		{ID: "same", ProductID: "p2", ModelVersion: "v1", ExposureScore: 99, Window: domain.RankingWindow{Days: 30, CurrentEnd: "2026-08-03T00:00:00Z"}},
	}
	for _, row := range rows {
		if err := st.AppendProductSnapshot(row); err != nil {
			t.Fatal(err)
		}
	}
	indexed, err := st.productSnapshotRowsIndexed()
	if err != nil {
		t.Fatal(err)
	}
	if len(indexed) != 2 {
		t.Fatalf("indexed rows=%d want=2", len(indexed))
	}
	if indexed[0].ProductID != "p1" {
		t.Fatalf("first=%+v", indexed[0])
	}
	if indexed[1].ProductID != "p2" || indexed[1].ExposureScore != 99 {
		t.Fatalf("second=%+v", indexed[1])
	}
}

func TestProductSnapshotReadIndexRebuildsAfterExternalGrowth(t *testing.T) {
	st, err := Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	first := domain.ProductSnapshot{ID: "snap-1", ProductID: "p1", ModelVersion: "v1", ExposureScore: 10, Window: domain.RankingWindow{Days: 30, CurrentEnd: "2026-08-01T00:00:00Z"}}
	if err := st.AppendProductSnapshot(first); err != nil {
		t.Fatal(err)
	}
	if _, err := st.productSnapshotRowsIndexed(); err != nil {
		t.Fatal(err)
	}
	updated := first
	updated.ExposureScore = 88
	updated.Window.CurrentEnd = "2026-08-02T00:00:00Z"
	b, err := json.Marshal(updated)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(st.Root(), "history", productSnapshotsFile)
	f, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.Write(append(b, '\n')); err != nil {
		f.Close()
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
	indexed, err := st.productSnapshotRowsIndexed()
	if err != nil {
		t.Fatal(err)
	}
	if len(indexed) != 1 || indexed[0].ExposureScore != 88 {
		t.Fatalf("stale index after external growth: %+v", indexed)
	}
}
