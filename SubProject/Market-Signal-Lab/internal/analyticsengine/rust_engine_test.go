package analyticsengine

import (
	"context"
	"path/filepath"
	"testing"
	"time"
)

func TestRustEngineUsesWorkerProtocol(t *testing.T) {
	path := buildFakeV2Worker(t)
	engine := NewRustEngine(context.Background(), path, time.Second)
	defer engine.Close()
	if got := engine.Health(context.Background()); got.Status != EngineHealthy || got.Protocol != ProtocolV2 {
		t.Fatalf("health=%+v", got)
	}
	if engine.Name() != "rust-native" || engine.Version() != "0.1.0" {
		t.Fatalf("name=%q version=%q", engine.Name(), engine.Version())
	}
	if !sameCapabilities(engine.Capabilities(), PilotCapabilities()) {
		t.Fatalf("caps=%v", engine.Capabilities())
	}
	result, err := engine.DistributionSimilarity(context.Background(), DistributionSimilarityInput{A: map[string]float64{"a": 1}, B: map[string]float64{"b": 1}})
	if err != nil {
		t.Fatal(err)
	}
	if result.Score != 42.5 {
		t.Fatalf("result=%+v", result)
	}
}

func TestRustEngineBusinessAPIsUseV2Transport(t *testing.T) {
	worker := buildFakeV2Worker(t)
	tracePath := filepath.Join(t.TempDir(), "trace.log")
	t.Setenv("MSL_FAKE_WORKER_TRACE", tracePath)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	engine := NewRustEngine(ctx, worker, time.Second)
	defer engine.Close()

	if h := engine.Health(ctx); h.Status != EngineHealthy || h.Protocol != ProtocolV2 {
		t.Errorf("health=%+v", h)
	}
	d, err := engine.DistributionSimilarity(ctx, DistributionSimilarityInput{A: map[string]float64{"a": 1}, B: map[string]float64{"a": 1}})
	if err != nil || d.Score != 42.5 {
		t.Errorf("distribution=%+v err=%v", d, err)
	}
	rank := 3
	i, err := engine.ItemVolatility(ctx, ItemVolatilityInput{Ranks: []*int{&rank}, TopK: 10, ConsecutiveAppearances: 1, EligibleSnapshots: 1})
	if err != nil || i.Score != 0.75 || i.Label != "variable" {
		t.Errorf("item=%+v err=%v", i, err)
	}
	c, err := engine.ClusterVolatility(ctx, ClusterVolatilityInput{Shares: []float64{1}, CrossTimePersistence: 1})
	if err != nil || c.Score != 0.75 || c.Label != "variable" {
		t.Errorf("cluster=%+v err=%v", c, err)
	}
	s, err := engine.SelectionProbability(ctx, SelectionProbabilityInput{Observations: []SelectionObservation{{Weight: 1, Selected: true}}})
	if err != nil || s.Score != 0.6 || s.SelectedCount != 2 || s.EligibleCount != 4 {
		t.Errorf("selection=%+v err=%v", s, err)
	}
	if got := countTracePrefix(tracePath, "analytics:"); got != 4 {
		t.Errorf("analytics frames=%d want=4", got)
	}
}

func TestRustEngineExecutesFourOperationsInOneFrame(t *testing.T) {
	worker := buildFakeV2Worker(t)
	tracePath := filepath.Join(t.TempDir(), "trace.log")
	t.Setenv("MSL_FAKE_WORKER_TRACE", tracePath)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	engine := NewRustEngine(ctx, worker, time.Second)
	defer engine.Close()

	rank := 2
	batch := AnalyticsBatch{Operations: []BatchOperation{
		{SlotID: 101, OperationID: V2OpDistributionSimilarity, SchemaID: 1, Input: DistributionSimilarityInput{A: map[string]float64{"a": 1}, B: map[string]float64{"a": 1}}},
		{SlotID: 102, OperationID: V2OpItemVolatility, SchemaID: 1, Input: ItemVolatilityInput{Ranks: []*int{&rank}, TopK: 10, EligibleSnapshots: 1}},
		{SlotID: 103, OperationID: V2OpClusterVolatility, SchemaID: 1, Input: ClusterVolatilityInput{Shares: []float64{1}, CrossTimePersistence: 1}},
		{SlotID: 104, OperationID: V2OpSelectionProbability, SchemaID: 1, Input: SelectionProbabilityInput{Observations: []SelectionObservation{{Weight: 1, Selected: true}}}},
	}}
	result, err := engine.ExecuteAnalyticsBatch(ctx, batch)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Operations) != 4 {
		t.Fatalf("operations=%d want=4", len(result.Operations))
	}
	for i, op := range result.Operations {
		if op.SlotID != uint32(101+i) || op.Status != V2StatusOK || op.Err != nil {
			t.Fatalf("operation %d=%+v", i, op)
		}
	}
	if got := countTracePrefix(tracePath, "analytics:"); got != 1 {
		t.Fatalf("analytics frames=%d want=1", got)
	}
}

func TestRustEngineMissingWorkerIsUnavailable(t *testing.T) {
	path := filepath.Join(t.TempDir(), "missing-worker")
	engine := NewRustEngine(context.Background(), path, 100*time.Millisecond)
	defer engine.Close()
	if got := engine.Health(context.Background()); got.Status != EngineUnavailable || got.Protocol != ProtocolV2 {
		t.Fatalf("health=%+v", got)
	}
	if _, err := engine.DistributionSimilarity(context.Background(), DistributionSimilarityInput{}); err == nil {
		t.Fatal("missing worker call must fail")
	}
}

func TestDefaultRustWorkerPathIsNonEmpty(t *testing.T) {
	if got := DefaultRustWorkerPath(); got == "" {
		t.Fatal("default worker path is empty")
	}
}
