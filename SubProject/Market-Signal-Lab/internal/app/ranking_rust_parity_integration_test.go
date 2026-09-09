package app

import (
	"context"
	"marketsignallab/internal/analyticsengine"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/indexing"
	"marketsignallab/internal/storage"
	"math"
	"testing"
)

func assertParityFloat(t *testing.T, label string, got, want float64) {
	t.Helper()
	if math.Float64bits(got) != math.Float64bits(want) {
		t.Fatalf("%s got=%v want=%v", label, got, want)
	}
}

func TestRustRankingParityFrozenSeedThroughRealWorker(t *testing.T) {
	st, err := storage.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	svc := New(st)
	svc.analyticsRuntime = rankingParityRuntime(t)
	svc.analyticsEngine = svc.analyticsRuntime.Engine()
	if health := svc.analyticsRuntime.Health(context.Background()); health.Status != analyticsengine.EngineHealthy || health.Protocol != analyticsengine.ProtocolV2 {
		t.Fatalf("real Rust runtime health=%+v", health)
	}
	fixture := seedRankingUniverse(t, svc)
	got, err := svc.buildRankings(domain.RankingBuildRequest{AsOf: "2026-08-15T00:00:00Z", WindowDays: 30, CatalogScopeID: fixture.ContentTypeID}, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.ProductSnapshots) != 5 || len(got.CatalogSnapshots) != 3 {
		t.Fatalf("snapshot counts products=%d catalogs=%d", len(got.ProductSnapshots), len(got.CatalogSnapshots))
	}

	productExpected := map[string]struct {
		median, velocity, exposure, relative, opportunity, confidence, coverage float64
		direction                                                               domain.MarketDirection
		comparable                                                              bool
	}{
		"fa1": {8, 7, 74.2, 0, 51.9, 76.5, 90, domain.DirectionStrongRising, true},
		"fa2": {6, 0, 87.3, 100, 94.4, 60, 90, domain.DirectionNeutral, false},
		"sp1": {5, 15, 79.3, 100, 80.5, 77.3, 95, domain.DirectionStrongRising, true},
		"sp2": {12, -2, 62.4, 0, 42.7, 77.3, 95, domain.DirectionNeutral, true},
		"sp3": {8, 0, 85.5, 50, 79.7, 60, 95, domain.DirectionNeutral, false},
	}
	for _, row := range got.ProductSnapshots {
		want, ok := productExpected[row.ProductID]
		if !ok {
			t.Fatalf("unexpected product %q", row.ProductID)
		}
		assertParityFloat(t, row.ProductID+" median", row.MedianPosition, want.median)
		assertParityFloat(t, row.ProductID+" velocity", row.RankVelocity, want.velocity)
		assertParityFloat(t, row.ProductID+" exposure", row.ExposureScore, want.exposure)
		assertParityFloat(t, row.ProductID+" relative", row.RelativeStrength, want.relative)
		assertParityFloat(t, row.ProductID+" opportunity", row.OpportunityScore, want.opportunity)
		assertParityFloat(t, row.ProductID+" confidence", row.Confidence, want.confidence)
		assertParityFloat(t, row.ProductID+" coverage", row.Coverage, want.coverage)
		if row.Direction != want.direction || row.ComparableHistory != want.comparable {
			t.Fatalf("%s direction/comparable got=%s/%v want=%s/%v", row.ProductID, row.Direction, row.ComparableHistory, want.direction, want.comparable)
		}
	}

	catalogExpected := map[string]struct {
		observed                                                 int
		trend, opportunity, directionIndex, confidence, coverage float64
		direction                                                domain.MarketDirection
	}{
		"fashion":      {2, 83.9, 76.9, 87.5, 71.3, 90, domain.DirectionStrongRising},
		"presentation": {5, 67.9, 61.6, 73.8, 78.9, 92.5, domain.DirectionRising},
		"sports":       {3, 52.3, 43.3, 62.5, 78.2, 95, domain.DirectionRising},
	}
	for _, row := range got.CatalogSnapshots {
		want, ok := catalogExpected[row.CatalogID]
		if !ok {
			t.Fatalf("unexpected catalog %q", row.CatalogID)
		}
		if row.ObservedProducts != want.observed || row.Direction != want.direction {
			t.Fatalf("%s observed/direction got=%d/%s want=%d/%s", row.CatalogID, row.ObservedProducts, row.Direction, want.observed, want.direction)
		}
		assertParityFloat(t, row.CatalogID+" trend", row.TrendScore, want.trend)
		assertParityFloat(t, row.CatalogID+" opportunity", row.OpportunityScore, want.opportunity)
		assertParityFloat(t, row.CatalogID+" direction index", row.DirectionIndex, want.directionIndex)
		assertParityFloat(t, row.CatalogID+" confidence", row.Confidence, want.confidence)
		assertParityFloat(t, row.CatalogID+" coverage", row.Coverage, want.coverage)
	}
}

func TestRustStructuralParityFrozenSeedThroughRealWorker(t *testing.T) {
	st, err := storage.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	svc := New(st)
	svc.analyticsRuntime = rankingParityRuntime(t)
	svc.analyticsEngine = svc.analyticsRuntime.Engine()
	segments := []indexing.SegmentEvidence{
		{Level: domain.SegmentLevelSite, EntityID: "site-a", ParentID: "global", Label: "A", Volume: 40, Composition: 40, Coverage: 100, Confidence: 90, Quality: domain.DataQualityAssessment{Score: 90, Grade: domain.DataQualityGradeA}, Eligible: true},
		{Level: domain.SegmentLevelSite, EntityID: "site-b", ParentID: "global", Label: "B", Volume: 60, Composition: 60, Coverage: 100, Confidence: 90, Quality: domain.DataQualityAssessment{Score: 90, Grade: domain.DataQualityGradeA}, Eligible: true},
	}
	built, err := svc.alpha65BuildStructuralWithRust("parity-run", "", "2026-08-15T00:00:00Z", segments)
	if err != nil {
		t.Fatal(err)
	}
	if len(built.Hierarchy) != 3 || built.Global.EntityID != "global" {
		t.Fatalf("structural hierarchy=%+v", built.Hierarchy)
	}
	assertParityFloat(t, "global composition", built.Global.CompositionIndex, 50)
	assertParityFloat(t, "global volume weighted", built.Global.VolumeWeightedValue, 50)
	assertParityFloat(t, "global equal sector", built.Global.EqualSectorValue, 50)
	assertParityFloat(t, "global divergence", built.Global.DivergenceValue, 0)
	if built.Global.DivergenceState != domain.IndexDivergenceAligned || built.Global.DirectionStage != domain.DirectionStageComposition {
		t.Fatalf("global state/stage=%s/%s", built.Global.DivergenceState, built.Global.DirectionStage)
	}

	prior := make([]domain.MarketIndexSnapshot, len(built.Hierarchy))
	copy(prior, built.Hierarchy)
	for i := range prior {
		prior[i].VolumeWeightedValue -= 10
		prior[i].EqualSectorValue -= 10
	}
	if err := svc.applyAlpha65Direction(built.Hierarchy, prior, 2); err != nil {
		t.Fatalf("apply structural direction through real Rust worker: %v", err)
	}
	built.Global = built.Hierarchy[0]
	if built.Global.DirectionStage != domain.DirectionStageMovement {
		t.Fatalf("global direction stage=%s want=%s", built.Global.DirectionStage, domain.DirectionStageMovement)
	}
	if built.Global.Direction != "rising" {
		t.Fatalf("global direction=%q want=rising", built.Global.Direction)
	}
	if built.Global.TrendScore == nil {
		t.Fatal("global Rust direction trend score is nil")
	}
	assertParityFloat(t, "global direction trend score", *built.Global.TrendScore, 60)
	assertParityFloat(t, "global direction confidence", built.Global.Confidence, 65)
	if built.Global.ComparableRuns != 2 {
		t.Fatalf("global comparable runs=%d want=2", built.Global.ComparableRuns)
	}
}
