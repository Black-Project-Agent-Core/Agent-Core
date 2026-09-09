package web

import (
	"bytes"
	"encoding/json"
	"marketsignallab/internal/app"
	envatoconn "marketsignallab/internal/connectors/envato"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/storage"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func TestUniverseCatalogPathAndListEndpoints(t *testing.T) {
	st, err := storage.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	svc := app.NewWithAnalyticsEngine(st, webHealthyAnalyticsEngine{})
	defer svc.Close()
	srv := New(svc)
	body := `{"platform":"Envato Market","contentType":"Presentation","catalog":"Sports","subcatalog":"Padel"}`
	r := httptest.NewRequest(http.MethodPost, "/api/universe/catalog-path", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	srv.Handler().ServeHTTP(w, r)
	if w.Code != http.StatusCreated {
		t.Fatalf("create=%d body=%s", w.Code, w.Body.String())
	}
	var path []domain.CatalogNode
	if err := json.Unmarshal(w.Body.Bytes(), &path); err != nil {
		t.Fatal(err)
	}
	if len(path) < 3 || path[len(path)-1].Name != "Padel" {
		t.Fatalf("path=%+v", path)
	}
	r = httptest.NewRequest(http.MethodGet, "/api/universe/catalogs", nil)
	w = httptest.NewRecorder()
	srv.Handler().ServeHTTP(w, r)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), "Padel") {
		t.Fatalf("list=%d body=%s", w.Code, w.Body.String())
	}
}

func TestResearchSessionEndpointReturnsAudit(t *testing.T) {
	st, _ := storage.Open(filepath.Join(t.TempDir(), "data"))
	svc := app.NewWithAnalyticsEngine(st, webHealthyAnalyticsEngine{})
	defer svc.Close()
	path, err := svc.EnsureCatalogPath(domain.CatalogPathInput{Platform: "Envato Elements", ContentType: "Presentation", Catalog: "Sports"})
	if err != nil {
		t.Fatal(err)
	}
	catalog := path[len(path)-1]
	query, err := svc.CreateResearchQuery(domain.ResearchQuery{Name: "sports", Platform: "Envato Elements", SourceType: "envato_elements_manual", QueryText: "sports", CatalogScopeID: catalog.ID, Purpose: "test", Enabled: true})
	if err != nil {
		t.Fatal(err)
	}
	session, err := svc.StartResearchSession(app.StartResearchSessionRequest{SourceType: "envato_elements_manual", Scope: catalog.ID, QueryIDs: []string{query.ID}, RequestBudget: 0})
	if err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest(http.MethodGet, "/api/research/sessions?id="+session.ID, nil)
	w := httptest.NewRecorder()
	New(svc).Handler().ServeHTTP(w, r)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), session.ID) {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestObserveEnvatoResearchEndpointUsesStoredCredential(t *testing.T) {
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer observe-token" {
			t.Errorf("authorization=%q", got)
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		_, _ = w.Write([]byte(`{"total_hits":1,"matches":[{"id":123,"name":"Padel Deck","author_username":"alice","category":"presentation-templates"}]}`))
	}))
	defer api.Close()
	client := envatoconn.NewClient(envatoconn.WithBaseURL(api.URL))
	svc, _, _ := newCredentialWebService(t, client, "observe-token")
	path, err := svc.EnsureCatalogPath(domain.CatalogPathInput{Platform: "Envato Market", ContentType: "Presentation", Catalog: "Sports"})
	if err != nil {
		t.Fatal(err)
	}
	catalog := path[len(path)-1]
	query, err := svc.CreateResearchQuery(domain.ResearchQuery{Name: "padel", Platform: "Envato Market", SourceType: "envato_market_api", QueryText: "padel", CatalogScopeID: catalog.ID, Purpose: "test", Enabled: true, Filters: map[string]string{"site": "graphicriver.net", "page_size": "20"}})
	if err != nil {
		t.Fatal(err)
	}
	session, err := svc.StartResearchSession(app.StartResearchSessionRequest{SourceType: "envato_market_api", Scope: catalog.ID, QueryIDs: []string{query.ID}, RequestBudget: 2})
	if err != nil {
		t.Fatal(err)
	}
	body := `{"sessionId":"` + session.ID + `","queryId":"` + query.ID + `"}`
	r := httptest.NewRequest(http.MethodPost, "/api/research/envato/observe", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	New(svc).Handler().ServeHTTP(w, r)
	if w.Code != http.StatusCreated {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), `"observations":1`) || strings.Contains(w.Body.String(), "observe-token") {
		t.Fatalf("response=%s", w.Body.String())
	}
}

func TestObserveEnvatoResearchRejectsLegacyTokenField(t *testing.T) {
	const canary = "MSL_LEGACY_OBSERVE_TOKEN_A733"
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.NotFound(w, r) }))
	defer api.Close()
	svc, _, _ := newCredentialWebService(t, envatoconn.NewClient(envatoconn.WithBaseURL(api.URL)), "stored-token")
	body := `{"sessionId":"s","queryId":"q","token":"` + canary + `"}`
	r := httptest.NewRequest(http.MethodPost, "/api/research/envato/observe", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	New(svc).Handler().ServeHTTP(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	if strings.Contains(w.Body.String(), canary) {
		t.Fatalf("legacy token echoed: %s", w.Body.String())
	}
}

func TestImportProductsCSVEndpoint(t *testing.T) {
	st, _ := storage.Open(filepath.Join(t.TempDir(), "data"))
	svc := app.NewWithAnalyticsEngine(st, webHealthyAnalyticsEngine{})
	defer svc.Close()
	path, _ := svc.EnsureCatalogPath(domain.CatalogPathInput{Platform: "Envato Elements", ContentType: "Presentation", Catalog: "Sports"})
	catalog := path[len(path)-1]
	query, _ := svc.CreateResearchQuery(domain.ResearchQuery{Name: "sports", Platform: "Envato Elements", SourceType: "envato_elements_manual", QueryText: "sports", CatalogScopeID: catalog.ID, Purpose: "test", Enabled: true})
	session, _ := svc.StartResearchSession(app.StartResearchSessionRequest{SourceType: "envato_elements_manual", Scope: catalog.ID, QueryIDs: []string{query.ID}, RequestBudget: 0})
	csvBody := "session_id,query_id,catalog_id,source_type,external_item_id,title,observed_at\n" + session.ID + "," + query.ID + "," + catalog.ID + ",envato_elements_manual,p1,Sports Deck,2026-08-18T00:00:00Z\n"
	r := httptest.NewRequest(http.MethodPost, "/api/research/import-products-csv", strings.NewReader(csvBody))
	w := httptest.NewRecorder()
	New(svc).Handler().ServeHTTP(w, r)
	if w.Code != http.StatusCreated || !strings.Contains(w.Body.String(), `"imported":1`) {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}
