package web

import (
	"marketsignallab/internal/app"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/semantics"
	"marketsignallab/internal/storage"
	"net/http"
	"path/filepath"
	"testing"
)

type webRankingFixture struct {
	ContentTypeID string
	SportsID      string
}

func seedWebRankingUniverse(t *testing.T, st *storage.Store) webRankingFixture {
	t.Helper()
	for _, catalog := range []domain.CatalogNode{
		{ID: "presentation", Platform: "Envato Elements", ContentType: "Presentation", Name: "Presentation", CanonicalKey: "elements/presentation", Level: domain.CatalogLevelContentType},
		{ID: "sports", ParentID: "presentation", Platform: "Envato Elements", ContentType: "Presentation", Name: "Sports", CanonicalKey: "elements/presentation/sports", Level: domain.CatalogLevelCatalog},
	} {
		if err := st.SaveCatalogNode(catalog); err != nil {
			t.Fatal(err)
		}
	}
	if err := st.SaveResearchQuery(domain.ResearchQuery{ID: "q1", Name: "Sports", Platform: "Envato Elements", SourceType: "manual_research", QueryText: "sports", CatalogScopeID: "sports", Purpose: "ranking", CreatedAt: "2026-06-01T00:00:00Z", Enabled: true}); err != nil {
		t.Fatal(err)
	}
	for _, session := range []domain.ResearchSession{
		{ID: "prev", StartedAt: "2026-06-16T00:00:00Z", CompletedAt: "2026-07-15T00:00:00Z", SourceType: "manual_research", Scope: "sports", QueryIDs: []string{"q1"}, CompletedQueryIDs: []string{"q1"}, QueriesPlanned: 1, QueriesCompleted: 1, Status: domain.ResearchSessionCompleted, CoverageEstimate: 90},
		{ID: "now", StartedAt: "2026-07-16T00:00:00Z", CompletedAt: "2026-08-15T00:00:00Z", SourceType: "manual_research", Scope: "sports", QueryIDs: []string{"q1"}, CompletedQueryIDs: []string{"q1"}, QueriesPlanned: 1, QueriesCompleted: 1, Status: domain.ResearchSessionCompleted, CoverageEstimate: 95},
	} {
		if err := st.AppendResearchSession(session); err != nil {
			t.Fatal(err)
		}
	}
	for _, product := range []domain.ProductEntity{
		{ID: "p1", SourceType: "manual_research", ExternalItemID: "p1", CanonicalCatalogID: "sports", FirstSeenAt: "2026-06-01T00:00:00Z", LastSeenAt: "2026-08-10T00:00:00Z", Status: "observed"},
		{ID: "p2", SourceType: "manual_research", ExternalItemID: "p2", CanonicalCatalogID: "sports", FirstSeenAt: "2026-08-01T00:00:00Z", LastSeenAt: "2026-08-10T00:00:00Z", Status: "observed"},
	} {
		if _, err := st.UpsertProduct(product); err != nil {
			t.Fatal(err)
		}
	}
	for _, observation := range []domain.ProductObservation{
		{ID: "p1-prev", SessionID: "prev", ProductID: "p1", AuthorID: "a1", QueryID: "q1", CatalogID: "sports", SurfaceType: "search", Position: 20, ObservedAt: "2026-07-01T00:00:00Z", SourceType: "manual_research", ObservationReliability: .9},
		{ID: "p1-now", SessionID: "now", ProductID: "p1", AuthorID: "a1", QueryID: "q1", CatalogID: "sports", SurfaceType: "popular", Position: 5, ObservedAt: "2026-08-01T00:00:00Z", SourceType: "manual_research", ObservationReliability: .9},
		{ID: "p2-now", SessionID: "now", ProductID: "p2", AuthorID: "a2", QueryID: "q1", CatalogID: "sports", SurfaceType: "new", Position: 8, ObservedAt: "2026-08-02T00:00:00Z", SourceType: "manual_research", ObservationReliability: .8},
	} {
		if err := st.AppendProductObservation(observation); err != nil {
			t.Fatal(err)
		}
	}
	return webRankingFixture{ContentTypeID: "presentation", SportsID: "sports"}
}

func rankingServerWithFixture(t *testing.T) (*Server, *app.Service, webRankingFixture) {
	t.Helper()
	st, err := storage.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	fixture := seedWebRankingUniverse(t, st)
	svc := app.New(st)
	return New(svc), svc, fixture
}

func TestRankingBuildAndListEndpoints(t *testing.T) {
	srv, _, fixture := rankingServerWithFixture(t)

	var build domain.RankingBuildResult
	w := requestJSON(t, srv, http.MethodPost, "/api/ranking/build", domain.RankingBuildRequest{
		AsOf: "2026-08-15T00:00:00Z", WindowDays: 30, CatalogScopeID: fixture.ContentTypeID,
	}, &build)
	if w.Code != http.StatusCreated {
		t.Fatalf("build status=%d body=%s", w.Code, w.Body.String())
	}

	var catalogs []struct {
		app.CatalogRankingRow
		Semantics semantics.CatalogV2 `json:"semantics"`
	}
	w = requestJSON(t, srv, http.MethodGet, "/api/ranking/catalogs?windowDays=30&asOf=2026-08-15T00:00:00Z", nil, &catalogs)
	if w.Code != http.StatusOK || len(catalogs) == 0 {
		t.Fatalf("catalogs=%d body=%s", w.Code, w.Body.String())
	}
	if catalogs[0].Semantics.Contract.Version != semantics.ContractVersionV2 {
		t.Fatalf("catalog semantics=%+v", catalogs[0].Semantics)
	}
	if catalogs[0].Semantics.CatalogInsightScore != catalogs[0].Snapshot.OpportunityScore {
		t.Fatal("catalog semantic alias changed numeric value")
	}

	var products []struct {
		app.ProductRankingRow
		Semantics semantics.ProductV2 `json:"semantics"`
	}
	w = requestJSON(t, srv, http.MethodGet, "/api/ranking/products?windowDays=30&asOf=2026-08-15T00:00:00Z&catalogId="+fixture.SportsID, nil, &products)
	if w.Code != http.StatusOK || len(products) == 0 {
		t.Fatalf("products=%d body=%s", w.Code, w.Body.String())
	}
	if products[0].Semantics.ProductInsightScore != products[0].Snapshot.OpportunityScore {
		t.Fatal("product semantic alias changed numeric value")
	}

	var models []domain.ModelDefinition
	w = requestJSON(t, srv, http.MethodGet, "/api/ranking/models", nil, &models)
	if w.Code != http.StatusOK || len(models) < 5 {
		t.Fatalf("models=%d", len(models))
	}
}

func TestRankingEndpointValidation(t *testing.T) {
	srv, _, _ := rankingServerWithFixture(t)
	w := requestJSON(t, srv, http.MethodGet, "/api/ranking/build", nil, nil)
	if w.Code != http.StatusMethodNotAllowed {
		t.Fatalf("method=%d", w.Code)
	}
	w = requestJSON(t, srv, http.MethodPost, "/api/ranking/build", domain.RankingBuildRequest{AsOf: "2026-08-15T00:00:00Z", WindowDays: 6}, nil)
	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("window=%d body=%s", w.Code, w.Body.String())
	}
	w = requestJSON(t, srv, http.MethodGet, "/api/ranking/catalogs?windowDays=abc", nil, nil)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("query=%d body=%s", w.Code, w.Body.String())
	}
}

func TestProductRankingBeforeBuildReturnsEmptyList(t *testing.T) {
	st, _ := storage.Open(filepath.Join(t.TempDir(), "data"))
	srv := New(app.New(st))
	var rows []app.ProductRankingRow
	w := requestJSON(t, srv, http.MethodGet, "/api/ranking/products?windowDays=30", nil, &rows)
	if w.Code != http.StatusOK || len(rows) != 0 {
		t.Fatalf("status=%d rows=%+v", w.Code, rows)
	}
}
