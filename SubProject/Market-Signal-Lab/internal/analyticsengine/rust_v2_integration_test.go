package analyticsengine

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"
)

func TestRustV2RealWorkerIntegration(t *testing.T) {
	worker := strings.TrimSpace(os.Getenv("MSL_RUST_WORKER"))
	if worker == "" {
		t.Skip("MSL_RUST_WORKER is not set; real Rust v2 integration requires the compiled worker")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	engine := NewRustEngine(ctx, worker, 2*time.Second)
	defer engine.Close()
	if h := engine.Health(ctx); h.Status != EngineHealthy || h.Protocol != ProtocolV2 {
		t.Fatalf("health=%+v", h)
	}

	r1, r2 := 1, 2
	result, err := engine.ExecuteAnalyticsBatch(ctx, AnalyticsBatch{Operations: []BatchOperation{
		{SlotID: 1, OperationID: V2OpDistributionSimilarity, SchemaID: 1, Input: DistributionSimilarityInput{A: map[string]float64{"a": 1}, B: map[string]float64{"a": 1}}},
		{SlotID: 2, OperationID: V2OpItemVolatility, SchemaID: 1, Input: ItemVolatilityInput{Ranks: []*int{&r1, &r2}, TopK: 10, ConsecutiveAppearances: 2, EligibleSnapshots: 2, RBOToPrevious: 1}},
		{SlotID: 3, OperationID: V2OpClusterVolatility, SchemaID: 1, Input: ClusterVolatilityInput{Shares: []float64{0.5, 0.5}, CrossTimePersistence: 1}},
		{SlotID: 4, OperationID: V2OpSelectionProbability, SchemaID: 1, Input: SelectionProbabilityInput{Observations: []SelectionObservation{{Weight: 1, Selected: true}, {Weight: 1, Selected: false}}}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Operations) != 4 {
		t.Fatalf("operations=%d want=4", len(result.Operations))
	}
	for i, op := range result.Operations {
		if op.SlotID != uint32(i+1) || op.Status != V2StatusOK || op.Err != nil || len(op.Payload) == 0 {
			t.Fatalf("operation %d=%+v", i, op)
		}
	}
}
