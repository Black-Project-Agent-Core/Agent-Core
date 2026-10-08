package sources

import (
	"fmt"
	"marketsignallab/internal/domain"
	"sort"
)

type PolicyRegistry struct {
	bySource map[string]domain.SourceAdapterPolicy
}

func DefaultPolicyRegistry() *PolicyRegistry {
	xs := []domain.SourceAdapterPolicy{
		{SourceType: "envato_market_api", CollectionMode: "user_initiated_bounded", RawPayloadRetention: false, MetadataTTLSeconds: 21600, HistoricalFactRetention: "normalized_observations", MaxRequestBudget: 60, AttributionRequirement: "Powered by Envato API"},
		{SourceType: "envato_elements_manual", CollectionMode: "manual_import", RawPayloadRetention: false, MetadataTTLSeconds: 0, HistoricalFactRetention: "normalized_observations", MaxRequestBudget: 0},
		{SourceType: "external_csv", CollectionMode: "manual_import", RawPayloadRetention: false, MetadataTTLSeconds: 0, HistoricalFactRetention: "normalized_observations", MaxRequestBudget: 0},
		{SourceType: "manual_research", CollectionMode: "manual_import", RawPayloadRetention: false, MetadataTTLSeconds: 0, HistoricalFactRetention: "normalized_observations", MaxRequestBudget: 0},
	}
	m := map[string]domain.SourceAdapterPolicy{}
	for _, x := range xs {
		m[x.SourceType] = x
	}
	return &PolicyRegistry{bySource: m}
}

func (r *PolicyRegistry) Require(sourceType string) (domain.SourceAdapterPolicy, error) {
	p, ok := r.bySource[sourceType]
	if !ok {
		return domain.SourceAdapterPolicy{}, fmt.Errorf("source policy not registered: %s", sourceType)
	}
	return p, nil
}

func (r *PolicyRegistry) All() []domain.SourceAdapterPolicy {
	out := make([]domain.SourceAdapterPolicy, 0, len(r.bySource))
	for _, p := range r.bySource {
		out = append(out, p)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].SourceType < out[j].SourceType })
	return out
}
