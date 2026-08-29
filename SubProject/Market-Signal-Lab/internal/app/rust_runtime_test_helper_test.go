package app

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"marketsignallab/internal/analyticsengine"
)

func rankingParityWorkerPath(t *testing.T) string {
	t.Helper()
	if path := strings.TrimSpace(os.Getenv("MSL_RUST_WORKER")); path != "" {
		return path
	}
	candidates := []string{
		filepath.Join("..", "..", "engines", "rust", "target", "release", "msl-analytics-rust"),
		filepath.Join("..", "..", "engines", "rust", "target", "debug", "msl-analytics-rust"),
	}
	for _, candidate := range candidates {
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate
		}
	}
	t.Skip("real Rust worker is unavailable; build engines/rust and/or set MSL_RUST_WORKER")
	return ""
}

func rankingParityRuntime(t *testing.T) *analyticsengine.ProductionRuntime {
	t.Helper()
	runtime := analyticsengine.NewProductionRuntime(context.Background(), rankingParityWorkerPath(t), 120*time.Second)
	t.Cleanup(func() { _ = runtime.Close() })
	health := runtime.Health(context.Background())
	if health.Status != analyticsengine.EngineHealthy || health.Engine != "rust-production" || health.Protocol != analyticsengine.ProtocolV2 {
		t.Fatalf("real Rust runtime health=%+v", health)
	}
	return runtime
}
