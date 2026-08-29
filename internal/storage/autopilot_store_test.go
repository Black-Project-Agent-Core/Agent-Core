package storage

import (
	"marketsignallab/internal/domain"
	"testing"
)

func TestMarketMapRoundTripAndLatestCompletedRun(t *testing.T) {
	st, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	plan := domain.MarketMapPlan{ID: "plan-1", CreatedAt: "2026-08-16T00:00:00Z", PlannerVersion: "market-map-planner-v0.1", ScanMode: domain.MarketMapModeStandard, Sites: []string{"graphicriver.net"}, RequestBudget: 48, CompatibilityKey: "key-1"}
	if err := st.SaveMarketMapPlan(plan); err != nil {
		t.Fatal(err)
	}
	run1 := domain.MarketMapRun{ID: "run-1", PlanID: plan.ID, StartedAt: "2026-08-16T00:00:00Z", CompletedAt: "2026-08-16T00:10:00Z", Status: domain.MarketMapRunCompleted, CompatibilityKey: "key-1", Coverage: 80}
	run2 := domain.MarketMapRun{ID: "run-2", PlanID: plan.ID, StartedAt: "2026-08-17T00:00:00Z", CompletedAt: "2026-08-17T00:10:00Z", Status: domain.MarketMapRunCompleted, CompatibilityKey: "key-1", Coverage: 90}
	if err := st.AppendMarketMapRun(run1); err != nil {
		t.Fatal(err)
	}
	if err := st.AppendMarketMapRun(run2); err != nil {
		t.Fatal(err)
	}
	latest, ok, err := st.LatestCompletedMarketMapRun("key-1")
	if err != nil || !ok || latest.ID != "run-2" {
		t.Fatalf("latest=%+v ok=%v err=%v", latest, ok, err)
	}
	plans, err := st.MarketMapPlans()
	if err != nil || len(plans) != 1 {
		t.Fatalf("plans=%+v err=%v", plans, err)
	}
}

func TestProductDirectionAndAdvancedResearchSeedRoundTrip(t *testing.T) {
	st, _ := Open(t.TempDir())
	rows := []any{
		domain.MarketSurfaceObservation{ID: "surface-1", RunID: "run-1", Site: "graphicriver.net", Surface: "popular", ProductID: "p1", ObservedAt: "2026-08-16T00:00:00Z"},
		domain.MarketDirectionSnapshot{ID: "direction-1", RunID: "run-1", AsOf: "2026-08-16T00:00:00Z", Status: "composition_only", ModelVersion: "market-temperature-v0.1"},
		domain.ProductDirectionCluster{ID: "cluster-1", RunID: "run-1", Label: "Sports Sponsorship Presentation", ProductType: "presentation", UseCase: "sponsorship", ProductIDs: []string{"p1"}},
		domain.ProductionInsight{ID: "insight-1", RunID: "run-1", EntityType: "product_direction", EntityID: "cluster-1", Code: "RESEARCH_NOW", Score: 74},
		domain.SaturationAlert{ID: "alert-1", RunID: "run-1", CatalogID: "sports", Code: "HOT_BUT_CROWDED", Severity: "warning"},
		domain.AdvancedResearchSeed{ID: "seed-1", RunID: "run-1", SourceType: "product_direction", SourceID: "cluster-1", Keywords: []string{"sports sponsorship"}, Site: "graphicriver.net", MaxPages: 3},
		domain.ClassificationReview{ID: "review-1", RunID: "run-1", ProductID: "p1", Title: "Ambiguous Product", Status: "needs_review"},
	}
	for _, row := range rows {
		var err error
		switch v := row.(type) {
		case domain.MarketSurfaceObservation:
			err = st.AppendMarketSurfaceObservation(v)
		case domain.MarketDirectionSnapshot:
			err = st.AppendMarketDirectionSnapshot(v)
		case domain.ProductDirectionCluster:
			err = st.AppendProductDirectionCluster(v)
		case domain.ProductionInsight:
			err = st.AppendProductionInsight(v)
		case domain.SaturationAlert:
			err = st.AppendSaturationAlert(v)
		case domain.AdvancedResearchSeed:
			err = st.AppendAdvancedResearchSeed(v)
		case domain.ClassificationReview:
			err = st.AppendClassificationReview(v)
		}
		if err != nil {
			t.Fatal(err)
		}
	}
	if xs, _ := st.MarketSurfaceObservations("run-1"); len(xs) != 1 {
		t.Fatalf("surface=%+v", xs)
	}
	if xs, _ := st.MarketDirectionSnapshots("run-1"); len(xs) != 1 {
		t.Fatalf("direction=%+v", xs)
	}
	if xs, _ := st.ProductDirectionClusters("run-1"); len(xs) != 1 {
		t.Fatalf("clusters=%+v", xs)
	}
	if xs, _ := st.ProductionInsights("run-1"); len(xs) != 1 {
		t.Fatalf("insights=%+v", xs)
	}
	if xs, _ := st.SaturationAlerts("run-1"); len(xs) != 1 {
		t.Fatalf("alerts=%+v", xs)
	}
	if xs, _ := st.AdvancedResearchSeeds("run-1"); len(xs) != 1 {
		t.Fatalf("seeds=%+v", xs)
	}
	if xs, _ := st.ClassificationReviews("run-1"); len(xs) != 1 {
		t.Fatalf("reviews=%+v", xs)
	}
}

func TestLatestCompletedMarketMapRunExcludingNeverReturnsCurrentRun(t *testing.T) {
	st, _ := Open(t.TempDir())
	for _, row := range []domain.MarketMapRun{{ID: "older", CompatibilityKey: "same", Status: domain.MarketMapRunCompleted, CompletedAt: "2026-08-01T00:00:00Z"}, {ID: "current", CompatibilityKey: "same", Status: domain.MarketMapRunCompleted, CompletedAt: "2026-08-16T00:00:00Z"}, {ID: "other", CompatibilityKey: "different", Status: domain.MarketMapRunCompleted, CompletedAt: "2026-08-15T00:00:00Z"}} {
		if err := st.AppendMarketMapRun(row); err != nil {
			t.Fatal(err)
		}
	}
	got, ok, err := st.LatestCompletedMarketMapRunExcluding("same", "current")
	if err != nil || !ok || got.ID != "older" {
		t.Fatalf("got=%+v ok=%v err=%v", got, ok, err)
	}
}
