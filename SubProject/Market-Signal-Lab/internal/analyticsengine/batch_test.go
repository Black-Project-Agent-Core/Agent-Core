package analyticsengine

import (
	"bytes"
	"context"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestEncodeAnalyticsBatchV2PreservesOperationOrder(t *testing.T) {
	rank := 3
	batch := AnalyticsBatch{Operations: []BatchOperation{
		{SlotID: 40, OperationID: V2OpDistributionSimilarity, SchemaID: 1, Input: DistributionSimilarityInput{A: map[string]float64{"a": 1}, B: map[string]float64{"a": 1}}},
		{SlotID: 10, OperationID: V2OpItemVolatility, SchemaID: 1, Input: ItemVolatilityInput{Ranks: []*int{&rank}, TopK: 10, ConsecutiveAppearances: 1, EligibleSnapshots: 1}},
		{SlotID: 30, OperationID: V2OpClusterVolatility, SchemaID: 1, Input: ClusterVolatilityInput{Shares: []float64{1}, ContextDisagreement: 0, CrossTimePersistence: 1}},
		{SlotID: 20, OperationID: V2OpSelectionProbability, SchemaID: 1, Input: SelectionProbabilityInput{Observations: []SelectionObservation{{Weight: 1, Selected: true}}}},
	}}
	encoded, err := encodeAnalyticsBatchV2(77, batch, nil)
	if err != nil {
		t.Fatal(err)
	}
	frame, err := readV2WireFrame(bytes.NewReader(encoded))
	if err != nil {
		t.Fatal(err)
	}
	wantSlots := []uint32{40, 10, 30, 20}
	wantOps := []V2OperationID{V2OpDistributionSimilarity, V2OpItemVolatility, V2OpClusterVolatility, V2OpSelectionProbability}
	for i, d := range frame.Descriptors {
		if d.SlotID != wantSlots[i] || d.OperationID != wantOps[i] {
			t.Fatalf("descriptor %d=%+v", i, d)
		}
	}
}

func TestAnalyticsBatchRejectsDuplicateSlot(t *testing.T) {
	batch := AnalyticsBatch{Operations: []BatchOperation{
		{SlotID: 1, OperationID: V2OpSelectionProbability, SchemaID: 1},
		{SlotID: 1, OperationID: V2OpClusterVolatility, SchemaID: 1},
	}}
	if err := validateAnalyticsBatch(batch); err == nil {
		t.Fatal("duplicate slot must fail")
	}
}

func TestWaitingBatchIsNotPreEncoded(t *testing.T) {
	worker := buildFakeV2Worker(t)
	tracePath := filepath.Join(t.TempDir(), "trace.log")
	client := NewRustV2Client(worker, time.Second)
	client.args = []string{"slow-batch"}
	client.env = []string{"MSL_FAKE_WORKER_TRACE=" + tracePath}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := client.Start(ctx); err != nil {
		t.Fatal(err)
	}
	defer client.Close()

	firstDone := make(chan error, 1)
	go func() { _, err := client.ExecuteBatch(context.Background(), testBatch(51)); firstDone <- err }()
	waitForTraceCount(t, tracePath, "analytics:", 1, time.Second)

	badWaiting := AnalyticsBatch{Operations: []BatchOperation{{
		SlotID: 52, OperationID: V2OpSelectionProbability, SchemaID: 1, Input: "wrong-input-type",
	}}}
	waitingDone := make(chan error, 1)
	go func() { _, err := client.ExecuteBatch(context.Background(), badWaiting); waitingDone <- err }()
	select {
	case err := <-waitingDone:
		t.Fatalf("waiting batch was encoded before becoming active: %v", err)
	case <-time.After(60 * time.Millisecond):
	}
	if err := <-firstDone; err != nil {
		t.Fatal(err)
	}
	if err := <-waitingDone; err == nil || !strings.Contains(err.Error(), "input type mismatch") {
		t.Fatalf("active bad batch err=%v", err)
	}
	if got := countTracePrefix(tracePath, "analytics:"); got != 1 {
		t.Fatalf("bad waiting batch reached worker; requests=%d", got)
	}
}
