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
	"time"
)

func floatPtr(v float64) *float64 { return &v }

func TestHealthAndIdentityAPI(t *testing.T) {
	st, _ := storage.Open(filepath.Join(t.TempDir(), "data"))
	svc := app.NewWithAnalyticsEngine(st, webHealthyAnalyticsEngine{})
	defer svc.Close()
	srv := New(svc)
	r := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	w := httptest.NewRecorder()
	srv.Handler().ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("health=%d", w.Code)
	}
	var health map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &health); err != nil {
		t.Fatal(err)
	}
	if health["version"] != "0.3.0-alpha.6.5.3-preview.1" {
		t.Fatalf("health version=%v", health["version"])
	}
	body := []byte(`{"theme":"Fashion","productType":"Magazine Template","subNiche":"Fashion Show","useCase":"Editorial","audience":"Fashion Brand"}`)
	r = httptest.NewRequest(http.MethodPost, "/api/identities", bytes.NewReader(body))
	w = httptest.NewRecorder()
	srv.Handler().ServeHTTP(w, r)
	if w.Code != http.StatusCreated {
		t.Fatalf("create=%d body=%s", w.Code, w.Body.String())
	}
	var v map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &v); err != nil {
		t.Fatal(err)
	}
	if v["id"] == nil {
		t.Fatal("missing id")
	}
}

func TestHomeContainsResearchWorkflow(t *testing.T) {
	st, _ := storage.Open(filepath.Join(t.TempDir(), "data"))
	svc := app.NewWithAnalyticsEngine(st, webHealthyAnalyticsEngine{})
	defer svc.Close()
	srv := New(svc)
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	w := httptest.NewRecorder()
	srv.Handler().ServeHTTP(w, r)
	body := w.Body.String()
	for _, want := range []string{"Market Signal Lab", "Create Market Identity", "Market Opportunity", "Envato Benchmark", "Divergence"} {
		if !strings.Contains(body, want) {
			t.Fatalf("home missing %q", want)
		}
	}
}

func TestDemoRoutesAreAbsentAndHomeHasNoSyntheticActions(t *testing.T) {
	st, _ := storage.Open(filepath.Join(t.TempDir(), "data"))
	svc := app.NewWithAnalyticsEngine(st, webHealthyAnalyticsEngine{})
	defer svc.Close()
	srv := New(svc)
	for _, path := range []string{"/api/demo", "/api/ranking/demo"} {
		r := httptest.NewRequest(http.MethodPost, path, bytes.NewReader([]byte(`{}`)))
		w := httptest.NewRecorder()
		srv.Handler().ServeHTTP(w, r)
		if w.Code != http.StatusNotFound {
			t.Fatalf("%s status=%d body=%s", path, w.Code, w.Body.String())
		}
	}
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	w := httptest.NewRecorder()
	srv.Handler().ServeHTTP(w, r)
	body := strings.ToLower(w.Body.String())
	for _, forbidden := range []string{"load 61.7% demo", "load synthetic", "synthetic demo data", "onclick=\"seeddemo", "onclick=\"loadrankingdemo"} {
		if strings.Contains(body, strings.ToLower(forbidden)) {
			t.Fatalf("home contains forbidden demo surface %q", forbidden)
		}
	}
}

func TestExportEndpointReturnsJSONBundle(t *testing.T) {
	st, _ := storage.Open(filepath.Join(t.TempDir(), "data"))
	svc := app.NewWithAnalyticsEngine(st, webHealthyAnalyticsEngine{})
	defer svc.Close()
	identity, err := svc.CreateIdentity(domain.NewIdentity("Sports", "Presentation Template", "Club Sponsorship", "Proposal", "Sports Club"))
	if err != nil {
		t.Fatal(err)
	}
	_, err = svc.Analyze(app.AnalyzeRequest{IdentityID: identity.ID, Features: domain.FeatureSet{DemandProxy: floatPtr(70), SupplyGap: floatPtr(60), MarketMomentum: floatPtr(65), CompetitiveGap: floatPtr(55)}})
	if err != nil {
		t.Fatal(err)
	}
	r := httptest.NewRequest(http.MethodGet, "/api/export", nil)
	w := httptest.NewRecorder()
	New(svc).Handler().ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("export=%d %s", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "Club Sponsorship") {
		t.Fatal("export missing real research identity")
	}
	if strings.Contains(strings.ToLower(w.Body.String()), "synthetic_demo") || strings.Contains(strings.ToLower(w.Body.String()), `"token"`) {
		t.Fatal("export contains forbidden runtime data")
	}
}

func TestHomeOffersExport(t *testing.T) {
	st, _ := storage.Open(filepath.Join(t.TempDir(), "data"))
	svc := app.NewWithAnalyticsEngine(st, webHealthyAnalyticsEngine{})
	defer svc.Close()
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	w := httptest.NewRecorder()
	New(svc).Handler().ServeHTTP(w, r)
	if !strings.Contains(w.Body.String(), "Export Local Research") {
		t.Fatal("export control missing")
	}
}

func TestEvidenceAPIAndAnalyzeFromEvidence(t *testing.T) {
	st, _ := storage.Open(filepath.Join(t.TempDir(), "data"))
	svc := app.NewWithAnalyticsEngine(st, webHealthyAnalyticsEngine{})
	defer svc.Close()
	id, _ := svc.CreateIdentity(domain.NewIdentity("Fashion", "Magazine Template", "Fashion Show", "Event", "Brand"))
	vals := map[string]float64{"demand_proxy": 72, "supply_gap": 41, "market_momentum": 66, "competitive_gap": 48, "freshness_gap": 68, "external_trend": 79, "seasonality": 74}
	for metric, value := range vals {
		body, _ := json.Marshal(domain.EvidenceRecord{IdentityID: id.ID, ObservedAt: time.Now().UTC().Format(time.RFC3339), SourceType: "manual_research", SourceLabel: "Research", Metric: metric, Value: value, Unit: "score_0_100", Reliability: "medium", Method: "manual"})
		r := httptest.NewRequest(http.MethodPost, "/api/evidence", bytes.NewReader(body))
		w := httptest.NewRecorder()
		New(svc).Handler().ServeHTTP(w, r)
		if w.Code != http.StatusCreated {
			t.Fatalf("evidence=%d %s", w.Code, w.Body.String())
		}
	}
	r := httptest.NewRequest(http.MethodPost, "/api/analyze-from-evidence?id="+id.ID, bytes.NewBufferString(`{}`))
	w := httptest.NewRecorder()
	New(svc).Handler().ServeHTTP(w, r)
	if w.Code != http.StatusCreated || !strings.Contains(w.Body.String(), `"opportunity":61.7`) {
		t.Fatalf("analyze=%d body=%s", w.Code, w.Body.String())
	}
}

func TestEnvatoSearchEndpointUsesStoredCredentialAndNeverAcceptsTokenInRequest(t *testing.T) {
	const token = "direct-research-token"
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer "+token {
			t.Errorf("authorization=%q", got)
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		_, _ = w.Write([]byte(`{"total_hits":25,"matches":[{"id":1},{"id":2}]}`))
	}))
	defer api.Close()
	client := envatoconn.NewClient(envatoconn.WithBaseURL(api.URL))
	svc, _, _ := newCredentialWebService(t, client, token)
	id, _ := svc.CreateIdentity(domain.NewIdentity("Fashion", "Magazine Template", "Fashion Show", "Event", "Brand"))
	body := `{"identityId":"` + id.ID + `","term":"fashion show","site":"graphicriver.net","pageSize":2}`
	r := httptest.NewRequest(http.MethodPost, "/api/envato/search", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	New(svc).Handler().ServeHTTP(w, r)
	if w.Code != http.StatusCreated || !strings.Contains(w.Body.String(), `"totalHits":25`) {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	if strings.Contains(w.Body.String(), token) {
		t.Fatalf("response leaked token: %s", w.Body.String())
	}

	const legacy = "MSL_LEGACY_DIRECT_TOKEN_E1B4"
	legacyBody := `{"identityId":"` + id.ID + `","token":"` + legacy + `","term":"fashion show","site":"graphicriver.net"}`
	r = httptest.NewRequest(http.MethodPost, "/api/envato/search", bytes.NewBufferString(legacyBody))
	w = httptest.NewRecorder()
	New(svc).Handler().ServeHTTP(w, r)
	if w.Code != http.StatusBadRequest || strings.Contains(w.Body.String(), legacy) {
		t.Fatalf("legacy status=%d body=%s", w.Code, w.Body.String())
	}
}

func TestEnvatoTotalItemsEndpointUsesStoredCredential(t *testing.T) {
	const token = "total-items-token"
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("Authorization"); got != "Bearer "+token {
			t.Errorf("authorization=%q", got)
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		_, _ = w.Write([]byte(`{"total-items":{"total_items":"7411418"}}`))
	}))
	defer api.Close()
	svc, _, _ := newCredentialWebService(t, envatoconn.NewClient(envatoconn.WithBaseURL(api.URL)), token)
	id, _ := svc.CreateIdentity(domain.NewIdentity("Fashion", "Magazine Template", "Fashion Show", "Event", "Brand"))
	r := httptest.NewRequest(http.MethodPost, "/api/envato/total-items", bytes.NewBufferString(`{"identityId":"`+id.ID+`"}`))
	w := httptest.NewRecorder()
	New(svc).Handler().ServeHTTP(w, r)
	if w.Code != http.StatusCreated || !strings.Contains(w.Body.String(), `"totalItems":7411418`) {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}
