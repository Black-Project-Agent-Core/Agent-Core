package storage

import (
	"marketsignallab/internal/domain"
	"path/filepath"
	"testing"
)

func TestStoreAppendsHistoryAndReturnsLatest(t *testing.T) {
	dir := t.TempDir()
	s, err := Open(filepath.Join(dir, "data"))
	if err != nil {
		t.Fatal(err)
	}
	id := domain.NewIdentity("Fashion", "Magazine Template", "Fashion Show", "Event", "Fashion Brand")
	if err := s.SaveIdentity(id); err != nil {
		t.Fatal(err)
	}
	a1 := domain.Analysis{ID: "a1", IdentityID: id.ID, AsOf: "2026-08-14", Opportunity: 55}
	a2 := domain.Analysis{ID: "a2", IdentityID: id.ID, AsOf: "2026-08-15", Opportunity: 61.7}
	if err := s.AppendAnalysis(a1); err != nil {
		t.Fatal(err)
	}
	if err := s.AppendAnalysis(a2); err != nil {
		t.Fatal(err)
	}
	hist, err := s.Analyses(id.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(hist) != 2 {
		t.Fatalf("history=%d want 2", len(hist))
	}
	latest, ok, err := s.LatestAnalysis(id.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !ok || latest.ID != "a2" {
		t.Fatalf("latest=%+v ok=%v", latest, ok)
	}
}

func TestStoreAppendsEvidenceWithProvenance(t *testing.T) {
	s, err := Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	e := domain.EvidenceRecord{
		ID: "ev1", IdentityID: "id1", ObservedAt: "2026-08-15T03:00:00Z",
		SourceType: "external_csv", SourceLabel: "Google Trends export",
		Metric: "external_trend", Value: 79, Unit: "score_0_100",
		Query: "fashion show", SampleSize: 90, Reliability: "medium", Method: "manual_csv_import",
	}
	if err := s.AppendEvidence(e); err != nil {
		t.Fatal(err)
	}
	xs, err := s.Evidence("id1")
	if err != nil {
		t.Fatal(err)
	}
	if len(xs) != 1 {
		t.Fatalf("evidence=%d want 1", len(xs))
	}
	if xs[0].SourceLabel != "Google Trends export" || xs[0].Metric != "external_trend" || xs[0].Query != "fashion show" {
		t.Fatalf("provenance lost: %+v", xs[0])
	}
}
