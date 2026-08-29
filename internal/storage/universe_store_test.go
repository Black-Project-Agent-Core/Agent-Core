package storage

import (
	"marketsignallab/internal/domain"
	"path/filepath"
	"testing"
)

func TestUniverseStoreReusesStableProductAndAuthorIDs(t *testing.T) {
	s, err := Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	a1, err := s.UpsertAuthor(domain.AuthorEntity{SourceType: "envato_market_api", ExternalAuthorKey: "alice", DisplayName: "Alice", FirstSeenAt: "2026-08-15T01:00:00Z", LastSeenAt: "2026-08-15T01:00:00Z"})
	if err != nil {
		t.Fatal(err)
	}
	a2, err := s.UpsertAuthor(domain.AuthorEntity{SourceType: "envato_market_api", ExternalAuthorKey: "alice", DisplayName: "Alice Studio", FirstSeenAt: "2026-08-16T01:00:00Z", LastSeenAt: "2026-08-16T01:00:00Z"})
	if err != nil {
		t.Fatal(err)
	}
	if a1.ID == "" || a2.ID != a1.ID || a2.FirstSeenAt != a1.FirstSeenAt {
		t.Fatalf("authors=%+v %+v", a1, a2)
	}

	p1, err := s.UpsertProduct(domain.ProductEntity{SourceType: "envato_market_api", ExternalItemID: "123", CanonicalCatalogID: "cat", FirstSeenAt: "2026-08-15T01:00:00Z", LastSeenAt: "2026-08-15T01:00:00Z", Status: "observed"})
	if err != nil {
		t.Fatal(err)
	}
	p2, err := s.UpsertProduct(domain.ProductEntity{SourceType: "envato_market_api", ExternalItemID: "123", CanonicalCatalogID: "cat", FirstSeenAt: "2026-08-16T01:00:00Z", LastSeenAt: "2026-08-16T01:00:00Z", Status: "observed"})
	if err != nil {
		t.Fatal(err)
	}
	if p2.ID != p1.ID || p2.FirstSeenAt != p1.FirstSeenAt {
		t.Fatalf("products=%+v %+v", p1, p2)
	}
}

func TestResearchSessionReadReturnsLatestSnapshot(t *testing.T) {
	s, _ := Open(filepath.Join(t.TempDir(), "data"))
	_ = s.AppendResearchSession(domain.ResearchSession{ID: "s1", Status: domain.ResearchSessionRunning, QueriesPlanned: 2})
	_ = s.AppendResearchSession(domain.ResearchSession{ID: "s1", Status: domain.ResearchSessionPartial, QueriesPlanned: 2, QueriesCompleted: 1, CoverageEstimate: 50})
	got, ok, err := s.LatestResearchSession("s1")
	if err != nil || !ok {
		t.Fatalf("ok=%v err=%v", ok, err)
	}
	if got.Status != domain.ResearchSessionPartial || got.CoverageEstimate != 50 {
		t.Fatalf("session=%+v", got)
	}
}
