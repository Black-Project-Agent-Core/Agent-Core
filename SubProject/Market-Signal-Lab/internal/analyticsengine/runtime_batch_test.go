package analyticsengine

import (
	"context"
	"errors"
	"testing"
)

type runtimeBatchEngine struct {
	Engine
	result AnalyticsBatchResult
	err    error
	seen   AnalyticsBatch
}

func (e *runtimeBatchEngine) ExecuteAnalyticsBatch(_ context.Context, batch AnalyticsBatch) (AnalyticsBatchResult, error) {
	e.seen = batch
	return e.result, e.err
}

func TestRuntimeBatchForwardsToBatchExecutor(t *testing.T) {
	fake := &runtimeBatchEngine{result: AnalyticsBatchResult{}}
	runtime := NewProductionRuntimeWithEngine(fake)
	batch := AnalyticsBatch{Operations: []BatchOperation{{SlotID: 7, OperationID: V2OpProductRankingV01, SchemaID: 1}}}
	_, err := runtime.ExecuteAnalyticsBatch(context.Background(), batch)
	if err != nil {
		t.Fatalf("ExecuteAnalyticsBatch: %v", err)
	}
	if len(fake.seen.Operations) != 1 || fake.seen.Operations[0].SlotID != 7 {
		t.Fatalf("forwarded batch=%+v", fake.seen)
	}
}

func TestRuntimeBatchUnavailableWithoutBatchExecutor(t *testing.T) {
	runtime := NewProductionRuntimeWithEngine(&fakeEngineForRuntime{})
	_, err := runtime.ExecuteAnalyticsBatch(context.Background(), AnalyticsBatch{})
	if err == nil {
		t.Fatal("expected batch executor error")
	}
	if !errors.Is(err, ErrRuntimeUnavailable) {
		t.Fatalf("err=%v want ErrRuntimeUnavailable", err)
	}
}

func TestRustEngineSatisfiesBatchExecutor(t *testing.T) {
	var _ BatchExecutor = (*RustEngine)(nil)
}

type fakeEngineForRuntime struct{}

func (*fakeEngineForRuntime) Name() string                  { return "fake" }
func (*fakeEngineForRuntime) Version() string               { return "1" }
func (*fakeEngineForRuntime) Capabilities() []Capability    { return nil }
func (*fakeEngineForRuntime) Health(context.Context) Health { return Health{Status: EngineHealthy} }
func (*fakeEngineForRuntime) Close() error                  { return nil }
func (*fakeEngineForRuntime) DistributionSimilarity(context.Context, DistributionSimilarityInput) (DistributionSimilarityResult, error) {
	return DistributionSimilarityResult{}, nil
}
func (*fakeEngineForRuntime) ItemVolatility(context.Context, ItemVolatilityInput) (VolatilityResult, error) {
	return VolatilityResult{}, nil
}
func (*fakeEngineForRuntime) ClusterVolatility(context.Context, ClusterVolatilityInput) (VolatilityResult, error) {
	return VolatilityResult{}, nil
}
func (*fakeEngineForRuntime) SelectionProbability(context.Context, SelectionProbabilityInput) (SelectionProbabilityResult, error) {
	return SelectionProbabilityResult{}, nil
}
