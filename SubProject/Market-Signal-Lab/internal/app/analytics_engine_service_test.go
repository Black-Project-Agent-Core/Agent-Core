package app

import (
	"context"
	"reflect"
	"sync"
	"testing"
	"time"

	"marketsignallab/internal/analyticsengine"
	"marketsignallab/internal/storage"
)

type appTestEngine struct {
	name           string
	health         analyticsengine.EngineStatus
	healthFn       func() analyticsengine.EngineStatus
	calls          int
	distCalls      int
	itemCalls      int
	clusterCalls   int
	selectionCalls int
	batchOnce      sync.Once
	batchRuntime   *analyticsengine.ProductionRuntime
	batchErr       error
}

func (e *appTestEngine) Name() string    { return e.name }
func (e *appTestEngine) Version() string { return "test" }
func (e *appTestEngine) Capabilities() []analyticsengine.Capability {
	return analyticsengine.PilotCapabilities()
}
func (e *appTestEngine) Health(context.Context) analyticsengine.Health {
	status := e.health
	if e.healthFn != nil {
		status = e.healthFn()
	}
	if status == "" {
		status = analyticsengine.EngineHealthy
	}
	return analyticsengine.Health{Status: status, Engine: e.name, Version: "test", Protocol: analyticsengine.ProtocolV1}
}
func (e *appTestEngine) DistributionSimilarity(context.Context, analyticsengine.DistributionSimilarityInput) (analyticsengine.DistributionSimilarityResult, error) {
	e.calls++
	e.distCalls++
	return analyticsengine.DistributionSimilarityResult{Score: 12}, nil
}
func (e *appTestEngine) ItemVolatility(context.Context, analyticsengine.ItemVolatilityInput) (analyticsengine.VolatilityResult, error) {
	e.calls++
	e.itemCalls++
	return analyticsengine.VolatilityResult{Score: 13, Label: "stable"}, nil
}
func (e *appTestEngine) ClusterVolatility(context.Context, analyticsengine.ClusterVolatilityInput) (analyticsengine.VolatilityResult, error) {
	e.calls++
	e.clusterCalls++
	return analyticsengine.VolatilityResult{Score: 14, Label: "stable", RankVariance: 9, RBOPersistence: 88}, nil
}
func (e *appTestEngine) SelectionProbability(context.Context, analyticsengine.SelectionProbabilityInput) (analyticsengine.SelectionProbabilityResult, error) {
	e.calls++
	e.selectionCalls++
	return analyticsengine.SelectionProbabilityResult{Score: 15, SelectedCount: 1, EligibleCount: 2, SelectedWeight: 1, EligibleWeight: 2}, nil
}

func (e *appTestEngine) ExecuteAnalyticsBatch(ctx context.Context, batch analyticsengine.AnalyticsBatch) (analyticsengine.AnalyticsBatchResult, error) {
	e.batchOnce.Do(func() {
		e.batchRuntime = analyticsengine.NewProductionRuntime(context.Background(), "", 10*time.Second)
		e.batchErr = e.batchRuntime.Ready(context.Background())
	})
	if e.batchErr != nil {
		return analyticsengine.AnalyticsBatchResult{}, e.batchErr
	}
	return e.batchRuntime.ExecuteAnalyticsBatch(ctx, batch)
}

func (e *appTestEngine) Close() error {
	if e.batchRuntime != nil {
		return e.batchRuntime.Close()
	}
	return nil
}

func TestServiceUsesRustProductionRuntimeByDefault(t *testing.T) {
	st, err := storage.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	svc := New(st)
	defer svc.Close()
	got := svc.AnalyticsEngineHealth(context.Background())
	if got.Engine != "rust-production" {
		t.Fatalf("engine=%q health=%+v", got.Engine, got)
	}
}

func TestServiceHasNoAnalyticsModeSelection(t *testing.T) {
	typ := reflect.TypeOf((*Service)(nil))
	if _, ok := typ.MethodByName("SetAnalyticsEngineMode"); ok {
		t.Fatal("SetAnalyticsEngineMode must not exist")
	}
	if _, ok := typ.MethodByName("AnalyticsEngineMode"); ok {
		t.Fatal("AnalyticsEngineMode must not exist")
	}
}

func TestNewWithAnalyticsEngineInjectsEngineForIntegrationTests(t *testing.T) {
	st, err := storage.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	spy := &appTestEngine{name: "spy-engine"}
	svc := NewWithAnalyticsEngine(st, spy)
	defer svc.Close()
	if got := svc.AnalyticsEngineHealth(context.Background()); got.Engine != "rust-production" || got.Status != analyticsengine.EngineHealthy {
		t.Fatalf("health=%+v", got)
	}
	if _, err := svc.analyticsEngine.DistributionSimilarity(context.Background(), analyticsengine.DistributionSimilarityInput{}); err != nil {
		t.Fatal(err)
	}
	if spy.distCalls != 1 {
		t.Fatalf("distCalls=%d", spy.distCalls)
	}
}

func TestServiceExposesFactualPolyglotDiagnostics(t *testing.T) {
	st, err := storage.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	spy := &appTestEngine{name: "spy-engine"}
	svc := NewWithAnalyticsEngine(st, spy)
	defer svc.Close()
	got := svc.AnalyticsDiagnostics(context.Background())
	if got.ApplicationHost.Language != "Go" || got.ApplicationHost.Status != analyticsengine.EngineHealthy {
		t.Fatalf("host=%+v", got.ApplicationHost)
	}
	if got.ProductionAnalytics.Engine != "rust-production" || got.ProductionAnalytics.Status != analyticsengine.EngineHealthy {
		t.Fatalf("rust=%+v", got.ProductionAnalytics)
	}
	if got.Protocol != analyticsengine.ProtocolV1 {
		t.Fatalf("protocol=%s", got.Protocol)
	}
	if got.QuantResearchLab.Language != "Python" || got.NativeAccelerator.Language != "C++" {
		t.Fatalf("diag=%+v", got)
	}
}
