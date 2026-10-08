package analytics

import (
	"errors"
	"marketsignallab/internal/domain"
	"math"
)

type weightedFeature struct {
	name   string
	value  *float64
	weight float64
}

func clamp(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 100 {
		return 100
	}
	return v
}

func OpportunityV01(f domain.FeatureSet) (domain.OpportunityResult, error) {
	if f.DemandProxy == nil {
		return domain.OpportunityResult{}, errors.New("demand_proxy is required")
	}
	fs := []weightedFeature{
		{"demand_proxy", f.DemandProxy, .25}, {"supply_gap", f.SupplyGap, .20},
		{"market_momentum", f.MarketMomentum, .15}, {"competitive_gap", f.CompetitiveGap, .15},
		{"freshness_gap", f.FreshnessGap, .10}, {"external_trend_confirmation", f.ExternalTrend, .10},
		{"seasonality", f.Seasonality, .05},
	}
	present := 0.0
	missing := []string{}
	for _, x := range fs {
		if x.value != nil {
			present += x.weight
		} else {
			missing = append(missing, x.name)
		}
	}
	if present < .60-1e-9 {
		return domain.OpportunityResult{}, errors.New("insufficient feature weight coverage")
	}
	total := 0.0
	contrib := map[string]float64{}
	eff := map[string]float64{}
	for _, x := range fs {
		if x.value == nil {
			continue
		}
		ew := x.weight / present
		v := clamp(*x.value)
		c := v * ew
		total += c
		contrib[x.name] = c
		eff[x.name] = ew
	}
	total = math.Round(total*10) / 10
	return domain.OpportunityResult{Score: total, ModelName: "opportunity_index", ModelVersion: "0.1.0-preview", ModelKind: "opportunity_index", CoverageWeight: present, Missing: missing, Contributions: contrib, EffectiveWeights: eff}, nil
}

func ConfidenceV01(c domain.ConfidenceContext) float64 {
	score := clamp(c.EvidenceVolume)*.20 + clamp(c.RelevantCoverage)*.15 + clamp(c.IndependentSources)*.15 + clamp(c.HistoryDepth)*.15 + clamp(c.FeatureCompleteness)*.15 + clamp(c.CrossSourceConsistency)*.10 + clamp(c.Recency)*.10
	if c.HistorySnapshots < 7 && score > 70 {
		score = 70
	}
	if c.SourceClassCount <= 1 && score > 65 {
		score = 65
	}
	if c.TargetPlatform == "elements" && !c.DirectElementsEvidence && score > 60 {
		score = 60
	}
	if c.CriticalEvidenceAgeHours > 72 && score > 55 {
		score = 55
	}
	return math.Round(score*10) / 10
}
