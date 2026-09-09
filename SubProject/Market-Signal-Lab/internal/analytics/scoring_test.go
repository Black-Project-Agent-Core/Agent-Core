package analytics

import (
	"marketsignallab/internal/domain"
	"testing"
)

func ptr(v float64) *float64 { return &v }

func TestOpportunityV01MatchesDocumentedWeightedSum(t *testing.T) {
	f := domain.FeatureSet{
		DemandProxy: ptr(72), SupplyGap: ptr(41), MarketMomentum: ptr(66),
		CompetitiveGap: ptr(48), FreshnessGap: ptr(68), ExternalTrend: ptr(79), Seasonality: ptr(74),
	}
	got, err := OpportunityV01(f)
	if err != nil {
		t.Fatal(err)
	}
	if got.Score < 61.699 || got.Score > 61.701 {
		t.Fatalf("score=%v want 61.7", got.Score)
	}
	if got.ModelKind != "opportunity_index" {
		t.Fatalf("model kind=%q", got.ModelKind)
	}
}

func TestOpportunityRequiresDemandAndMinimumCoverage(t *testing.T) {
	f := domain.FeatureSet{SupplyGap: ptr(100), MarketMomentum: ptr(100), CompetitiveGap: ptr(100), FreshnessGap: ptr(100)}
	if _, err := OpportunityV01(f); err == nil {
		t.Fatal("expected missing demand error")
	}

	g := domain.FeatureSet{DemandProxy: ptr(90), SupplyGap: ptr(90)}
	if _, err := OpportunityV01(g); err == nil {
		t.Fatal("expected insufficient coverage error")
	}
}

func TestConfidenceCapsProxyOnlyElementsAt60(t *testing.T) {
	c := domain.ConfidenceContext{
		EvidenceVolume: 100, RelevantCoverage: 100, IndependentSources: 100,
		HistoryDepth: 100, FeatureCompleteness: 100, CrossSourceConsistency: 100, Recency: 100,
		TargetPlatform: "elements", DirectElementsEvidence: false, SourceClassCount: 3, HistorySnapshots: 30,
	}
	got := ConfidenceV01(c)
	if got != 60 {
		t.Fatalf("confidence=%v want 60", got)
	}
}
