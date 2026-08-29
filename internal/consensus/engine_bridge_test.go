package consensus

import (
	"context"
	"errors"
	"math"
	"sort"
	"testing"

	"marketsignallab/internal/analyticsengine"
)

type consensusReferenceEngine struct{}

func (*consensusReferenceEngine) Name() string    { return "go-reference-test-only" }
func (*consensusReferenceEngine) Version() string { return "test" }
func (*consensusReferenceEngine) Capabilities() []analyticsengine.Capability {
	return analyticsengine.PilotCapabilities()
}
func (*consensusReferenceEngine) Health(context.Context) analyticsengine.Health {
	return analyticsengine.Health{Status: analyticsengine.EngineHealthy, Engine: "go-reference-test-only", Protocol: analyticsengine.ProtocolV1}
}
func (*consensusReferenceEngine) Close() error { return nil }
func refClamp(v float64) float64 {
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
func refNorm(in map[string]float64) map[string]float64 {
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
func (*consensusReferenceEngine) DistributionSimilarity(_ context.Context, in analyticsengine.DistributionSimilarityInput) (analyticsengine.DistributionSimilarityResult, error) {
	pa, pb := refNorm(in.A), refNorm(in.B)
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
	kl := func(p map[string]float64) float64 {
		sum := 0.0
		for k, pv := range p {
			if pv > 0 && mid[k] > 0 {
				sum += pv * math.Log(pv/mid[k])
			}
		}
		return sum
	}
	jsd := .5*kl(pa) + .5*kl(pb)
	return analyticsengine.DistributionSimilarityResult{Score: refClamp(100 * (1 - jsd/math.Log(2)))}, nil
}
func refVariance(xs []float64) float64 {
	if len(xs) == 0 {
		return 0
	}
	m := 0.0
	for _, x := range xs {
		m += x
	}
	m /= float64(len(xs))
	v := 0.0
	for _, x := range xs {
		d := x - m
		v += d * d
	}
	return v / float64(len(xs))
}
func refMedian(xs []float64) float64 {
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
func refMAD(xs []float64) float64 {
	m := refMedian(xs)
	d := make([]float64, len(xs))
	for i, x := range xs {
		d[i] = math.Abs(x - m)
	}
	return refMedian(d)
}
func refLabel(s float64) string {
	if s < 25 {
		return "stable"
	}
	if s < 45 {
		return "variable"
	}
	if s < 65 {
		return "unstable"
	}
	return "extreme"
}
func (*consensusReferenceEngine) ItemVolatility(_ context.Context, in analyticsengine.ItemVolatilityInput) (analyticsengine.VolatilityResult, error) {
	eligible := in.EligibleSnapshots
	if eligible <= 0 {
		eligible = len(in.Ranks)
	}
	top := in.TopK
	if top <= 0 {
		top = 1
	}
	vals := []float64{}
	missing := 0
	for _, r := range in.Ranks {
		if r == nil {
			missing++
			continue
		}
		vals = append(vals, float64(*r))
	}
	rv := refClamp(math.Sqrt(refVariance(vals)) / float64(top) * 300)
	absence := 0.0
	if eligible > 0 {
		absence = 100 * float64(missing) / float64(eligible)
	}
	mad := refClamp(refMAD(vals) / float64(top) * 300)
	invRBO := refClamp(100 - in.RBOToPrevious)
	consecutive := 0.0
	if eligible > 0 {
		consecutive = 100 * float64(in.ConsecutiveAppearances) / float64(eligible)
	}
	score := refClamp(rv*.30 + absence*.25 + invRBO*.20 + mad*.10 + (100-consecutive)*.15)
	return analyticsengine.VolatilityResult{Score: score, Label: refLabel(score), RankVariance: rv, AbsenceRate: absence, MedianAbsoluteDeviation: mad, RBOPersistence: refClamp(in.RBOToPrevious), ConsecutivePersistence: consecutive}, nil
}
func (*consensusReferenceEngine) ClusterVolatility(_ context.Context, in analyticsengine.ClusterVolatilityInput) (analyticsengine.VolatilityResult, error) {
	rv := refClamp(math.Sqrt(refVariance(in.Shares)) * 2)
	score := refClamp(rv*.40 + refClamp(in.ContextDisagreement)*.35 + refClamp(100-in.CrossTimePersistence)*.25)
	return analyticsengine.VolatilityResult{Score: score, Label: refLabel(score), RankVariance: rv, RBOPersistence: refClamp(in.CrossTimePersistence)}, nil
}
func (*consensusReferenceEngine) SelectionProbability(_ context.Context, in analyticsengine.SelectionProbabilityInput) (analyticsengine.SelectionProbabilityResult, error) {
	if len(in.Observations) == 0 {
		return analyticsengine.SelectionProbabilityResult{}, errors.New("selection probability requires eligible observations")
	}
	ew, sw := 0.0, 0.0
	sc := 0
	for _, o := range in.Observations {
		if o.Weight <= 0 || math.IsNaN(o.Weight) || math.IsInf(o.Weight, 0) {
			return analyticsengine.SelectionProbabilityResult{}, errors.New("selection observation weight must be positive")
		}
		ew += o.Weight
		if o.Selected {
			sw += o.Weight
			sc++
		}
	}
	return analyticsengine.SelectionProbabilityResult{Score: refClamp(100 * sw / ew), SelectedCount: sc, EligibleCount: len(in.Observations), SelectedWeight: sw, EligibleWeight: ew}, nil
}

var testAnalyticsEngine analyticsengine.Engine = &consensusReferenceEngine{}

func TestWithEngineAPIsRejectNilEngine(t *testing.T) {
	if _, err := JensenShannonSimilarityWithEngine(context.Background(), nil, map[string]float64{"a": 1}, map[string]float64{"a": 1}); !errors.Is(err, ErrAnalyticsEngineRequired) {
		t.Fatalf("err=%v", err)
	}
	if _, err := BuildSelectionProbabilityWithEngine(context.Background(), nil, SelectionInput{}); !errors.Is(err, ErrAnalyticsEngineRequired) {
		t.Fatalf("err=%v", err)
	}
}
