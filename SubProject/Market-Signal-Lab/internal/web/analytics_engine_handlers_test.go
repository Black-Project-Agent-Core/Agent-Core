package web

import (
	"context"
	"encoding/json"
	"marketsignallab/internal/analyticsengine"
	"marketsignallab/internal/app"
	"marketsignallab/internal/storage"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAnalyticsEngineDiagnosticsAPIIsFactualAndSecretFree(t *testing.T) {
	st, err := storage.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	svc := app.NewWithAnalyticsEngine(st, &webHealthyAnalyticsEngine{})
	defer svc.Close()
	srv := New(svc)

	r := httptest.NewRequest(http.MethodGet, "/api/system/analytics-engine", nil)
	w := httptest.NewRecorder()
	srv.Handler().ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	var got analyticsengine.DiagnosticsSnapshot
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.ApplicationHost.Language != "Go" || got.ApplicationHost.Status != analyticsengine.EngineHealthy {
		t.Fatalf("host=%+v", got.ApplicationHost)
	}
	if got.ProductionAnalytics.Engine != "rust-production" || got.ProductionAnalytics.Status != analyticsengine.EngineHealthy {
		t.Fatalf("production=%+v", got.ProductionAnalytics)
	}
	if got.Protocol != analyticsengine.ProtocolV1 || got.WorkerVersion != "test" {
		t.Fatalf("snapshot=%+v", got)
	}
	if got.QuantResearchLab.Language != "Python" || got.NativeAccelerator.Language != "C++" {
		t.Fatalf("snapshot=%+v", got)
	}
	lower := strings.ToLower(w.Body.String())
	authorizationMarker := "author" + "ization:"
	for _, forbidden := range []string{authorizationMarker, "bearer secret", "personal_token", "cookie="} {
		if strings.Contains(lower, forbidden) {
			t.Fatalf("response contains %q: %s", forbidden, w.Body.String())
		}
	}
}

func TestAnalyticsEngineDiagnosticsEndpointIsReadOnly(t *testing.T) {
	st, err := storage.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	svc := app.NewWithAnalyticsEngine(st, &webHealthyAnalyticsEngine{})
	defer svc.Close()
	srv := New(svc)

	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodDelete} {
		r := httptest.NewRequest(method, "/api/system/analytics-engine", nil)
		w := httptest.NewRecorder()
		srv.Handler().ServeHTTP(w, r)
		if w.Code != http.StatusMethodNotAllowed {
			t.Fatalf("method=%s status=%d body=%s", method, w.Code, w.Body.String())
		}
	}
}

func TestAnalyticsEngineLegacyDiagnosticsRouteIsGone(t *testing.T) {
	st, err := storage.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	svc := app.NewWithAnalyticsEngine(st, &webHealthyAnalyticsEngine{})
	defer svc.Close()
	srv := New(svc)

	r := httptest.NewRequest(http.MethodPost, "/api/system/analytics-engine/diagnostics", nil)
	w := httptest.NewRecorder()
	srv.Handler().ServeHTTP(w, r)
	if w.Code != http.StatusNotFound {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
}

type webHealthyAnalyticsEngine struct{}

func (webHealthyAnalyticsEngine) Name() string    { return "test-rust" }
func (webHealthyAnalyticsEngine) Version() string { return "test" }
func (webHealthyAnalyticsEngine) Capabilities() []analyticsengine.Capability {
	return analyticsengine.PilotCapabilities()
}
func (webHealthyAnalyticsEngine) Health(context.Context) analyticsengine.Health {
	return analyticsengine.Health{Status: analyticsengine.EngineHealthy, Engine: "test-rust", Version: "test", Protocol: analyticsengine.ProtocolV1}
}
func (webHealthyAnalyticsEngine) DistributionSimilarity(context.Context, analyticsengine.DistributionSimilarityInput) (analyticsengine.DistributionSimilarityResult, error) {
	return analyticsengine.DistributionSimilarityResult{}, nil
}
func (webHealthyAnalyticsEngine) ItemVolatility(context.Context, analyticsengine.ItemVolatilityInput) (analyticsengine.VolatilityResult, error) {
	return analyticsengine.VolatilityResult{}, nil
}
func (webHealthyAnalyticsEngine) ClusterVolatility(context.Context, analyticsengine.ClusterVolatilityInput) (analyticsengine.VolatilityResult, error) {
	return analyticsengine.VolatilityResult{}, nil
}
func (webHealthyAnalyticsEngine) SelectionProbability(context.Context, analyticsengine.SelectionProbabilityInput) (analyticsengine.SelectionProbabilityResult, error) {
	return analyticsengine.SelectionProbabilityResult{}, nil
}
func (webHealthyAnalyticsEngine) Close() error { return nil }
