package analyticsengine

import (
	"context"
	"errors"
	"time"
)

var ErrRuntimeUnavailable = errors.New("rust production analytics runtime unavailable")

type ProductionRuntime struct {
	engine Engine
	batch  BatchExecutor
}

type productionEngine struct {
	Engine
}

func (e *productionEngine) Name() string { return "rust-production" }

func NewProductionRuntime(ctx context.Context, workerPath string, timeout time.Duration) *ProductionRuntime {
	rust := NewRustEngine(ctx, workerPath, timeout)
	return &ProductionRuntime{
		engine: &productionEngine{Engine: rust},
		batch:  rust,
	}
}

func NewProductionRuntimeWithEngine(engine Engine) *ProductionRuntime {
	if engine == nil {
		return &ProductionRuntime{}
	}
	runtime := &ProductionRuntime{engine: &productionEngine{Engine: engine}}
	if batch, ok := engine.(BatchExecutor); ok {
		runtime.batch = batch
	}
	return runtime
}

func (r *ProductionRuntime) Engine() Engine {
	if r == nil {
		return nil
	}
	return r.engine
}

func (r *ProductionRuntime) ExecuteAnalyticsBatch(ctx context.Context, batch AnalyticsBatch) (AnalyticsBatchResult, error) {
	if r == nil || r.batch == nil {
		return AnalyticsBatchResult{}, ErrRuntimeUnavailable
	}
	return r.batch.ExecuteAnalyticsBatch(ctx, batch)
}

func (r *ProductionRuntime) Health(ctx context.Context) Health {
	if r == nil || r.engine == nil {
		return Health{Status: EngineUnavailable, Engine: "rust-production", Protocol: ProtocolV2, Message: ErrRuntimeUnavailable.Error()}
	}
	h := r.engine.Health(ctx)
	h.Engine = "rust-production"
	return h
}

func (r *ProductionRuntime) Ready(ctx context.Context) error {
	h := r.Health(ctx)
	if h.Status != EngineHealthy {
		if h.Message != "" {
			return errors.Join(ErrRuntimeUnavailable, errors.New(h.Message))
		}
		return ErrRuntimeUnavailable
	}
	return nil
}

func (r *ProductionRuntime) Close() error {
	if r == nil || r.engine == nil {
		return nil
	}
	return r.engine.Close()
}
