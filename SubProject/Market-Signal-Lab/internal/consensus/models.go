package consensus

import "marketsignallab/internal/domain"

func RegisteredModels() []domain.ModelDefinition {
	return []domain.ModelDefinition{
		{Name: "observation-context", Version: "observation-context-v0.1", Kind: "consensus", MissingPolicy: "reject_invalid", Weights: map[string]float64{}},
		{Name: "surface-snapshot", Version: "surface-snapshot-v0.1", Kind: "consensus", MissingPolicy: "censored_top_k", Weights: map[string]float64{}},
		{Name: "paired-comparability", Version: "paired-comparability-v0.1", Kind: "consensus", MissingPolicy: "non_comparable", Weights: map[string]float64{}},
		{Name: "rbo-consensus", Version: "rbo-consensus-v0.1", Kind: "consensus", MissingPolicy: "common_depth", Weights: map[string]float64{"persistence": .90}},
		{Name: "concept-distribution-similarity", Version: "concept-distribution-similarity-v0.1", Kind: "consensus", MissingPolicy: "renormalize", Weights: map[string]float64{}},
		{Name: "market-consensus", Version: "market-consensus-v0.1", Kind: "consensus", MissingPolicy: "renormalize", Weights: map[string]float64{"item_consensus": .35, "concept_consensus": .65}},
		{Name: "market-ambiguity", Version: "market-ambiguity-v0.1", Kind: "consensus", MissingPolicy: "explicit", Weights: map[string]float64{}},
		{Name: "ranking-volatility", Version: "ranking-volatility-v0.1", Kind: "consensus", MissingPolicy: "insufficient_history", Weights: map[string]float64{}},
		{Name: "observed-selection-probability", Version: "observed-selection-probability-v0.1", Kind: "bounded_probability", MissingPolicy: "explicit_denominator", Weights: map[string]float64{}},
		{Name: "cluster-consensus", Version: "cluster-consensus-v0.1", Kind: "consensus", MissingPolicy: "renormalize", Weights: map[string]float64{"context_presence_rate": .25, "context_breadth": .20, "cross_time_persistence": .20, "rank_share_strength": .15, "independent_item_breadth": .10, "evidence_quality": .10}},
		{Name: "context-health", Version: "context-health-v0.1", Kind: "consensus", MissingPolicy: "explicit", Weights: map[string]float64{}},
		{Name: "capture-policy", Version: "capture-policy-v0.1", Kind: "security", MissingPolicy: "fail_closed", Weights: map[string]float64{}},
	}
}
