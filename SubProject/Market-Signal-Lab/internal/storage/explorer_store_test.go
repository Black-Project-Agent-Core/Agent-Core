package storage

import (
	"marketsignallab/internal/domain"
	"testing"
)

func TestSavedViewAppendOnlyLatestStateAndTombstone(t *testing.T) {
	st, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	first := domain.SavedView{ID: "v1", Name: "First", Target: domain.ExplorerTargetCatalogs, Filters: map[string]string{"direction": "rising"}, CreatedAt: "2026-08-15T00:00:00Z", UpdatedAt: "2026-08-15T00:00:00Z"}
	if err := st.AppendSavedView(first); err != nil {
		t.Fatal(err)
	}
	first.Name = "Updated"
	first.UpdatedAt = "2026-08-16T00:00:00Z"
	if err := st.AppendSavedView(first); err != nil {
		t.Fatal(err)
	}
	rows, err := st.SavedViews()
	if err != nil || len(rows) != 1 || rows[0].Name != "Updated" {
		t.Fatalf("rows=%+v err=%v", rows, err)
	}
	first.Deleted = true
	first.UpdatedAt = "2026-08-17T00:00:00Z"
	if err := st.AppendSavedView(first); err != nil {
		t.Fatal(err)
	}
	rows, _ = st.SavedViews()
	if len(rows) != 0 {
		t.Fatalf("rows=%+v", rows)
	}
}

func TestWatchlistAppendOnlyLatestStateAndTombstone(t *testing.T) {
	st, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	row := domain.WatchlistEntry{ID: "w1", EntityType: domain.WatchEntityProduct, EntityID: "p1", Notes: "First", CreatedAt: "2026-08-15T00:00:00Z", UpdatedAt: "2026-08-15T00:00:00Z"}
	if err := st.AppendWatchlistEntry(row); err != nil {
		t.Fatal(err)
	}
	row.Notes = "Updated"
	row.UpdatedAt = "2026-08-16T00:00:00Z"
	if err := st.AppendWatchlistEntry(row); err != nil {
		t.Fatal(err)
	}
	rows, err := st.WatchlistEntries()
	if err != nil || len(rows) != 1 || rows[0].Notes != "Updated" {
		t.Fatalf("rows=%+v err=%v", rows, err)
	}
	row.Deleted = true
	row.UpdatedAt = "2026-08-17T00:00:00Z"
	if err := st.AppendWatchlistEntry(row); err != nil {
		t.Fatal(err)
	}
	rows, _ = st.WatchlistEntries()
	if len(rows) != 0 {
		t.Fatalf("rows=%+v", rows)
	}
}
