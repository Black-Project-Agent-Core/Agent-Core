package analyticsengine

import (
	"context"
	"errors"
	"math"
	"sort"
)

type referenceEngine struct{}

func newReferenceEngine() *referenceEngine            { return &referenceEngine{} }
func (e *referenceEngine) Name() string               { return "go-reference-test-only" }
func (e *referenceEngine) Version() string            { return "0.1.0" }
func (e *referenceEngine) Capabilities() []Capability { return PilotCapabilities() }
func (e *referenceEngine) Health(context.Context) Health {
	return Health{Status: EngineHealthy, Engine: e.Name(), Version: e.Version(), Protocol: ProtocolV1}
}
func (e *referenceEngine) Close() error { return nil }

func clampScore(v float64) float64 {
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

func normalizeDistribution(in map[string]float64) map[string]float64 {
	out := map[string]float64{}
	total := 0.0
	for k, v := range in {
		if v > 0 && !math.IsNaN(v) && !math.IsInf(v, 0) {
			out[k] = v
			total += v
		}
	}
	if total == 0 {
		return out
	}
	for k, v := range out {
		out[k] = v / total
	}
	return out
}

func (e *referenceEngine) DistributionSimilarity(_ context.Context, in DistributionSimilarityInput) (DistributionSimilarityResult, error) {
	pa := normalizeDistribution(in.A)
	pb := normalizeDistribution(in.B)
	if len(pa) == 0 || len(pb) == 0 {
		return DistributionSimilarityResult{Score: 0}, nil
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
	normalized := jsd / math.Log(2)
	return DistributionSimilarityResult{Score: clampScore(100 * (1 - normalized))}, nil
}

func variance(xs []float64) float64 {
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

func median(xs []float64) float64 {
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

func medianAbsoluteDeviation(xs []float64) float64 {
	m := median(xs)
	dev := make([]float64, len(xs))
	for i, x := range xs {
		dev[i] = math.Abs(x - m)
	}
	return median(dev)
}

func volatilityLabel(score float64) string {
	switch {
	case score < 25:
		return "stable"
	case score < 45:
		return "variable"
	case score < 65:
		return "unstable"
	default:
		return "extreme"
	}
}

func (e *referenceEngine) ItemVolatility(_ context.Context, in ItemVolatilityInput) (VolatilityResult, error) {
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
	std := math.Sqrt(variance(values))
	rankVariance := clampScore(std / float64(topK) * 300)
	absence := 0.0
	if eligible > 0 {
		absence = 100 * float64(missing) / float64(eligible)
	}
	mad := clampScore(medianAbsoluteDeviation(values) / float64(topK) * 300)
	inverseRBO := clampScore(100 - in.RBOToPrevious)
	consecutive := 0.0
	if eligible > 0 {
		consecutive = 100 * float64(in.ConsecutiveAppearances) / float64(eligible)
	}
	inverseConsecutive := 100 - consecutive
	score := clampScore(rankVariance*.30 + absence*.25 + inverseRBO*.20 + mad*.10 + inverseConsecutive*.15)
	return VolatilityResult{Score: score, Label: volatilityLabel(score), RankVariance: rankVariance, AbsenceRate: absence, MedianAbsoluteDeviation: mad, RBOPersistence: clampScore(in.RBOToPrevious), ConsecutivePersistence: consecutive}, nil
}

func (e *referenceEngine) ClusterVolatility(_ context.Context, in ClusterVolatilityInput) (VolatilityResult, error) {
	shareStd := math.Sqrt(variance(in.Shares))
	shareVariance := clampScore(shareStd * 2)
	score := clampScore(shareVariance*.40 + clampScore(in.ContextDisagreement)*.35 + clampScore(100-in.CrossTimePersistence)*.25)
	return VolatilityResult{Score: score, Label: volatilityLabel(score), RankVariance: shareVariance, RBOPersistence: clampScore(in.CrossTimePersistence)}, nil
}

func (e *referenceEngine) SelectionProbability(_ context.Context, in SelectionProbabilityInput) (SelectionProbabilityResult, error) {
	if len(in.Observations) == 0 {
		return SelectionProbabilityResult{}, errors.New("selection probability requires eligible observations")
	}
	eligibleWeight, selectedWeight := 0.0, 0.0
	selectedCount := 0
	for _, observation := range in.Observations {
		if observation.Weight <= 0 {
			return SelectionProbabilityResult{}, errors.New("selection observation weight must be positive")
		}
		eligibleWeight += observation.Weight
		if observation.Selected {
			selectedWeight += observation.Weight
			selectedCount++
		}
	}
	if eligibleWeight <= 0 {
		return SelectionProbabilityResult{}, errors.New("empty eligible denominator")
	}
	return SelectionProbabilityResult{Score: clampScore(100 * selectedWeight / eligibleWeight), SelectedCount: selectedCount, EligibleCount: len(in.Observations), SelectedWeight: selectedWeight, EligibleWeight: eligibleWeight}, nil
}
