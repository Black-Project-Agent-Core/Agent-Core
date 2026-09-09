package storage

import (
	"marketsignallab/internal/domain"
	"path/filepath"
	"testing"
)

func TestProductTrendEventBatchPreservesCompositeKeySemantics(t *testing.T) {
	st, err := Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	existing := domain.ProductTrendEvent{
		ID: "existing-1", ProductID: "p1", RunID: "run-1", WindowDays: 30,
		EventType: domain.TrendEventEntered, Active: true,
		OccurredAt: "2026-08-18T00:00:00Z",
	}
	if err := st.AppendProductTrendEvent(existing); err != nil {
		t.Fatal(err)
	}

	idempotent := existing
	idempotent.ID = "different-id-same-composite"
	newRow := domain.ProductTrendEvent{
		ID: "new-1", ProductID: "p2", RunID: "run-1", WindowDays: 30,
		EventType: domain.TrendEventEntered, Active: true,
		OccurredAt: "2026-08-18T00:00:00Z",
	}
	if err := st.AppendProductTrendEvents([]domain.ProductTrendEvent{idempotent, newRow}); err != nil {
		t.Fatal(err)
	}
	rows, err := st.ProductTrendEvents(domain.ProductTrendEventFilter{RunID: "run-1", WindowDays: 30})
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 2 || rows[0].ID != "existing-1" || rows[1].ID != "new-1" {
		t.Fatalf("unexpected rows after idempotent batch: %+v", rows)
	}

	conflict := existing
	conflict.ID = "conflict-1"
	conflict.EventType = domain.TrendEventExited
	conflict.Active = false
	if err := st.AppendProductTrendEvents([]domain.ProductTrendEvent{conflict}); err == nil {
		t.Fatal("expected composite-key conflict")
	}
}

func TestProductTrendEventBatchPreservesOrderAndDoesNotMutateCaller(t *testing.T) {
	st, err := Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	rows := []domain.ProductTrendEvent{
		{ProductID: "p-a", RunID: "run-new", WindowDays: 7, EventType: domain.TrendEventEntered, Active: true, OccurredAt: "2026-08-18T00:00:00Z"},
		{ID: "fixed-b", ProductID: "p-b", RunID: "run-new", WindowDays: 7, EventType: domain.TrendEventEntered, Active: true, OccurredAt: "2026-08-18T00:00:01Z"},
	}
	if err := st.AppendProductTrendEvents(rows); err != nil {
		t.Fatal(err)
	}
	if rows[0].ID != "" {
		t.Fatalf("caller row mutated with generated ID: %q", rows[0].ID)
	}
	got, err := st.ProductTrendEvents(domain.ProductTrendEventFilter{RunID: "run-new", WindowDays: 7})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].ProductID != "p-a" || got[1].ProductID != "p-b" {
		t.Fatalf("unexpected persisted order: %+v", got)
	}
	if got[0].ID == "" || got[1].ID != "fixed-b" {
		t.Fatalf("generated/fixed IDs invalid: %+v", got)
	}
	if err := st.AppendProductTrendEvents(nil); err != nil {
		t.Fatal(err)
	}
}
