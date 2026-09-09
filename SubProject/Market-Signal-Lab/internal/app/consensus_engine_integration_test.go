package app

import (
	"marketsignallab/internal/domain"
	"marketsignallab/internal/storage"
	"testing"
	"time"
)

func newConsensusEngineTestService(t *testing.T, spy *appTestEngine) *Service {
	t.Helper()
	st, err := storage.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return NewWithAnalyticsEngine(st, spy)
}

func TestCalculatePairRoutesDistributionSimilarityThroughServiceEngine(t *testing.T) {
	spy := &appTestEngine{name: "spy-engine"}
	svc := newConsensusEngineTestService(t, spy)
	defer svc.Close()
	a, err := svc.CreateSurfaceSnapshot(capturePayload("public_web", "anonymous", "Public", []captureItem{{1, "p1", "type-a"}, {2, "p2", "type-b"}}))
	if err != nil {
		t.Fatal(err)
	}
	_, err = svc.CreateSurfaceSnapshot(capturePayload("subscriber_app", "active_subscriber", "Subscriber", []captureItem{{1, "p3", "type-a"}, {2, "p4", "type-c"}}))
	if err != nil {
		t.Fatal(err)
	}
	pairs, err := svc.AutoPairCaptureBatch(a.CaptureBatchID, 10*time.Minute)
	if err != nil || len(pairs) != 1 {
		t.Fatalf("pairs=%+v err=%v", pairs, err)
	}
	view, err := svc.CalculatePair(pairs[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	if spy.distCalls < 3 {
		t.Fatalf("distribution calls=%d", spy.distCalls)
	}
	if view.PairMetrics.ProductTypeSimilarity != 12 || view.PairMetrics.UseCaseSimilarity != 12 || view.PairMetrics.CatalogSimilarity != 12 {
		t.Fatalf("metrics=%+v", view.PairMetrics)
	}
}

func TestRefreshConsensusRoutesSelectionAndClusterVolatilityThroughServiceEngine(t *testing.T) {
	spy := &appTestEngine{name: "spy-engine"}
	svc := newConsensusEngineTestService(t, spy)
	defer svc.Close()
	if _, err := svc.CreateSurfaceSnapshot(capturePayload("public_web", "anonymous", "Public", []captureItem{{1, "p1", "type-a"}, {2, "p2", "type-b"}})); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.CreateSurfaceSnapshot(capturePayload("subscriber_app", "active_subscriber", "Subscriber", []captureItem{{1, "p3", "type-a"}, {2, "p4", "type-c"}})); err != nil {
		t.Fatal(err)
	}
	view, err := svc.RefreshMultiContextConsensus(domain.ConsensusRefreshRequest{CatalogPath: "/graphic-templates"})
	if err != nil {
		t.Fatal(err)
	}
	if spy.selectionCalls == 0 || spy.clusterCalls == 0 {
		t.Fatalf("selection=%d cluster=%d", spy.selectionCalls, spy.clusterCalls)
	}
	found := false
	for _, row := range view.Matrix {
		if row.SelectionProbability == 15 && row.Volatility == 14 {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("engine outputs not reflected in matrix: %+v", view.Matrix)
	}
}
