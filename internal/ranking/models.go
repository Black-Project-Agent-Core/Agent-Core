package ranking

import (
	"marketsignallab/internal/consensus"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/indexing"
)

var lockedModels = []domain.ModelDefinition{
	{
		Name: "product-exposure", Version: "product-exposure-v0.1", Kind: "observed_index",
		Weights: map[string]float64{
			"median_position": 0.35, "cross_query": 0.20, "surface_strength": 0.10,
			"rank_velocity": 0.20, "freshness": 0.15,
		},
		MissingPolicy: "renormalize",
		Notes:         "Observed Exposure Score derived from bounded public research observations; not an internal Envato boost score.",
	},
	{
		Name: "product-opportunity", Version: "product-opportunity-v0.1", Kind: "opportunity_index",
		Weights: map[string]float64{
			"exposure": 0.40, "relative_strength": 0.25, "freshness": 0.15,
			"cross_query": 0.10, "rank_velocity": 0.10,
		},
		MissingPolicy: "renormalize",
		Notes:         "Legacy numeric model presented as Product Insight Score under msl-semantic-contract/2; not market-entry timing, success probability, revenue, or competitor earnings.",
	},
	{
		Name: "catalog-trend", Version: "catalog-trend-v0.1", Kind: "observed_trend_index",
		Weights: map[string]float64{
			"demand_momentum": 0.15, "market_breadth": 0.18, "exposure_movement": 0.15,
			"new_product_velocity": 0.08, "freshness": 0.08, "relative_strength": 0.14,
			"supply_gap": 0.08, "competition_momentum": 0.05, "author_diversity": 0.04,
			"external_trend": 0.05,
		},
		MissingPolicy: "renormalize",
		Notes:         "Observed Trend Score; not an internal Envato score. External trend remains optional until a documented adapter supplies it.",
	},
	{
		Name: "catalog-opportunity", Version: "catalog-opportunity-v0.1", Kind: "opportunity_index",
		Weights: map[string]float64{
			"trend": 0.35, "supply_gap": 0.20, "market_breadth": 0.15,
			"freshness": 0.10, "author_diversity": 0.10, "inverse_competition": 0.10,
		},
		MissingPolicy: "renormalize",
		Notes:         "Legacy numeric model presented as Catalog Insight Score under msl-semantic-contract/2; not market-entry timing, success probability, revenue, or certainty of future demand.",
	},
	{
		Name: "direction", Version: "direction-v0.1", Kind: "direction_index",
		Weights: map[string]float64{
			"demand_momentum": 0.25, "market_breadth": 0.25, "exposure_movement": 0.25,
			"new_product_velocity": 0.10, "relative_strength": 0.15,
		},
		MissingPolicy: "renormalize",
		Notes:         "Deterministic observed direction classification from bounded market evidence.",
	},
}

func ModelRegistry() []domain.ModelDefinition {
	all := append(append(append([]domain.ModelDefinition(nil), lockedModels...), indexing.RegisteredModels()...), consensus.RegisteredModels()...)
	out := make([]domain.ModelDefinition, len(all))
	for i, model := range all {
		out[i] = model
		out[i].Weights = make(map[string]float64, len(model.Weights))
		for key, value := range model.Weights {
			out[i].Weights[key] = value
		}
	}
	return out
}

func ModelByName(name string) (domain.ModelDefinition, bool) {
	for _, model := range ModelRegistry() {
		if model.Name == name {
			copyModel := model
			copyModel.Weights = make(map[string]float64, len(model.Weights))
			for key, value := range model.Weights {
				copyModel.Weights[key] = value
			}
			return copyModel, true
		}
	}
	return domain.ModelDefinition{}, false
}
