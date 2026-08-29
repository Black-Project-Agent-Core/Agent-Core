package consensus

import (
	"context"
	"marketsignallab/internal/domain"
	"math"
	"testing"
	"time"
)

type itemConcept struct{ id, productType, useCase string }

func snapshotWithConcepts(id string, concepts []itemConcept) PairSnapshot {
	items := make([]domain.SurfaceSnapshotItem, 0, len(concepts))
	for i, c := range concepts {
		items = append(items, domain.SurfaceSnapshotItem{ID: id + c.id, SnapshotID: id, Rank: i + 1, CanonicalIdentityKey: c.id, ProductTypeID: c.productType, UseCaseID: c.useCase, NormalizedCatalogID: "graphic_templates", TaxonomyConfidence: .9, IdentityConfidence: 1, AuthorPublicName: "author-" + c.id})
	}
	return PairSnapshot{Snapshot: domain.SurfaceSnapshot{ID: id, ContextID: "ctx-" + id, TopKRequested: len(items), TopKObserved: len(items), CapturedAt: "2026-08-16T10:00:00Z"}, Context: domain.ObservationContext{ID: "ctx-" + id, Experience: domain.ObservationExperiencePublic}, Items: items}
}

func pairFixture() PairMetricInput {
	a := snapshotWithConcepts("a", []itemConcept{{"x", "mockup", "packaging"}, {"y", "mockup", "packaging"}})
	b := snapshotWithConcepts("b", []itemConcept{{"x", "mockup", "packaging"}, {"z", "mockup", "packaging"}})
	return PairMetricInput{PairID: "pair", SnapshotA: a, SnapshotB: b, CommonTopK: 2, DataQualityScore: 80, DataQualityGrade: domain.DataQualityGradeB, Coverage: 90, Confidence: 80, ComparableBatches: 1, GeneratedAt: time.Date(2026, 8, 16, 10, 0, 0, 0, time.UTC)}
}

func TestDifferentItemsCanProduceHighConceptConsensus(t *testing.T) {
	input := PairMetricInput{
		PairID: "pair-1", SnapshotA: snapshotWithConcepts("a", []itemConcept{{"a1", "packaging_mockup", "product_mockup"}, {"a2", "packaging_mockup", "product_mockup"}}),
		SnapshotB:        snapshotWithConcepts("b", []itemConcept{{"b1", "packaging_mockup", "product_mockup"}, {"b2", "packaging_mockup", "product_mockup"}}),
		DataQualityGrade: domain.DataQualityGradeB, Coverage: 100, Confidence: 80, CommonTopK: 2, GeneratedAt: time.Now().UTC(),
	}
	metrics, ambiguity, provenance, err := BuildPairMetricsWithEngine(context.Background(), testAnalyticsEngine, input)
	if err != nil {
		t.Fatal(err)
	}
	if metrics.ItemConsensus >= 45 {
		t.Fatalf("item consensus should remain low: %+v", metrics)
	}
	if metrics.ConceptConsensus < 90 {
		t.Fatalf("concept consensus should be high: %+v", metrics)
	}
	if ambiguity.Score >= 50 || provenance.ScoreType != "overall_market_consensus" {
		t.Fatalf("ambiguity=%+v provenance=%+v", ambiguity, provenance)
	}
}

func TestPairWeightsRenormalizeWhenAuthorBreadthUnavailable(t *testing.T) {
	input := pairFixture()
	for i := range input.SnapshotA.Items {
		input.SnapshotA.Items[i].AuthorPublicName = ""
	}
	for i := range input.SnapshotB.Items {
		input.SnapshotB.Items[i].AuthorPublicName = ""
	}
	metrics, _, prov, err := BuildPairMetricsWithEngine(context.Background(), testAnalyticsEngine, input)
	if err != nil {
		t.Fatal(err)
	}
	if !contains(metrics.MissingComponents, "author_breadth_similarity") {
		t.Fatalf("metrics=%+v", metrics)
	}
	total := 0.0
	for _, c := range prov.Components {
		if c.Name == "item_consensus" || c.Name == "concept_consensus" {
			total += c.EffectiveWeight
		}
	}
	if math.Abs(total-1) > .0001 {
		t.Fatalf("effective total=%v", total)
	}
}

func TestAmbiguityLabelsUseApprovedBoundaries(t *testing.T) {
	cases := []struct {
		score float64
		want  domain.AmbiguityLabel
	}{{10, "low"}, {35, "moderate"}, {55, "high"}, {80, "extreme"}}
	for _, tc := range cases {
		if got := AmbiguityLabel(tc.score); got != tc.want {
			t.Fatalf("score=%v got=%s", tc.score, got)
		}
	}
}
