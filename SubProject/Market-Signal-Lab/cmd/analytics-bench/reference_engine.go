//go:build analyticsbench

package main

import (
	"context"
	"errors"
	"math"
	"sort"

	"marketsignallab/internal/analyticsengine"
)

// benchmarkReferenceEngine is a non-production compatibility reference used
// only when the explicit analyticsbench build tag is enabled. It is not linked
// into Market Signal Lab.exe and is retained solely for benchmark evidence.
type benchmarkReferenceEngine struct{}

func newBenchmarkReferenceEngine() *benchmarkReferenceEngine { return &benchmarkReferenceEngine{} }
func (*benchmarkReferenceEngine) Name() string               { return "go-reference-benchmark-only" }
func (*benchmarkReferenceEngine) Version() string            { return "alpha6.5.2.1-reference" }
func (*benchmarkReferenceEngine) Capabilities() []analyticsengine.Capability {
	return analyticsengine.PilotCapabilities()
}
func (e *benchmarkReferenceEngine) Health(context.Context) analyticsengine.Health {
	return analyticsengine.Health{Status: analyticsengine.EngineHealthy, Engine: e.Name(), Version: e.Version(), Protocol: analyticsengine.ProtocolV1}
}
func (*benchmarkReferenceEngine) Close() error { return nil }

func benchmarkClamp(v float64) float64 {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return 0
	}
	if v < 0 {
		return 0
	}
	if v > 100 {
		return 100
	}
	return v
}
func benchmarkNormalize(in map[string]float64) map[string]float64 {
	out := map[string]float64{}
	total := 0.0
	for k, v := range in {
		if v > 0 && !math.IsNaN(v) && !math.IsInf(v, 0) {
			out[k] = v
			total += v
		}
	}
	if total > 0 {
		for k, v := range out {
			out[k] = v / total
		}
	}
	return out
}
func (*benchmarkReferenceEngine) DistributionSimilarity(_ context.Context, in analyticsengine.DistributionSimilarityInput) (analyticsengine.DistributionSimilarityResult, error) {
	pa, pb := benchmarkNormalize(in.A), benchmarkNormalize(in.B)
	if len(pa) == 0 || len(pb) == 0 {
		return analyticsengine.DistributionSimilarityResult{}, nil
	}
	keys := map[string]bool{}
	for k := range pa {
		keys[k] = true
	}
	for k := range pb {
		keys[k] = true
	}
	mid := map[string]float64{}
	for k := range keys {
		mid[k] = (pa[k] + pb[k]) / 2
	}
	kl := func(p, m map[string]float64) float64 {
		sum := 0.0
		for k, pv := range p {
			if pv > 0 && m[k] > 0 {
				sum += pv * math.Log(pv/m[k])
			}
		}
		return sum
	}
	jsd := 0.5*kl(pa, mid) + 0.5*kl(pb, mid)
	return analyticsengine.DistributionSimilarityResult{Score: benchmarkClamp(100 * (1 - jsd/math.Log(2)))}, nil
}
func benchmarkVariance(xs []float64) float64 {
	if len(xs) == 0 {
		return 0
	}
	mean := 0.0
	for _, x := range xs {
		mean += x
	}
	mean /= float64(len(xs))
	v := 0.0
	for _, x := range xs {
		d := x - mean
		v += d * d
	}
	return v / float64(len(xs))
}
func benchmarkMedian(xs []float64) float64 {
	if len(xs) == 0 {
		return 0
	}
	ys := append([]float64(nil), xs...)
	sort.Float64s(ys)
	n := len(ys)
	if n%2 == 1 {
		return ys[n/2]
	}
	return (ys[n/2-1] + ys[n/2]) / 2
}
func benchmarkMAD(xs []float64) float64 {
	m := benchmarkMedian(xs)
	d := make([]float64, len(xs))
	for i, x := range xs {
		d[i] = math.Abs(x - m)
	}
	return benchmarkMedian(d)
}
func benchmarkVolLabel(score float64) string {
	if score < 25 {
		return "stable"
	}
	if score < 45 {
		return "variable"
	}
	if score < 65 {
		return "unstable"
	}
	return "extreme"
}
func (*benchmarkReferenceEngine) ItemVolatility(_ context.Context, in analyticsengine.ItemVolatilityInput) (analyticsengine.VolatilityResult, error) {
	eligible := in.EligibleSnapshots
	if eligible <= 0 {
		eligible = len(in.Ranks)
	}
	topK := in.TopK
	if topK <= 0 {
		topK = 1
	}
	values := []float64{}
	missing := 0
	for _, rank := range in.Ranks {
		if rank == nil {
			missing++
			continue
		}
		values = append(values, float64(*rank))
	}
	rankVariance := benchmarkClamp(math.Sqrt(benchmarkVariance(values)) / float64(topK) * 300)
	absence := 0.0
	if eligible > 0 {
		absence = 100 * float64(missing) / float64(eligible)
	}
	mad := benchmarkClamp(benchmarkMAD(values) / float64(topK) * 300)
	inverseRBO := benchmarkClamp(100 - in.RBOToPrevious)
	consecutive := 0.0
	if eligible > 0 {
		consecutive = 100 * float64(in.ConsecutiveAppearances) / float64(eligible)
	}
	score := benchmarkClamp(rankVariance*.30 + absence*.25 + inverseRBO*.20 + mad*.10 + (100-consecutive)*.15)
	return analyticsengine.VolatilityResult{Score: score, Label: benchmarkVolLabel(score), RankVariance: rankVariance, AbsenceRate: absence, MedianAbsoluteDeviation: mad, RBOPersistence: benchmarkClamp(in.RBOToPrevious), ConsecutivePersistence: consecutive}, nil
}
func (*benchmarkReferenceEngine) ClusterVolatility(_ context.Context, in analyticsengine.ClusterVolatilityInput) (analyticsengine.VolatilityResult, error) {
	shareVariance := benchmarkClamp(math.Sqrt(benchmarkVariance(in.Shares)) * 2)
	score := benchmarkClamp(shareVariance*.40 + benchmarkClamp(in.ContextDisagreement)*.35 + benchmarkClamp(100-in.CrossTimePersistence)*.25)
	return analyticsengine.VolatilityResult{Score: score, Label: benchmarkVolLabel(score), RankVariance: shareVariance, RBOPersistence: benchmarkClamp(in.CrossTimePersistence)}, nil
}
func (*benchmarkReferenceEngine) SelectionProbability(_ context.Context, in analyticsengine.SelectionProbabilityInput) (analyticsengine.SelectionProbabilityResult, error) {
	if len(in.Observations) == 0 {
		return analyticsengine.SelectionProbabilityResult{}, errors.New("selection probability requires eligible observations")
	}
	eligible, selected := 0.0, 0.0
	selectedCount := 0
	for _, o := range in.Observations {
		if o.Weight <= 0 {
			return analyticsengine.SelectionProbabilityResult{}, errors.New("selection observation weight must be positive")
		}
		eligible += o.Weight
		if o.Selected {
			selected += o.Weight
			selectedCount++
		}
	}
	if eligible <= 0 {
		return analyticsengine.SelectionProbabilityResult{}, errors.New("empty eligible denominator")
	}
	return analyticsengine.SelectionProbabilityResult{Score: benchmarkClamp(100 * selected / eligible), SelectedCount: selectedCount, EligibleCount: len(in.Observations), SelectedWeight: selected, EligibleWeight: eligible}, nil
}
