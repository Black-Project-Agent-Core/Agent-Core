package web

import (
	"bytes"
	"encoding/json"
	"marketsignallab/internal/app"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/semantics"
	"marketsignallab/internal/storage"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

type explorerCatalogSemanticRow struct {
	domain.CatalogExplorerRow
	Semantics *semantics.CatalogV2 `json:"semantics"`
}

type explorerProductSemanticRow struct {
	domain.ProductExplorerRow
	Semantics *semantics.ProductV2 `json:"semantics"`
}

type pagedExplorerCatalogSemanticRows struct {
	Items  []explorerCatalogSemanticRow `json:"items"`
	Total  int                          `json:"total"`
	Limit  int                          `json:"limit"`
	Offset int                          `json:"offset"`
}

type pagedExplorerProductSemanticRows struct {
	Items  []explorerProductSemanticRow `json:"items"`
	Total  int                          `json:"total"`
	Limit  int                          `json:"limit"`
	Offset int                          `json:"offset"`
}

type watchlistSemanticTestRow struct {
	domain.WatchlistResolvedRow
	Semantics json.RawMessage `json:"semantics"`
}

type explorerFixture struct {
	Server           *Server
	PresentationID   string
	SportsID         string
	FashionID        string
	SportsProductID  string
	FashionProductID string
}

func explorerServer(t *testing.T) explorerFixture {
	t.Helper()
	st, err := storage.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	base := seedWebRankingUniverse(t, st)
	for _, author := range []domain.AuthorEntity{
		{ID: "a1", SourceType: "envato_market_api", ExternalAuthorKey: "sports-studio", DisplayName: "Sports Studio", FirstSeenAt: "2026-06-01T00:00:00Z", LastSeenAt: "2026-08-02T00:00:00Z"},
		{ID: "a2", SourceType: "envato_market_api", ExternalAuthorKey: "fashion-studio", DisplayName: "Fashion Studio", FirstSeenAt: "2026-06-01T00:00:00Z", LastSeenAt: "2026-08-02T00:00:00Z"},
	} {
		if _, err := st.UpsertAuthor(author); err != nil {
			t.Fatal(err)
		}
	}
	if err := st.SaveLiveProductMetadata(domain.LiveProductMetadata{ProductID: "p1", AuthorID: "a1", SourceType: "envato_market_api", Title: "Padel Sponsorship Presentation", FetchedAt: "2026-08-15T00:00:00Z"}); err != nil {
		t.Fatal(err)
	}
	if err := st.SaveCatalogNode(domain.CatalogNode{ID: "fashion", ParentID: base.ContentTypeID, Platform: "Envato Market", ContentType: "Presentation", Name: "Fashion Editorial", CanonicalKey: "market/presentation/fashion-editorial", Level: domain.CatalogLevelCatalog}); err != nil {
		t.Fatal(err)
	}
	if err := st.SaveResearchQuery(domain.ResearchQuery{ID: "q-fashion", Name: "Fashion editorial", Platform: "Envato Market", SourceType: "envato_market_api", QueryText: "fashion editorial presentation", CatalogScopeID: "fashion", Purpose: "ranking", CreatedAt: "2026-06-01T00:00:00Z", Enabled: true}); err != nil {
		t.Fatal(err)
	}
	for _, session := range []domain.ResearchSession{
		{ID: "fashion-prev", StartedAt: "2026-06-16T00:00:00Z", CompletedAt: "2026-07-15T00:00:00Z", SourceType: "envato_market_api", Scope: "fashion", QueryIDs: []string{"q-fashion"}, CompletedQueryIDs: []string{"q-fashion"}, QueriesPlanned: 1, QueriesCompleted: 1, Status: domain.ResearchSessionCompleted, CoverageEstimate: 88},
		{ID: "fashion-now", StartedAt: "2026-07-16T00:00:00Z", CompletedAt: "2026-08-15T00:00:00Z", SourceType: "envato_market_api", Scope: "fashion", QueryIDs: []string{"q-fashion"}, CompletedQueryIDs: []string{"q-fashion"}, QueriesPlanned: 1, QueriesCompleted: 1, Status: domain.ResearchSessionCompleted, CoverageEstimate: 92},
	} {
		if err := st.AppendResearchSession(session); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := st.UpsertProduct(domain.ProductEntity{ID: "fashion-product", SourceType: "envato_market_api", ExternalItemID: "fashion-product", CanonicalCatalogID: "fashion", FirstSeenAt: "2026-06-01T00:00:00Z", LastSeenAt: "2026-08-10T00:00:00Z", Status: "observed"}); err != nil {
		t.Fatal(err)
	}
	if err := st.SaveLiveProductMetadata(domain.LiveProductMetadata{ProductID: "fashion-product", AuthorID: "a2", SourceType: "envato_market_api", Title: "Fashion Collection Editorial", FetchedAt: "2026-08-15T00:00:00Z"}); err != nil {
		t.Fatal(err)
	}
	for _, observation := range []domain.ProductObservation{
		{ID: "fashion-prev-observation", SessionID: "fashion-prev", ProductID: "fashion-product", AuthorID: "a2", QueryID: "q-fashion", CatalogID: "fashion", SurfaceType: "search", Position: 18, ObservedAt: "2026-07-01T00:00:00Z", SourceType: "envato_market_api", ObservationReliability: .9},
		{ID: "fashion-now-observation", SessionID: "fashion-now", ProductID: "fashion-product", AuthorID: "a2", QueryID: "q-fashion", CatalogID: "fashion", SurfaceType: "popular", Position: 6, ObservedAt: "2026-08-01T00:00:00Z", SourceType: "envato_market_api", ObservationReliability: .9},
	} {
		if err := st.AppendProductObservation(observation); err != nil {
			t.Fatal(err)
		}
	}
	svc := app.New(st)
	if _, err := svc.BuildRankings(domain.RankingBuildRequest{AsOf: "2026-08-15T00:00:00Z", WindowDays: 30, CatalogScopeID: base.ContentTypeID}); err != nil {
		t.Fatal(err)
	}
	return explorerFixture{Server: New(svc), PresentationID: base.ContentTypeID, SportsID: base.SportsID, FashionID: "fashion", SportsProductID: "p1", FashionProductID: "fashion-product"}
}

func TestExplorerListEndpoints(t *testing.T) {
	fixture := explorerServer(t)
	srv := fixture.Server
	var catalogs pagedExplorerCatalogSemanticRows
	w := requestJSON(t, srv, http.MethodGet, "/api/explorer/catalogs?parentId="+fixture.PresentationID+"&text=sport&windowDays=30&sortBy=trend&desc=true&limit=20", nil, &catalogs)
	if w.Code != http.StatusOK || catalogs.Total < 1 || catalogs.Items[0].Catalog.ID != fixture.SportsID {
		t.Fatalf("catalogs status=%d body=%s", w.Code, w.Body.String())
	}
	if catalogs.Items[0].Semantics == nil || catalogs.Items[0].Semantics.CatalogInsightScore != catalogs.Items[0].Snapshot.OpportunityScore {
		t.Fatalf("catalog semantics=%+v", catalogs.Items[0].Semantics)
	}

	var products pagedExplorerProductSemanticRows
	w = requestJSON(t, srv, http.MethodGet, "/api/explorer/products?catalogId="+fixture.SportsID+"&text=padel&windowDays=30&minOpportunity=1", nil, &products)
	if w.Code != http.StatusOK || products.Total != 1 || products.Items[0].Product.ID != fixture.SportsProductID {
		t.Fatalf("products status=%d body=%s", w.Code, w.Body.String())
	}
	if products.Items[0].Semantics == nil || products.Items[0].Semantics.ProductInsightScore != products.Items[0].Snapshot.OpportunityScore {
		t.Fatalf("product semantics=%+v", products.Items[0].Semantics)
	}

	var noProducts pagedExplorerProductSemanticRows
	w = requestJSON(t, srv, http.MethodGet, "/api/explorer/products?catalogId="+fixture.SportsID+"&text=padel&windowDays=30&minOpportunity=101", nil, &noProducts)
	if w.Code != http.StatusOK || noProducts.Total != 0 {
		t.Fatalf("products minOpportunity=101 status=%d body=%s", w.Code, w.Body.String())
	}

	var authors domain.PagedAuthorExplorerRows
	w = requestJSON(t, srv, http.MethodGet, "/api/explorer/authors?catalogId="+fixture.SportsID+"&text=studio&sortBy=observations&desc=true", nil, &authors)
	if w.Code != http.StatusOK || authors.Total < 1 {
		t.Fatalf("authors status=%d body=%s", w.Code, w.Body.String())
	}

	var sessions domain.PagedSessionExplorerRows
	w = requestJSON(t, srv, http.MethodGet, "/api/explorer/sessions?catalogId="+fixture.SportsID+"&status=completed&minCoverage=1&sortBy=started&desc=true", nil, &sessions)
	if w.Code != http.StatusOK || sessions.Total < 1 {
		t.Fatalf("sessions status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestSavedViewsAndWatchlistEndpoints(t *testing.T) {
	fixture := explorerServer(t)
	srv := fixture.Server
	var view domain.SavedView
	w := requestJSON(t, srv, http.MethodPost, "/api/saved-views", domain.SavedView{Name: "Rising sports", Target: domain.ExplorerTargetCatalogs, Filters: map[string]string{"parentId": fixture.PresentationID, "direction": "rising"}}, &view)
	if w.Code != http.StatusCreated || view.ID == "" {
		t.Fatalf("save view=%d %s", w.Code, w.Body.String())
	}
	var views []domain.SavedView
	w = requestJSON(t, srv, http.MethodGet, "/api/saved-views", nil, &views)
	if w.Code != http.StatusOK || len(views) != 1 {
		t.Fatalf("views=%d %s", w.Code, w.Body.String())
	}

	var entry domain.WatchlistEntry
	w = requestJSON(t, srv, http.MethodPost, "/api/watchlist", domain.WatchlistEntry{EntityType: domain.WatchEntityCatalog, EntityID: fixture.SportsID, Notes: "Weekly"}, &entry)
	if w.Code != http.StatusCreated || entry.ID == "" {
		t.Fatalf("watchlist add=%d %s", w.Code, w.Body.String())
	}
	var watch []watchlistSemanticTestRow
	w = requestJSON(t, srv, http.MethodGet, "/api/watchlist?windowDays=30", nil, &watch)
	if w.Code != http.StatusOK || len(watch) != 1 || watch[0].CatalogSnapshot == nil {
		t.Fatalf("watchlist=%d %s", w.Code, w.Body.String())
	}
	if len(watch[0].Semantics) == 0 {
		t.Fatalf("watchlist catalog semantics missing: %s", w.Body.String())
	}
	var catalogSemantics semantics.CatalogV2
	if err := json.Unmarshal(watch[0].Semantics, &catalogSemantics); err != nil {
		t.Fatalf("watchlist catalog semantics decode: %v body=%s", err, watch[0].Semantics)
	}
	if catalogSemantics.CatalogInsightScore != watch[0].CatalogSnapshot.OpportunityScore {
		t.Fatalf("watchlist catalog semantics=%+v snapshot=%+v", catalogSemantics, watch[0].CatalogSnapshot)
	}

	var authorEntry domain.WatchlistEntry
	w = requestJSON(t, srv, http.MethodPost, "/api/watchlist", domain.WatchlistEntry{EntityType: domain.WatchEntityAuthor, EntityID: "a1", Notes: "Author"}, &authorEntry)
	if w.Code != http.StatusCreated || authorEntry.ID == "" {
		t.Fatalf("watchlist add author=%d %s", w.Code, w.Body.String())
	}
	watch = nil
	w = requestJSON(t, srv, http.MethodGet, "/api/watchlist?windowDays=30", nil, &watch)
	if w.Code != http.StatusOK || len(watch) != 2 {
		t.Fatalf("watchlist with author=%d %s", w.Code, w.Body.String())
	}
	var authorRowSeen bool
	for _, row := range watch {
		if row.Entry.EntityType != domain.WatchEntityAuthor {
			continue
		}
		authorRowSeen = true
		if row.Author == nil || len(row.Semantics) != 0 {
			t.Fatalf("author watch row=%+v semantics=%s", row.WatchlistResolvedRow, row.Semantics)
		}
	}
	if !authorRowSeen {
		t.Fatalf("author watch row missing: %s", w.Body.String())
	}
	w = requestJSON(t, srv, http.MethodDelete, "/api/watchlist?id="+authorEntry.ID, nil, nil)
	if w.Code != http.StatusNoContent {
		t.Fatalf("delete author watch=%d %s", w.Code, w.Body.String())
	}

	w = requestJSON(t, srv, http.MethodDelete, "/api/saved-views?id="+view.ID, nil, nil)
	if w.Code != http.StatusNoContent {
		t.Fatalf("delete view=%d %s", w.Code, w.Body.String())
	}
	w = requestJSON(t, srv, http.MethodDelete, "/api/watchlist?id="+entry.ID, nil, nil)
	if w.Code != http.StatusNoContent {
		t.Fatalf("delete watch=%d %s", w.Code, w.Body.String())
	}
}

func TestComparisonEndpointsAndValidation(t *testing.T) {
	fixture := explorerServer(t)
	srv := fixture.Server
	var catalogs []explorerCatalogSemanticRow
	w := requestJSON(t, srv, http.MethodGet, "/api/compare/catalogs?ids="+fixture.SportsID+","+fixture.FashionID+"&windowDays=30", nil, &catalogs)
	if w.Code != http.StatusOK || len(catalogs) != 2 {
		t.Fatalf("compare catalogs=%d %s", w.Code, w.Body.String())
	}
	if catalogs[0].Semantics == nil || catalogs[0].Semantics.CatalogInsightScore != catalogs[0].Snapshot.OpportunityScore {
		t.Fatalf("compare catalog semantics=%+v", catalogs[0].Semantics)
	}
	var products []explorerProductSemanticRow
	w = requestJSON(t, srv, http.MethodGet, "/api/compare/products?ids="+fixture.SportsProductID+","+fixture.FashionProductID+"&windowDays=30", nil, &products)
	if w.Code != http.StatusOK || len(products) != 2 {
		t.Fatalf("compare products=%d %s", w.Code, w.Body.String())
	}
	if products[0].Semantics == nil || products[0].Semantics.ProductInsightScore != products[0].Snapshot.OpportunityScore {
		t.Fatalf("compare product semantics=%+v", products[0].Semantics)
	}

	r := httptest.NewRequest(http.MethodGet, "/api/explorer/catalogs?minTrend=bad", nil)
	recorder := httptest.NewRecorder()
	srv.Handler().ServeHTTP(recorder, r)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("bad numeric=%d %s", recorder.Code, recorder.Body.String())
	}
	r = httptest.NewRequest(http.MethodGet, "/api/compare/catalogs?ids="+fixture.SportsID, nil)
	recorder = httptest.NewRecorder()
	srv.Handler().ServeHTTP(recorder, r)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("bad compare=%d %s", recorder.Code, recorder.Body.String())
	}
}

func TestExplorerPostRejectsUnknownFields(t *testing.T) {
	fixture := explorerServer(t)
	srv := fixture.Server
	r := httptest.NewRequest(http.MethodPost, "/api/saved-views", bytes.NewBufferString(`{"name":"x","target":"catalogs","unknown":true}`))
	recorder := httptest.NewRecorder()
	srv.Handler().ServeHTTP(recorder, r)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	var response map[string]any
	_ = json.Unmarshal(recorder.Body.Bytes(), &response)
	if response["error"] == nil {
		t.Fatal("expected error")
	}
}
