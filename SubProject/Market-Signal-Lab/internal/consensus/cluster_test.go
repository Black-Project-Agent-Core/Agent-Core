package consensus

import (
	"marketsignallab/internal/domain"
	"testing"
	"time"
)

func clusterFixture() ClusterConsensusInput {
	return ClusterConsensusInput{CaptureBatchID: "b1", EntityType: "product_type", EntityID: "packaging_mockup", Label: "Packaging Mockup", ContextTypes: []string{"public_web", "subscriber_app"}, EligibleSnapshotIDs: []string{"s1", "s2", "s3"}, EligibleSnapshots: 3, ComparableBatchCount: 3, ContextPresenceRate: 80, ContextBreadth: 70, CrossTimePersistence: 75, RankShareStrength: 70, IndependentItemBreadth: 72, EvidenceQuality: 78, UnresolvedTaxonomyShare: 0, ContextDominance: 50, Coverage: 90, Confidence: 80, DataQualityScore: 78, DataQualityGrade: domain.DataQualityGradeB, GeneratedAt: time.Date(2026, 8, 16, 10, 0, 0, 0, time.UTC)}
}

func TestStrongClusterConsensusRequiresBreadthSnapshotsAndQuality(t *testing.T) {
	input := clusterFixture()
	input.ContextTypes = []string{"public_web", "subscriber_app", "market_api"}
	input.EligibleSnapshots = 6
	input.ContextPresenceRate = 88
	input.ContextBreadth = 100
	input.CrossTimePersistence = 80
	input.RankShareStrength = 75
	input.IndependentItemBreadth = 82
	input.EvidenceQuality = 85
	input.DataQualityGrade = domain.DataQualityGradeB
	got, _, err := BuildClusterConsensus(input)
	if err != nil {
		t.Fatal(err)
	}
	if got.Score < 80 || got.Label != string(domain.ConsensusLabelStrong) {
		t.Fatalf("got=%+v", got)
	}
}

func TestStrongLabelIsCappedWhenTaxonomyNeedsReview(t *testing.T) {
	input := clusterFixture()
	input.ContextTypes = []string{"public_web", "subscriber_app", "market_api"}
	input.EligibleSnapshots = 6
	input.ContextPresenceRate = 95
	input.CrossTimePersistence = 90
	input.RankShareStrength = 90
	input.IndependentItemBreadth = 90
	input.EvidenceQuality = 90
	input.ContextBreadth = 100
	input.DataQualityGrade = domain.DataQualityGradeA
	input.UnresolvedTaxonomyShare = 25
	got, _, err := BuildClusterConsensus(input)
	if err != nil {
		t.Fatal(err)
	}
	if got.Label == string(domain.ConsensusLabelStrong) || !contains(got.ReasonCodes, "taxonomy_ambiguity_cap") {
		t.Fatalf("got=%+v", got)
	}
}
