package indexing

import "marketsignallab/internal/domain"

func RegisteredModels() []domain.ModelDefinition {
	return []domain.ModelDefinition{
		{Name: "sampling-schema", Version: "sampling-schema-v0.1", Kind: "integrity", Weights: map[string]float64{}, MissingPolicy: "explicit", Notes: "Deterministic stratified sampling contract for bounded public market observations."},
		{Name: "taxonomy-segmentation", Version: "taxonomy-segmentation-v0.1", Kind: "integrity", Weights: map[string]float64{}, MissingPolicy: "needs_review", Notes: "Deterministic site, content type, catalog, product type and use-case segmentation."},
		{Name: "data-quality", Version: "data-quality-v0.1", Kind: "integrity", Weights: map[string]float64{"stratum_completion": .20, "sample_size": .15, "sample_balance": .15, "unique_product": .10, "taxonomy": .10, "author_coverage": .05, "source_reliability": .10, "history_depth": .10, "surface_diversity": .05}, MissingPolicy: "explicit_caps", Notes: "Transparent quality grade A-D with deterministic hard caps."},
		{Name: "volume-weighted-market-index", Version: "volume-weighted-market-index-v0.1", Kind: "integrity", Weights: map[string]float64{}, MissingPolicy: "exclude_ineligible", Notes: "Capped volume-weighted hierarchy that prevents one peer from silently dominating."},
		{Name: "equal-sector-market-index", Version: "equal-sector-market-index-v0.1", Kind: "integrity", Weights: map[string]float64{}, MissingPolicy: "exclude_ineligible", Notes: "Equal-sector hierarchy measuring breadth across eligible peers."},
		{Name: "index-divergence", Version: "index-divergence-v0.1", Kind: "integrity", Weights: map[string]float64{}, MissingPolicy: "explicit", Notes: "Absolute divergence between volume-weighted and equal-sector indices."},
		{Name: "direction-stage", Version: "direction-stage-v0.1", Kind: "integrity", Weights: map[string]float64{}, MissingPolicy: "history_gate", Notes: "Direction maturity based on comparable run depth; one run remains composition only."},
		{Name: "score-provenance", Version: "score-provenance-v0.1", Kind: "integrity", Weights: map[string]float64{}, MissingPolicy: "full_trace", Notes: "Append-only score audit with original/effective weights, fallbacks and reason codes."},
	}
}
