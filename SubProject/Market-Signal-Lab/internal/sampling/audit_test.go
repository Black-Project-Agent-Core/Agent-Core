package sampling

import (
	"marketsignallab/internal/domain"
	"testing"
)

func TestBuildSampleAuditBalancedSample(t *testing.T) {
	in := AuditInput{
		RunID: "run-1", PlannerVersion: "market-map-planner-v0.2", SamplingSchemaVersion: SchemaVersion, TaxonomyVersion: "taxonomy-segmentation-v0.1",
		TargetResults: []domain.MarketMapTargetResult{
			{TargetID: "g-pop", StratumKey: "graphicriver|graphics|presentations|popular", Status: domain.MarketMapTargetCompleted, ObservedItems: 20, UniqueProducts: 18, RequestsUsed: 2},
			{TargetID: "v-pop", StratumKey: "videohive|video|templates|popular", Status: domain.MarketMapTargetCompleted, ObservedItems: 20, UniqueProducts: 18, RequestsUsed: 2},
		},
		Targets: []domain.MarketMapSurfaceTarget{
			{ID: "g-pop", Site: "graphicriver.net", Surface: domain.MarketSurfacePopular, TargetSample: 20, RequestAllowance: 2, HighPriority: true, StratumKey: "graphicriver|graphics|presentations|popular"},
			{ID: "v-pop", Site: "videohive.net", Surface: domain.MarketSurfacePopular, TargetSample: 20, RequestAllowance: 2, HighPriority: true, StratumKey: "videohive|video|templates|popular"},
		},
		Observations: []AuditObservation{
			{ProductID: "g1", AuthorID: "ga", Site: "graphicriver.net", ContentType: "Graphics", CatalogID: "presentation", Surface: domain.MarketSurfacePopular, Reliability: .9, TaxonomyConfidence: 90},
			{ProductID: "v1", AuthorID: "va", Site: "videohive.net", ContentType: "Video", CatalogID: "video-template", Surface: domain.MarketSurfacePopular, Reliability: .9, TaxonomyConfidence: 90},
		},
		ComparableRuns: 6, GeneratedAt: "2026-08-16T00:00:00Z",
	}
	got, err := BuildSampleAudit(in)
	if err != nil {
		t.Fatal(err)
	}
	if got.CompletedStrata != 2 || !got.HighPriorityComplete {
		t.Fatalf("got=%+v", got)
	}
	if got.DominantSiteShare > 50.1 || got.SampleBalanceScore < 90 {
		t.Fatalf("balance=%+v", got)
	}
	if got.UniqueProductRatio != 100 || got.DuplicateRate != 0 {
		t.Fatalf("duplicates=%+v", got)
	}
}

func TestBuildSampleAuditDetectsDominantSiteAndDuplicates(t *testing.T) {
	observations := []AuditObservation{}
	for i := 0; i < 8; i++ {
		observations = append(observations, AuditObservation{ProductID: "shared", Site: "videohive.net", Surface: domain.MarketSurfacePopular, Reliability: .9, TaxonomyConfidence: 90})
	}
	observations = append(observations, AuditObservation{ProductID: "g1", Site: "graphicriver.net", Surface: domain.MarketSurfaceNew, Reliability: .9, TaxonomyConfidence: 90})
	got, err := BuildSampleAudit(AuditInput{RunID: "run-1", Observations: observations, TargetSample: 9, ComparableRuns: 1, GeneratedAt: "2026-08-16T00:00:00Z"})
	if err != nil {
		t.Fatal(err)
	}
	if got.DominantSiteShare < 80 || got.DuplicateRate < 70 || got.SampleBalanceScore > 40 {
		t.Fatalf("got=%+v", got)
	}
}

func TestBuildSampleAuditPreservesFailedStrataReason(t *testing.T) {
	got, err := BuildSampleAudit(AuditInput{
		RunID:         "run-1",
		Targets:       []domain.MarketMapSurfaceTarget{{ID: "target-1", Site: "graphicriver.net", Surface: domain.MarketSurfaceFeatured, TargetSample: 20, HighPriority: true}},
		TargetResults: []domain.MarketMapTargetResult{{TargetID: "target-1", Status: domain.MarketMapTargetFailed, FailureCode: "surface_forbidden"}},
		GeneratedAt:   "2026-08-16T00:00:00Z",
	})
	if err != nil {
		t.Fatal(err)
	}
	if got.HighPriorityComplete {
		t.Fatal("failed high-priority target must not be complete")
	}
	if len(got.ReasonCodes) != 1 || got.ReasonCodes[0] != "surface_forbidden" {
		t.Fatalf("reasons=%v", got.ReasonCodes)
	}
}
