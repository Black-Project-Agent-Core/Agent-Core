package app

import (
	"context"
	"fmt"
	envatoconn "marketsignallab/internal/connectors/envato"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/storage"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func autopilotAPIServer(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer secret" {
			t.Errorf("auth=%q", r.Header.Get("Authorization"))
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if r.URL.Path == "/v1/market/total-items.json" {
			_, _ = w.Write([]byte(`{"total-items":{"total_items":"1000"}}`))
			return
		}
		if r.URL.Path == "/v1/discovery/search/search/item" {
			_, _ = w.Write([]byte(`{"total_hits":1,"matches":[{"id":999,"name":"Probe"}]}`))
			return
		}
		switch {
		case strings.Contains(r.URL.Path, "/v1/market/categories:"):
			_, _ = w.Write([]byte(`{"categories":[{"name":"Presentation Templates","path":"presentation-templates"},{"name":"Mockups","path":"mockups"}]}`))
		case strings.Contains(r.URL.Path, "/v1/market/popular:"):
			site := marketSiteFromPath(r.URL.Path)
			_, _ = w.Write([]byte(fmt.Sprintf(`{"items":[{"id":"%s-pop","name":"%s Sponsorship Presentation","author_username":"studio-%s","category":"presentation-templates"}]}`, site, site, site)))
		case strings.Contains(r.URL.Path, "/v1/market/random-new-files:"):
			site := marketSiteFromPath(r.URL.Path)
			_, _ = w.Write([]byte(fmt.Sprintf(`{"items":[{"id":"%s-new","name":"%s Packaging Mockup","author_username":"new-%s","category":"mockups"}]}`, site, site, site)))
		default:
			http.NotFound(w, r)
		}
	}))
}

func marketSiteFromPath(path string) string {
	colon := strings.LastIndex(path, ":")
	if colon < 0 {
		return "unknown"
	}
	return strings.TrimSuffix(path[colon+1:], ".json")
}

func TestRunMarketAutopilotMapsAllSitesAndPersistsRealObservations(t *testing.T) {
	api := autopilotAPIServer(t)
	defer api.Close()
	st, err := storage.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	client := envatoconn.NewClient(envatoconn.WithBaseURL(api.URL))
	svc := newServiceWithCredentialForTest(t, st, client, &appTestEngine{name: "test-rust"}, "secret")
	got, err := svc.RunMarketAutopilot(context.Background(), domain.MarketMapModeQuick)
	if err != nil {
		t.Fatal(err)
	}
	if got.Run.Status != domain.MarketMapRunCompleted || got.Run.TargetsCompleted != 14 || got.Run.ProductsObserved != 14 {
		t.Fatalf("run=%+v", got.Run)
	}
	if got.Run.Coverage != 100 || got.Plan.RequestBudget != 28 {
		t.Fatalf("coverage=%v plan=%+v", got.Run.Coverage, got.Plan)
	}
	observations, err := st.MarketSurfaceObservations(got.Run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(observations) != 14 {
		t.Fatalf("observations=%d", len(observations))
	}
	raw := fmt.Sprintf("%+v", got)
	if strings.Contains(raw, "secret") {
		t.Fatal("token leaked")
	}
}

func TestRunMarketAutopilotContinuesAfterOneSurfaceFails(t *testing.T) {
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/market/total-items.json" {
			_, _ = w.Write([]byte(`{"total-items":{"total_items":"100"}}`))
			return
		}
		if r.URL.Path == "/v1/discovery/search/search/item" {
			_, _ = w.Write([]byte(`{"total_hits":1,"matches":[{"id":999,"name":"Probe"}]}`))
			return
		}
		if strings.Contains(r.URL.Path, "categories") {
			_, _ = w.Write([]byte(`{"categories":[]}`))
			return
		}
		site := marketSiteFromPath(r.URL.Path)
		if site == "audiojungle" && strings.Contains(r.URL.Path, "popular") {
			http.Error(w, "surface unavailable", http.StatusInternalServerError)
			return
		}
		kind := "popular"
		if strings.Contains(r.URL.Path, "random-new") {
			kind = "new"
		}
		_, _ = w.Write([]byte(fmt.Sprintf(`{"items":[{"id":"%s-%s","name":"Real %s Item","author_username":"author-%s"}]}`, site, kind, kind, site)))
	}))
	defer api.Close()
	st, _ := storage.Open(t.TempDir())
	client := envatoconn.NewClient(envatoconn.WithBaseURL(api.URL))
	svc := newServiceWithCredentialForTest(t, st, client, &appTestEngine{name: "test-rust"}, "secret")
	got, err := svc.RunMarketAutopilot(context.Background(), domain.MarketMapModeQuick)
	if err != nil {
		t.Fatalf("partial market map should remain usable: %v", err)
	}
	if got.Run.Status != domain.MarketMapRunPartial || got.Run.TargetsCompleted != 13 || got.Run.ObservationsCollected != 13 {
		t.Fatalf("run=%+v", got.Run)
	}
	if len(got.Run.Errors) == 0 || got.Run.Coverage >= 100 {
		t.Fatalf("partial audit missing: %+v", got.Run)
	}
	if got.Run.ProductsObserved == 0 || len(got.Directions) == 0 {
		t.Fatalf("later observations were not converted into usable outputs: run=%+v directions=%d", got.Run, len(got.Directions))
	}
}

func TestRunMarketAutopilotTreatsSurface403AsPartialAfterTokenVerification(t *testing.T) {
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/market/total-items.json" {
			_, _ = w.Write([]byte(`{"total-items":{"total_items":"100"}}`))
			return
		}
		if r.URL.Path == "/v1/discovery/search/search/item" {
			_, _ = w.Write([]byte(`{"total_hits":1,"matches":[{"id":999,"name":"Probe"}]}`))
			return
		}
		if strings.Contains(r.URL.Path, "categories") {
			_, _ = w.Write([]byte(`{"categories":[]}`))
			return
		}
		if strings.Contains(r.URL.Path, "features") {
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte(`{"error":"Forbidden","description":"surface unavailable for this site"}`))
			return
		}
		site := marketSiteFromPath(r.URL.Path)
		_, _ = w.Write([]byte(fmt.Sprintf(`{"items":[{"id":"%s-%d","name":"Real Item","author_username":"real-author"}]}`, site, len(r.URL.Path))))
	}))
	defer api.Close()
	st, _ := storage.Open(t.TempDir())
	client := envatoconn.NewClient(envatoconn.WithBaseURL(api.URL))
	svc := newServiceWithCredentialForTest(t, st, client, &appTestEngine{name: "test-rust"}, "secret")
	got, err := svc.RunMarketAutopilot(context.Background(), domain.MarketMapModeDeep)
	if err != nil {
		t.Fatalf("surface-level 403 must not abort a verified token run: %v", err)
	}
	if got.Run.Status != domain.MarketMapRunPartial || got.Run.ObservationsCollected == 0 {
		t.Fatalf("run=%+v", got.Run)
	}
	found403 := false
	for _, message := range got.Run.Errors {
		if strings.Contains(message, "HTTP 403") && strings.Contains(message, "featured") {
			found403 = true
		}
	}
	if !found403 {
		t.Fatalf("expected surface diagnostic, errors=%v", got.Run.Errors)
	}
}

func TestRunMarketAutopilotRejectsInvalidTokenBeforeMapping(t *testing.T) {
	requests := 0
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"error":"Forbidden","description":"invalid token"}`))
	}))
	defer api.Close()
	st, _ := storage.Open(t.TempDir())
	client := envatoconn.NewClient(envatoconn.WithBaseURL(api.URL))
	svc := newServiceWithCredentialForTest(t, st, client, &appTestEngine{name: "test-rust"}, "bad-token")
	_, err := svc.RunMarketAutopilot(context.Background(), domain.MarketMapModeQuick)
	if err == nil || !strings.Contains(err.Error(), "connection verification") {
		t.Fatalf("err=%v", err)
	}
	if requests != 1 {
		t.Fatalf("requests=%d want 1", requests)
	}
}

func TestRunMarketAutopilotFailsWhenNoSurfaceCanBeObserved(t *testing.T) {
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/market/total-items.json" {
			_, _ = w.Write([]byte(`{"total-items":{"total_items":"100"}}`))
			return
		}
		if r.URL.Path == "/v1/discovery/search/search/item" {
			_, _ = w.Write([]byte(`{"total_hits":1,"matches":[{"id":999,"name":"Probe"}]}`))
			return
		}
		if strings.Contains(r.URL.Path, "categories") {
			_, _ = w.Write([]byte(`{"categories":[]}`))
			return
		}
		http.Error(w, "all surfaces unavailable", http.StatusInternalServerError)
	}))
	defer api.Close()
	st, _ := storage.Open(t.TempDir())
	client := envatoconn.NewClient(envatoconn.WithBaseURL(api.URL))
	svc := newServiceWithCredentialForTest(t, st, client, &appTestEngine{name: "test-rust"}, "secret")
	got, err := svc.RunMarketAutopilot(context.Background(), domain.MarketMapModeQuick)
	if err == nil {
		t.Fatal("expected a failed map error")
	}
	if got.Run.Status != domain.MarketMapRunFailed || got.Run.TargetsCompleted != 0 || len(got.Run.Errors) == 0 {
		t.Fatalf("run=%+v", got.Run)
	}
}

func TestRunMarketAutopilotSelectsPreviousComparableRun(t *testing.T) {
	api := autopilotAPIServer(t)
	defer api.Close()
	st, err := storage.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	client := envatoconn.NewClient(envatoconn.WithBaseURL(api.URL))
	svc := newServiceWithCredentialForTest(t, st, client, &appTestEngine{name: "test-rust"}, "secret")
	first, err := svc.RunMarketAutopilot(context.Background(), domain.MarketMapModeQuick)
	if err != nil {
		t.Fatal(err)
	}
	second, err := svc.RunMarketAutopilot(context.Background(), domain.MarketMapModeQuick)
	if err != nil {
		t.Fatal(err)
	}
	if second.Direction == nil {
		t.Fatal("second run direction missing")
	}
	if second.Direction.PriorRunID != first.Run.ID || second.Direction.CompositionOnly {
		t.Fatalf("direction=%+v first=%s second=%s", second.Direction, first.Run.ID, second.Run.ID)
	}
}
