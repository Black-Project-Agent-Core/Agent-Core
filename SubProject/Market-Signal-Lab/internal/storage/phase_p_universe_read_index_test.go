package storage

import (
	"encoding/json"
	"marketsignallab/internal/domain"
	"os"
	"path/filepath"
	"testing"
)

func TestProductObservationReadIndexRebuildsAfterGrowth(t *testing.T) {
	st, err := Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	first := domain.ProductObservation{ID: "o1", ProductID: "p1", ObservedAt: "2026-08-01T00:00:00Z"}
	if err := st.AppendProductObservation(first); err != nil {
		t.Fatal(err)
	}
	rows, err := st.productObservationRowsIndexed()
	if err != nil || len(rows) != 1 {
		t.Fatalf("rows=%+v err=%v", rows, err)
	}
	second := domain.ProductObservation{ID: "o2", ProductID: "p1", ObservedAt: "2026-08-02T00:00:00Z"}
	b, _ := json.Marshal(second)
	path := filepath.Join(st.Root(), "history", "product_observations.jsonl")
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
	rows, err = st.productObservationRowsIndexed()
	if err != nil || len(rows) != 2 || rows[1].ID != "o2" {
		t.Fatalf("stale observation index rows=%+v err=%v", rows, err)
	}
}

func TestLiveMetadataReadIndexRefreshesAfterSave(t *testing.T) {
	st, err := Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	if err := st.SaveLiveProductMetadata(domain.LiveProductMetadata{ProductID: "p1", Title: "Old"}); err != nil {
		t.Fatal(err)
	}
	rows, err := st.liveMetadataRowsIndexed()
	if err != nil || len(rows) != 1 || rows[0].Title != "Old" {
		t.Fatalf("rows=%+v err=%v", rows, err)
	}
	if err := st.SaveLiveProductMetadata(domain.LiveProductMetadata{ProductID: "p1", Title: "New"}); err != nil {
		t.Fatal(err)
	}
	rows, err = st.liveMetadataRowsIndexed()
	if err != nil || len(rows) != 1 || rows[0].Title != "New" {
		t.Fatalf("stale metadata index rows=%+v err=%v", rows, err)
	}
}

func TestTemporalReadIndexesExposeCanonicalRows(t *testing.T) {
	st, err := Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	release := domain.ProductReleaseRecord{ID: "r1", ProductID: "p1", ReleasedAt: "2026-01-01", Precision: domain.ReleasePrecisionDate, SourceType: "test", SourceField: "published_at", VerifiedAt: "2026-08-01T00:00:00Z"}
	if _, _, err := st.UpsertProductRelease(release); err != nil {
		t.Fatal(err)
	}
	event := domain.ProductTrendEvent{ID: "e1", ProductID: "p1", RunID: "run-1", WindowDays: 30, EventType: domain.TrendEventEntered, Active: true, OccurredAt: "2026-08-01T00:00:00Z"}
	if err := st.AppendProductTrendEvent(event); err != nil {
		t.Fatal(err)
	}
	releases, err := st.productReleaseRowsIndexed()
	if err != nil || len(releases) != 1 || releases[0].ID != "r1" {
		t.Fatalf("releases=%+v err=%v", releases, err)
	}
	events, err := st.productTrendEventRowsIndexed()
	if err != nil || len(events) != 1 || events[0].ID != "e1" {
		t.Fatalf("events=%+v err=%v", events, err)
	}
	conflicts, err := st.productReleaseConflictRowsIndexed()
	if err != nil || len(conflicts) != 0 {
		t.Fatalf("conflicts=%+v err=%v", conflicts, err)
	}
}
