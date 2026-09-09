package app

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	envatoconn "marketsignallab/internal/connectors/envato"

	"marketsignallab/internal/domain"
)

func TestRecordObservedProductPersistsImmutableOfficialRelease(t *testing.T) {
	svc, st := newUniverseServiceForTest(t, nil)
	cat := mustSportsCatalog(t, svc)
	query, err := svc.CreateResearchQuery(domain.ResearchQuery{
		Name: "padel", Platform: "Envato Market", SourceType: "envato_market_api", QueryText: "padel",
		CatalogScopeID: cat.ID, Purpose: "catalog_observation", Enabled: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	session, err := svc.StartResearchSession(StartResearchSessionRequest{
		SourceType: "envato_market_api", Scope: cat.ID, QueryIDs: []string{query.ID}, RequestBudget: 2,
	})
	if err != nil {
		t.Fatal(err)
	}
	base := domain.ObservedProductInput{
		SessionID: session.ID, QueryID: query.ID, CatalogID: cat.ID, SourceType: "envato_market_api",
		ExternalItemID: "123", Title: "Padel Sponsorship Deck", SurfaceType: "popular", Position: 1, Page: 1,
		ObservedAt: "2026-08-16T01:00:00Z", ObservationReliability: 0.9,
		ReleasedAt: "2025-03-14T10:20:00Z", ReleasePrecision: domain.ReleasePrecisionDateTime,
		ReleaseSourceField: "published_at", SourceURL: "https://graphicriver.net/item/padel-sponsorship-deck/123",
	}
	obs, err := svc.recordObservedProduct(base)
	if err != nil {
		t.Fatal(err)
	}
	release, ok, err := st.ProductRelease(obs.ProductID)
	if err != nil || !ok {
		t.Fatalf("release missing: ok=%v err=%v", ok, err)
	}
	if release.ReleasedAt != "2025-03-14T10:20:00Z" || release.SourceField != "published_at" {
		t.Fatalf("release=%+v", release)
	}

	conflicting := base
	conflicting.ObservedAt = "2026-08-17T01:00:00Z"
	conflicting.ReleasedAt = "2025-03-15T10:20:00Z"
	if _, err := svc.recordObservedProduct(conflicting); err != nil {
		t.Fatal(err)
	}
	releaseAfter, ok, err := st.ProductRelease(obs.ProductID)
	if err != nil || !ok {
		t.Fatalf("release missing after conflict: ok=%v err=%v", ok, err)
	}
	if releaseAfter.ReleasedAt != release.ReleasedAt {
		t.Fatalf("immutable release overwritten: before=%+v after=%+v", release, releaseAfter)
	}
	conflicts, err := st.ProductReleaseConflicts(obs.ProductID)
	if err != nil {
		t.Fatal(err)
	}
	if len(conflicts) != 1 || conflicts[0].CandidateReleasedAt != "2025-03-15T10:20:00Z" {
		t.Fatalf("conflicts=%+v", conflicts)
	}
}

func TestEnrichOfficialReleasesUsesBoundedItemDetailAndPersistsExplicitDate(t *testing.T) {
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v3/market/catalog/item" || r.URL.Query().Get("id") != "123" {
			t.Fatalf("unexpected request: %s?%s", r.URL.Path, r.URL.RawQuery)
		}
		_, _ = w.Write([]byte(`{"id":123,"name":"Padel Sponsorship Deck","url":"https://graphicriver.net/item/padel-sponsorship-deck/123","published_at":"2025-03-14T10:20:00Z","updated_at":"2026-08-16T01:00:00Z"}`))
	}))
	defer api.Close()
	svc, st := newUniverseServiceForTest(t, envatoconn.NewClient(envatoconn.WithBaseURL(api.URL)))
	product, err := st.UpsertProduct(domain.ProductEntity{SourceType: "envato_market_api", ExternalItemID: "123", CanonicalCatalogID: "cat", FirstSeenAt: "2026-08-16T01:00:00Z", LastSeenAt: "2026-08-16T01:00:00Z", Status: "observed"})
	if err != nil {
		t.Fatal(err)
	}
	used := svc.enrichOfficialReleases(context.Background(), "secret", []string{product.ID}, 1)
	if used != 1 {
		t.Fatalf("used=%d want 1", used)
	}
	release, ok, err := st.ProductRelease(product.ID)
	if err != nil || !ok {
		t.Fatalf("release missing: ok=%v err=%v", ok, err)
	}
	if release.ReleasedAt != "2025-03-14T10:20:00Z" || release.SourceField != "published_at" {
		t.Fatalf("release=%+v", release)
	}
}
