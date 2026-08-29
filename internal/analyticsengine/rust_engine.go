package analyticsengine

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

type RustEngine struct {
	client   *RustV2Client
	startErr error
}

func DefaultRustWorkerPath() string {
	if override := strings.TrimSpace(os.Getenv("MSL_RUST_WORKER")); override != "" {
		return override
	}
	exe, err := os.Executable()
	if err != nil {
		exe = "."
	}
	base := filepath.Dir(exe)
	if runtime.GOOS == "windows" {
		return filepath.Join(base, "engines", "rust", "msl-analytics-rust.exe")
	}
	if cwd, err := os.Getwd(); err == nil {
		candidate := filepath.Join(cwd, "engines", "rust", "target", "release", "msl-analytics-rust")
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}
	return filepath.Join(base, "engines", "rust", "target", "release", "msl-analytics-rust")
}

func NewRustEngine(ctx context.Context, workerPath string, timeout time.Duration) *RustEngine {
	if workerPath == "" {
		workerPath = DefaultRustWorkerPath()
	}
	client := NewRustV2Client(workerPath, 0)
	engine := &RustEngine{client: client}
	if _, err := os.Stat(workerPath); err != nil {
		engine.startErr = err
		client.health = Health{Status: EngineUnavailable, Engine: "rust-native", Version: "0.1.0", Protocol: ProtocolV2, Message: "rust analytics worker is unavailable"}
		return engine
	}
	startCtx := ctx
	var cancel context.CancelFunc
	if timeout > 0 {
		if _, ok := ctx.Deadline(); !ok {
			startCtx, cancel = context.WithTimeout(ctx, timeout)
			defer cancel()
		}
	}
	engine.startErr = client.Start(startCtx)
	return engine
}

func (e *RustEngine) Name() string               { return "rust-native" }
func (e *RustEngine) Version() string            { return "0.1.0" }
func (e *RustEngine) Capabilities() []Capability { return PilotCapabilities() }
func (e *RustEngine) Health(context.Context) Health {
	if e == nil || e.client == nil {
		return Health{Status: EngineUnavailable, Engine: "rust-native", Version: "0.1.0", Protocol: ProtocolV2}
	}
	return e.client.Health()
}
func (e *RustEngine) Close() error {
	if e == nil || e.client == nil {
		return nil
	}
	return e.client.Close()
}

func (e *RustEngine) ensureReady() error {
	if e == nil || e.client == nil {
		return errors.New("rust analytics engine is unavailable")
	}
	if e.startErr != nil {
		return errors.New("rust analytics worker is unavailable")
	}
	if e.client.Health().Status == EngineUnavailable {
		return errors.New("rust analytics worker is unavailable")
	}
	return nil
}

func (e *RustEngine) ExecuteAnalyticsBatch(ctx context.Context, batch AnalyticsBatch) (AnalyticsBatchResult, error) {
	if err := e.ensureReady(); err != nil {
		return AnalyticsBatchResult{}, err
	}
	return e.client.ExecuteBatch(ctx, batch)
}

func (e *RustEngine) executeOne(ctx context.Context, operationID V2OperationID, input any) ([]byte, error) {
	if err := e.ensureReady(); err != nil {
		return nil, err
	}
	result, err := e.client.ExecuteBatch(ctx, AnalyticsBatch{Operations: []BatchOperation{{
		SlotID: 1, OperationID: operationID, SchemaID: 1, Input: input,
	}}})
	if err != nil {
		return nil, err
	}
	if len(result.Operations) != 1 {
		return nil, fmt.Errorf("rust analytics v2 response operation count=%d want=1", len(result.Operations))
	}
	op := result.Operations[0]
	if op.SlotID != 1 {
		return nil, fmt.Errorf("rust analytics v2 response slot=%d want=1", op.SlotID)
	}
	if op.Err != nil {
		return nil, op.Err
	}
	return op.Payload, nil
}

func (e *RustEngine) DistributionSimilarity(ctx context.Context, in DistributionSimilarityInput) (DistributionSimilarityResult, error) {
	payload, err := e.executeOne(ctx, V2OpDistributionSimilarity, in)
	if err != nil {
		return DistributionSimilarityResult{}, err
	}
	return DecodeDistributionSimilarityResultV2(payload)
}
func (e *RustEngine) ItemVolatility(ctx context.Context, in ItemVolatilityInput) (VolatilityResult, error) {
	payload, err := e.executeOne(ctx, V2OpItemVolatility, in)
	if err != nil {
		return VolatilityResult{}, err
	}
	return DecodeVolatilityResultV2(payload)
}
func (e *RustEngine) ClusterVolatility(ctx context.Context, in ClusterVolatilityInput) (VolatilityResult, error) {
	payload, err := e.executeOne(ctx, V2OpClusterVolatility, in)
	if err != nil {
		return VolatilityResult{}, err
	}
	return DecodeVolatilityResultV2(payload)
}
func (e *RustEngine) SelectionProbability(ctx context.Context, in SelectionProbabilityInput) (SelectionProbabilityResult, error) {
	payload, err := e.executeOne(ctx, V2OpSelectionProbability, in)
	if err != nil {
		return SelectionProbabilityResult{}, err
	}
	return DecodeSelectionProbabilityResultV2(payload)
}
