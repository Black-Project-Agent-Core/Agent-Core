package autopilot

import (
	"marketsignallab/internal/domain"
	"testing"
)

func ptrRun(v domain.MarketMapRun) *domain.MarketMapRun { return &v }

func TestBuildMarketDirectionFirstRunIsCompositionOnly(t *testing.T) {
	got := BuildMarketDirection(DirectionInput{
		Run:             domain.MarketMapRun{ID: "run-1", CompatibilityKey: "scope-a", Coverage: 82, Confidence: 70, CompletedAt: "2026-08-16T00:00:00Z"},
		CurrentCatalogs: []domain.CatalogSnapshot{{TrendScore: 80, OpportunityScore: 70, Coverage: 82, Confidence: 70}},
	})
	if !got.CompositionOnly || got.Direction != "composition_only" || got.PriorRunID != "" {
		t.Fatalf("expected composition-only first map, got %+v", got)
	}
	if got.ModelVersion != MarketTemperatureModelVersion {
		t.Fatalf("unexpected model %q", got.ModelVersion)
	}
}

func TestBuildMarketDirectionUsesOnlyCompatiblePriorRun(t *testing.T) {
	current := domain.MarketMapRun{ID: "run-2", CompatibilityKey: "scope-a", Coverage: 90, Confidence: 80, CompletedAt: "2026-08-16T00:00:00Z"}
	prior := domain.MarketMapRun{ID: "run-1", CompatibilityKey: "scope-a", Status: domain.MarketMapRunCompleted, CompletedAt: "2026-08-09T00:00:00Z"}
	got := BuildMarketDirection(DirectionInput{
		Run: current, PriorRun: ptrRun(prior),
		CurrentCatalogs: []domain.CatalogSnapshot{{TrendScore: 84, OpportunityScore: 80}},
		PriorCatalogs:   []domain.CatalogSnapshot{{TrendScore: 60, OpportunityScore: 58}},
	})
	if got.CompositionOnly || got.Direction != "strong_rising" || got.PriorRunID != prior.ID {
		t.Fatalf("expected strong compatible direction, got %+v", got)
	}

	prior.CompatibilityKey = "other-scope"
	incompatible := BuildMarketDirection(DirectionInput{Run: current, PriorRun: ptrRun(prior), CurrentCatalogs: []domain.CatalogSnapshot{{TrendScore: 84}}, PriorCatalogs: []domain.CatalogSnapshot{{TrendScore: 30}}})
	if !incompatible.CompositionOnly || incompatible.Direction != "composition_only" {
		t.Fatalf("incompatible prior must not create direction, got %+v", incompatible)
	}
}

func TestBuildProductionInsightsRisingWithOpenSpace(t *testing.T) {
	got := BuildProductionInsights(ProductionInsightInput{
		RunID: "run-1", Coverage: 84, Confidence: 78,
		Catalogs: []domain.CatalogSnapshot{{CatalogID: "cat-1", TrendScore: 82, OpportunityScore: 79, ExposureBreadth: 72, NewSupplyVelocityIndex: 45, CompetitionMomentumIndex: 42, Coverage: 84, Confidence: 78}},
	})
	if len(got) != 1 || got[0].Code != "RISING_WITH_OPEN_SPACE" || got[0].Recommendation != "produce_candidate" {
		t.Fatalf("unexpected insight %+v", got)
	}
	if len(got[0].ReasonCodes) == 0 {
		t.Fatal("expected transparent reason codes")
	}
}

func TestBuildProductionInsightsCapsLowCoverage(t *testing.T) {
	got := BuildProductionInsights(ProductionInsightInput{
		RunID: "run-low", Coverage: 39, Confidence: 80,
		Clusters: []domain.ProductDirectionCluster{{ID: "cluster-1", Opportunity: 91, Confidence: 88, Coverage: 39}},
	})
	if len(got) != 1 || got[0].Code != "INSUFFICIENT_EVIDENCE" || got[0].Recommendation != "insufficient_evidence" {
		t.Fatalf("unexpected low coverage insight %+v", got)
	}
	if got[0].Priority > 49 {
		t.Fatalf("low coverage priority must be capped, got %.1f", got[0].Priority)
	}
}

func TestBuildSaturationAlertsDetectsCrowdingAndLowBreadth(t *testing.T) {
	got := BuildSaturationAlerts(SaturationInput{RunID: "run-1", Catalogs: []domain.CatalogSnapshot{
		{CatalogID: "crowded", TrendScore: 88, OpportunityScore: 54, ExposureBreadth: 70, NewSupplyVelocityIndex: 85, CompetitionMomentumIndex: 92},
		{CatalogID: "narrow", TrendScore: 81, OpportunityScore: 72, ExposureBreadth: 22, NewSupplyVelocityIndex: 40, CompetitionMomentumIndex: 38},
	}})
	codes := map[string]bool{}
	for _, row := range got {
		codes[row.Code] = true
	}
	if !codes["HOT_BUT_CROWDED"] || !codes["LOW_BREADTH_HYPE"] {
		t.Fatalf("expected both deterministic saturation signals, got %+v", got)
	}
}
