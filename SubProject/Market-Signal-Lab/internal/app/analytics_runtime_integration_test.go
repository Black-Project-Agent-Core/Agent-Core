package app

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"marketsignallab/internal/analyticsengine"
	envatoconn "marketsignallab/internal/connectors/envato"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/storage"
)

func TestAutopilotDoesNotStartWithoutRustRuntime(t *testing.T) {
	st, err := storage.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	unavailable := &appTestEngine{name: "unavailable", health: analyticsengine.EngineUnavailable}
	svc := NewWithAnalyticsEngine(st, unavailable)
	defer svc.Close()
	if _, err := svc.StartMarketAutopilot(context.Background(), domain.MarketMapModeQuick); !errors.Is(err, analyticsengine.ErrRuntimeUnavailable) {
		t.Fatalf("err=%v", err)
	}
	runs, err := st.MarketMapRuns()
	if err != nil {
		t.Fatal(err)
	}
	if len(runs) != 0 {
		t.Fatalf("unexpected run persisted: %+v", runs)
	}
}

func TestAutopilotKeepsObservationsButDoesNotFinalizeAfterRustFailure(t *testing.T) {
	healthy := true
	engine := &appTestEngine{name: "flaky-rust", healthFn: func() analyticsengine.EngineStatus {
		if healthy {
			return analyticsengine.EngineHealthy
		}
		return analyticsengine.EngineCrashed
	}}
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/market/total-items.json" {
			_, _ = w.Write([]byte(`{"total-items":{"total_items":"1000"}}`))
			return
		}
		if r.URL.Path == "/v1/discovery/search/search/item" {
			_, _ = w.Write([]byte(`{"total_hits":1,"matches":[{"id":999,"name":"Probe"}]}`))
			return
		}
		if len(r.URL.Path) > 0 && (r.URL.Path[len(r.URL.Path)-1] == '\n') {
			t.Errorf("unexpected path")
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		// Quick mode observes popular/random-new surfaces. Flip health only after a real item response is emitted.
		if containsAny(r.URL.Path, "/v1/market/popular:", "/v1/market/random-new-files:") {
			_, _ = w.Write([]byte(`{"items":[{"id":"observed-1","name":"Observed Item","author_username":"author"}]}`))
			healthy = false
			return
		}
		http.NotFound(w, r)
	}))
	defer api.Close()

	st, err := storage.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	client := envatoconn.NewClient(envatoconn.WithBaseURL(api.URL))
	svc := newServiceWithCredentialForTest(t, st, client, engine, "secret")
	_, err = svc.RunMarketAutopilot(context.Background(), domain.MarketMapModeQuick)
	if !errors.Is(err, analyticsengine.ErrRuntimeUnavailable) {
		t.Fatalf("err=%v", err)
	}
	observations, readErr := st.ProductObservations(domain.ObservationFilter{})
	if readErr != nil {
		t.Fatal(readErr)
	}
	if len(observations) == 0 {
		t.Fatal("raw observations should remain persisted")
	}
	catalogs, readErr := st.CatalogSnapshots(domain.CatalogSnapshotFilter{})
	if readErr != nil {
		t.Fatal(readErr)
	}
	if len(catalogs) != 0 {
		t.Fatalf("derived catalog analytics were published: %d", len(catalogs))
	}
}

func containsAny(s string, needles ...string) bool {
	for _, needle := range needles {
		if len(needle) > 0 && len(s) >= len(needle) && stringContains(s, needle) {
			return true
		}
	}
	return false
}
func stringContains(s, needle string) bool {
	for i := 0; i+len(needle) <= len(s); i++ {
		if s[i:i+len(needle)] == needle {
			return true
		}
	}
	return false
}
