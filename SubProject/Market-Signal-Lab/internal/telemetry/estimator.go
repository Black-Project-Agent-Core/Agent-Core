package telemetry

import (
	"marketsignallab/internal/domain"
	"sort"
	"time"
)

type EstimateInput struct {
	Now, StartedAt                                time.Time
	PlannedWorkUnits, CompletedWorkUnits          int
	CurrentUnitDurations, CurrentRequestLatencies []time.Duration
	RetryDelay                                    time.Duration
	ComparableRuns                                []domain.ScanRuntimeSummary
}

func medianDuration(xs []time.Duration) time.Duration {
	if len(xs) == 0 {
		return 0
	}
	ys := append([]time.Duration(nil), xs...)
	sort.Slice(ys, func(i, j int) bool { return ys[i] < ys[j] })
	m := len(ys) / 2
	if len(ys)%2 == 1 {
		return ys[m]
	}
	return (ys[m-1] + ys[m]) / 2
}
func RuntimeCompatibilityScore(a, b domain.RuntimeCompatibility) float64 {
	if a.PlannerVersion != b.PlannerVersion || a.SamplingSchemaVersion != b.SamplingSchemaVersion || a.TaxonomyVersion != b.TaxonomyVersion || a.IndexWeightingVersion != b.IndexWeightingVersion {
		return 0
	}
	score := 0.8
	if sameStrings(a.Sites, b.Sites) {
		score += .1
	}
	if sameStrings(a.Surfaces, b.Surfaces) {
		score += .1
	}
	return score
}
func sameStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	aa := append([]string(nil), a...)
	bb := append([]string(nil), b...)
	sort.Strings(aa)
	sort.Strings(bb)
	for i := range aa {
		if aa[i] != bb[i] {
			return false
		}
	}
	return true
}
func EstimateRemaining(in EstimateInput) domain.ETAEstimate {
	remaining := in.PlannedWorkUnits - in.CompletedWorkUnits
	if remaining <= 0 && in.PlannedWorkUnits > 0 {
		return domain.ETAEstimate{Kind: domain.ETAPoint, Confidence: domain.ETAConfidenceHigh, Basis: "complete"}
	}
	cur := medianDuration(in.CurrentUnitDurations)
	histDur := []time.Duration{}
	for _, r := range in.ComparableRuns {
		if r.CompletedWorkUnits <= 0 || r.DurationMs <= 0 {
			continue
		}
		histDur = append(histDur, time.Duration(float64(time.Millisecond)*float64(r.DurationMs)/float64(r.CompletedWorkUnits)))
	}
	hist := medianDuration(histDur)
	if cur == 0 && hist == 0 {
		return domain.ETAEstimate{Kind: domain.ETAUnavailable, Confidence: domain.ETAConfidenceUnavailable, EvidenceRuns: len(histDur), Basis: "calibrating"}
	}
	blend := hist
	if blend == 0 {
		blend = cur
	}
	if cur > 0 && hist > 0 {
		w := float64(in.CompletedWorkUnits) / 20
		if w > .8 {
			w = .8
		}
		if w < .2 {
			w = .2
		}
		blend = time.Duration(float64(hist)*(1-w) + float64(cur)*w)
	}
	if cur > hist*2 && hist > 0 {
		blend = time.Duration(float64(blend) * 1.2)
	}
	est := time.Duration(remaining)*blend + in.RetryDelay
	if est < 0 {
		est = 0
	}
	conf := domain.ETAConfidenceLow
	if len(histDur) >= 6 {
		conf = domain.ETAConfidenceHigh
	} else if len(histDur) >= 3 {
		conf = domain.ETAConfidenceMedium
	}
	if hist > 0 && cur > hist*2 && conf == domain.ETAConfidenceHigh {
		conf = domain.ETAConfidenceMedium
	}
	kind := domain.ETAPoint
	min, max := time.Duration(0), time.Duration(0)
	if conf == domain.ETAConfidenceLow {
		kind = domain.ETARange
		min = time.Duration(float64(est) * .7)
		max = time.Duration(float64(est) * 1.4)
	} else if conf == domain.ETAConfidenceMedium {
		min = time.Duration(float64(est) * .85)
		max = time.Duration(float64(est) * 1.2)
	}
	finish := ""
	if !in.Now.IsZero() {
		finish = in.Now.Add(est).UTC().Format(time.RFC3339)
	}
	basis := "historical_and_current"
	if len(histDur) == 0 {
		basis = "current_run_only"
	}
	return domain.ETAEstimate{Kind: kind, Confidence: conf, EstimatedRemainingMs: est.Milliseconds(), MinimumRemainingMs: min.Milliseconds(), MaximumRemainingMs: max.Milliseconds(), ExpectedFinishAt: finish, EvidenceRuns: len(histDur), Basis: basis}
}
