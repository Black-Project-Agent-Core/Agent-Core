package analyticsengine

import (
	"context"
	"testing"
)

type mirrorEngine struct {
	base  Engine
	shift float64
}

func (m *mirrorEngine) Name() string               { return "mirror" }
func (m *mirrorEngine) Version() string            { return "test" }
func (m *mirrorEngine) Capabilities() []Capability { return PilotCapabilities() }
func (m *mirrorEngine) Health(context.Context) Health {
	return Health{Status: EngineHealthy, Engine: m.Name(), Version: m.Version(), Protocol: ProtocolV1}
}
func (m *mirrorEngine) DistributionSimilarity(ctx context.Context, in DistributionSimilarityInput) (DistributionSimilarityResult, error) {
	out, err := m.base.DistributionSimilarity(ctx, in)
	out.Score += m.shift
	return out, err
}
func (m *mirrorEngine) ItemVolatility(ctx context.Context, in ItemVolatilityInput) (VolatilityResult, error) {
	return m.base.ItemVolatility(ctx, in)
}
func (m *mirrorEngine) ClusterVolatility(ctx context.Context, in ClusterVolatilityInput) (VolatilityResult, error) {
	return m.base.ClusterVolatility(ctx, in)
}
func (m *mirrorEngine) SelectionProbability(ctx context.Context, in SelectionProbabilityInput) (SelectionProbabilityResult, error) {
	return m.base.SelectionProbability(ctx, in)
}
func (m *mirrorEngine) Close() error { return nil }

func TestDeterministicParityCorpusIsStable(t *testing.T) {
	a := BuildDeterministicCorpus(10000)
	b := BuildDeterministicCorpus(10000)
	if a.Observations != 10000 || b.Observations != 10000 {
		t.Fatalf("counts=%d %d", a.Observations, b.Observations)
	}
	if CorpusFingerprint(a) != CorpusFingerprint(b) {
		t.Fatal("corpus is not deterministic")
	}
	if len(a.Selection.Observations) != 10000 {
		t.Fatalf("selection=%d", len(a.Selection.Observations))
	}
}

func TestParityCorpusPassesEquivalentEngineAndOpensBenchmarkGate(t *testing.T) {
	goEngine := newReferenceEngine()
	candidate := &mirrorEngine{base: goEngine}
	report := RunParityCorpus(context.Background(), goEngine, candidate, BuildDeterministicCorpus(10000))
	if !report.Verified {
		t.Fatalf("report=%+v", report)
	}
	if !BenchmarkGateOpen(report) {
		t.Fatal("benchmark gate should open after verified parity")
	}
	if len(report.Checks) != 4 {
		t.Fatalf("checks=%d", len(report.Checks))
	}
}

func TestParityCorpusMismatchKeepsBenchmarkGateClosed(t *testing.T) {
	goEngine := newReferenceEngine()
	candidate := &mirrorEngine{base: goEngine, shift: 0.01}
	report := RunParityCorpus(context.Background(), goEngine, candidate, BuildDeterministicCorpus(10000))
	if report.Verified || BenchmarkGateOpen(report) {
		t.Fatalf("gate opened on mismatch: %+v", report)
	}
}
