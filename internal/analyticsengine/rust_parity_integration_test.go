package analyticsengine

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"strings"
	"testing"
	"time"
)

func realRustWorkerForParity(t *testing.T) *RustEngine {
	t.Helper()
	path := strings.TrimSpace(os.Getenv("MSL_RUST_WORKER"))
	if path == "" {
		t.Skip("MSL_RUST_WORKER is not set; real Rust parity requires the compiled worker")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	engine := NewRustEngine(ctx, path, 120*time.Second)
	cancel()
	t.Cleanup(func() { _ = engine.Close() })
	if health := engine.Health(context.Background()); health.Status != EngineHealthy {
		t.Fatalf("Rust worker is not healthy: %+v", health)
	}
	return engine
}

func TestRustReferenceVectorParity(t *testing.T) {
	engine := realRustWorkerForParity(t)
	fixture := loadReferenceFixture(t, "testdata/reference_vectors_v6521.json")
	ctx := context.Background()

	for _, tc := range fixture.DistributionSimilarity {
		t.Run("distribution/"+tc.Name, func(t *testing.T) {
			var input DistributionSimilarityInput
			var expected DistributionSimilarityResult
			if err := json.Unmarshal(tc.Input, &input); err != nil {
				t.Fatal(err)
			}
			if err := json.Unmarshal(tc.Expected, &expected); err != nil {
				t.Fatal(err)
			}
			got, err := engine.DistributionSimilarity(ctx, input)
			if err != nil {
				t.Fatal(err)
			}
			if delta := math.Abs(got.Score - expected.Score); delta > fixture.Tolerances.DistributionSimilarity {
				t.Fatalf("score delta=%g got=%+v expected=%+v", delta, got, expected)
			}
		})
	}

	for _, tc := range fixture.ItemVolatility {
		t.Run("item/"+tc.Name, func(t *testing.T) {
			var input ItemVolatilityInput
			var expected VolatilityResult
			if err := json.Unmarshal(tc.Input, &input); err != nil {
				t.Fatal(err)
			}
			if err := json.Unmarshal(tc.Expected, &expected); err != nil {
				t.Fatal(err)
			}
			got, err := engine.ItemVolatility(ctx, input)
			if err != nil {
				t.Fatal(err)
			}
			delta, ok := parityVolatilityDelta(expected, got)
			if !ok || delta > fixture.Tolerances.Volatility {
				t.Fatalf("volatility delta=%g got=%+v expected=%+v", delta, got, expected)
			}
		})
	}

	for _, tc := range fixture.ClusterVolatility {
		t.Run("cluster/"+tc.Name, func(t *testing.T) {
			var input ClusterVolatilityInput
			var expected VolatilityResult
			if err := json.Unmarshal(tc.Input, &input); err != nil {
				t.Fatal(err)
			}
			if err := json.Unmarshal(tc.Expected, &expected); err != nil {
				t.Fatal(err)
			}
			got, err := engine.ClusterVolatility(ctx, input)
			if err != nil {
				t.Fatal(err)
			}
			delta, ok := parityVolatilityDelta(expected, got)
			if !ok || delta > fixture.Tolerances.Volatility {
				t.Fatalf("volatility delta=%g got=%+v expected=%+v", delta, got, expected)
			}
		})
	}

	for _, tc := range fixture.SelectionProbability {
		t.Run("selection/"+tc.Name, func(t *testing.T) {
			var input SelectionProbabilityInput
			if err := json.Unmarshal(tc.Input, &input); err != nil {
				t.Fatal(err)
			}
			got, err := engine.SelectionProbability(ctx, input)
			if tc.ExpectedError != "" {
				if err == nil || !strings.Contains(err.Error(), tc.ExpectedError) {
					t.Fatalf("error=%v want substring %q", err, tc.ExpectedError)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			var expected SelectionProbabilityResult
			if err := json.Unmarshal(tc.Expected, &expected); err != nil {
				t.Fatal(err)
			}
			delta, ok := paritySelectionDelta(expected, got)
			if !ok || delta > fixture.Tolerances.SelectionProbability {
				t.Fatalf("selection delta=%g got=%+v expected=%+v", delta, got, expected)
			}
		})
	}
}

func TestParityCorpus(t *testing.T) {
	candidate := realRustWorkerForParity(t)
	reference := newReferenceEngine()
	ctx := context.Background()
	for _, size := range []int{10_000, 100_000, 1_000_000} {
		size := size
		t.Run(fmt.Sprintf("%d", size), func(t *testing.T) {
			corpus := BuildDeterministicCorpus(size)
			report := RunParityCorpus(ctx, reference, candidate, corpus)
			b, _ := json.Marshal(report)
			t.Logf("PARITY_EVIDENCE=%s", b)
			if !report.Verified || report.MismatchCount != 0 || report.WorkerErrorCount != 0 {
				t.Fatalf("Rust parity failed: %+v", report)
			}
			if !BenchmarkGateOpen(report) {
				t.Fatalf("benchmark gate did not open: %+v", report)
			}
		})
	}
}
