package evidence

import (
	"testing"

	"marketsignallab/internal/domain"
)

func TestRepresentativeCandidatesPreserveFrozenValuesExactly(t *testing.T) {
	ctx := representativeContext()
	movementFacts := EvidenceFacts{
		ComparableWindowCount:   intp(2),
		ScopeComparability:      exactScope(true),
		StableMeasureDefinition: boolp(true),
	}

	catalog := domain.CatalogSnapshot{
		CatalogID:               "catalog-1",
		ObservedProducts:        19,
		ComparableProducts:      7,
		ExposureBreadth:         61.234567,
		CompetitionAcceleration: -17.8751,
		RelativeStrength:        83.4201,
		ModelVersion:            "catalog-snapshot-v0.2",
		ProvenanceID:            "catalog-provenance",
		MarketMapRunID:          "run-1",
	}
	productRankVelocityScore := 44.25
	product := domain.ProductSnapshot{
		ProductID:         "product-1",
		CatalogID:         "catalog-1",
		RelativeStrength:  27.3456,
		ComparableHistory: true,
		RankVelocityScore: &productRankVelocityScore,
		ModelVersion:      "product-snapshot-v0.2",
		ProvenanceID:      "product-provenance",
		MarketMapRunID:    "run-1",
	}
	index := domain.MarketIndexSnapshot{
		RunID:            "run-1",
		EntityID:         "segment-1",
		CompositionIndex: 73.9182,
		SampleSize:       11,
		ProvenanceID:     "index-provenance",
		ModelVersion:     "volume-weighted-market-index-v0.1",
	}
	node := domain.CatalogNode{ID: "catalog-1", Platform: "envato", ContentType: "graphics", Level: domain.CatalogLevelCatalog}

	tests := []struct {
		name   string
		wantID string
		want   float64
		build  func() (EvidenceCandidate, error)
	}{
		{"directional breadth", "catalog.directional_breadth.v0.1", catalog.ExposureBreadth, func() (EvidenceCandidate, error) {
			return NewCatalogDirectionalBreadthCandidate(catalog, ctx, movementFacts)
		}},
		{"competition momentum", "catalog.competition_momentum.v0.1", catalog.CompetitionAcceleration, func() (EvidenceCandidate, error) {
			return NewCatalogCompetitionMomentumCandidate(catalog, ctx, movementFacts)
		}},
		{"product prr", "product.peer_relative_rank.v0.1", product.RelativeStrength, func() (EvidenceCandidate, error) {
			return NewProductPRRCandidate(product, ctx, EvidenceFacts{PeerGroupSize: intp(4)})
		}},
		{"catalog prr", "catalog.peer_relative_rank.v0.1", catalog.RelativeStrength, func() (EvidenceCandidate, error) {
			return NewCatalogPRRCandidate(catalog, node, ctx, EvidenceFacts{PeerGroupSize: intp(3), UnderlyingStage: stagep(domain.EvidenceStageMovementIndication)})
		}},
		{"structural composition", "structural.observed_segment_composition.v0.1", index.CompositionIndex, func() (EvidenceCandidate, error) {
			return NewStructuralCompositionCandidate(index, ctx, EvidenceFacts{})
		}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			candidate, err := tc.build()
			if err != nil {
				t.Fatal(err)
			}
			if candidate.Requirement.SignalID != tc.wantID {
				t.Fatalf("signal=%s want=%s", candidate.Requirement.SignalID, tc.wantID)
			}
			if candidate.Value == nil || *candidate.Value != tc.want {
				t.Fatalf("value=%v want exact %v", candidate.Value, tc.want)
			}
		})
	}
}

func TestRepresentativeRequirementLookupFailsClosedOnSourceModelMismatch(t *testing.T) {
	snapshot := domain.ProductSnapshot{ProductID: "p", CatalogID: "c", RelativeStrength: 12.3, ModelVersion: "product-snapshot-v0.1"}
	if _, err := NewProductPRRCandidate(snapshot, representativeContext(), EvidenceFacts{PeerGroupSize: intp(2)}); err == nil {
		t.Fatal("mismatched source model was accepted")
	}
}

func TestRepresentativeProductPRRLocksPeerDefinitionAndSourceStage(t *testing.T) {
	base := domain.ProductSnapshot{
		ProductID:        "product-1",
		CatalogID:        "catalog-1",
		RelativeStrength: 54.75,
		ModelVersion:     "product-snapshot-v0.2",
	}

	withoutHistory, err := NewProductPRRCandidate(base, representativeContext(), EvidenceFacts{PeerGroupSize: intp(2)})
	if err != nil {
		t.Fatal(err)
	}
	if withoutHistory.Facts.PeerDefinitionVersion == nil || *withoutHistory.Facts.PeerDefinitionVersion != ProductPRRPeerDefinitionVersion {
		t.Fatalf("peer definition=%v", withoutHistory.Facts.PeerDefinitionVersion)
	}
	if withoutHistory.Facts.UnderlyingStage == nil || *withoutHistory.Facts.UnderlyingStage != domain.EvidenceStageCompositionOnly {
		t.Fatalf("stage=%v", withoutHistory.Facts.UnderlyingStage)
	}

	score := 33.25
	base.ComparableHistory = true
	base.RankVelocityScore = &score
	withHistory, err := NewProductPRRCandidate(base, representativeContext(), EvidenceFacts{PeerGroupSize: intp(2)})
	if err != nil {
		t.Fatal(err)
	}
	if withHistory.Facts.UnderlyingStage == nil || *withHistory.Facts.UnderlyingStage != domain.EvidenceStageMovementIndication {
		t.Fatalf("stage=%v", withHistory.Facts.UnderlyingStage)
	}

	wrong := "invented-peer-definition/1"
	if _, err := NewProductPRRCandidate(base, representativeContext(), EvidenceFacts{PeerGroupSize: intp(2), PeerDefinitionVersion: &wrong}); err == nil {
		t.Fatal("contradictory peer definition was accepted")
	}
}

func TestRepresentativeCatalogPRRLocksPlatformContentTypeLevelPeerUniverse(t *testing.T) {
	snapshot := domain.CatalogSnapshot{CatalogID: "catalog-1", RelativeStrength: 81.125, ModelVersion: "catalog-snapshot-v0.2"}
	node := domain.CatalogNode{ID: "catalog-1", Platform: "envato", ContentType: "graphics", Level: domain.CatalogLevelCatalog}
	candidate, err := NewCatalogPRRCandidate(snapshot, node, representativeContext(), EvidenceFacts{
		PeerGroupSize:   intp(3),
		UnderlyingStage: stagep(domain.EvidenceStageMovementIndication),
	})
	if err != nil {
		t.Fatal(err)
	}
	if candidate.Facts.PeerDefinitionVersion == nil || *candidate.Facts.PeerDefinitionVersion != CatalogPRRPeerDefinitionVersion {
		t.Fatalf("peer definition=%v", candidate.Facts.PeerDefinitionVersion)
	}
	if candidate.PeerUniverse.Platform != node.Platform || candidate.PeerUniverse.ContentType != node.ContentType || candidate.PeerUniverse.Level != node.Level {
		t.Fatalf("peer universe=%+v node=%+v", candidate.PeerUniverse, node)
	}

	badNode := node
	badNode.ID = "other-catalog"
	if _, err := NewCatalogPRRCandidate(snapshot, badNode, representativeContext(), EvidenceFacts{PeerGroupSize: intp(3), UnderlyingStage: stagep(domain.EvidenceStageMovementIndication)}); err == nil {
		t.Fatal("catalog snapshot/node mismatch was accepted")
	}
}

func TestRepresentativeProductPRRPeerUniverseIsSameCatalog(t *testing.T) {
	snapshot := domain.ProductSnapshot{ProductID: "product-1", CatalogID: "catalog-xyz", RelativeStrength: 11.75, ModelVersion: "product-snapshot-v0.2"}
	candidate, err := NewProductPRRCandidate(snapshot, representativeContext(), EvidenceFacts{PeerGroupSize: intp(2)})
	if err != nil {
		t.Fatal(err)
	}
	if candidate.PeerUniverse.CatalogID != snapshot.CatalogID || candidate.PeerUniverse.DefinitionVersion != ProductPRRPeerDefinitionVersion {
		t.Fatalf("peer universe=%+v", candidate.PeerUniverse)
	}
}

func TestRepresentativeDirectionalBreadthZeroComparableProductsSuppressesLegacy50(t *testing.T) {
	snapshot := domain.CatalogSnapshot{
		CatalogID:          "catalog-1",
		ObservedProducts:   12,
		ComparableProducts: 0,
		ExposureBreadth:    50,
		ModelVersion:       "catalog-snapshot-v0.2",
	}
	candidate, err := NewCatalogDirectionalBreadthCandidate(snapshot, representativeContext(), EvidenceFacts{
		ComparableWindowCount: intp(2),
		ScopeComparability:    exactScope(true),
	})
	if err != nil {
		t.Fatal(err)
	}
	result, err := Evaluate(candidate.Requirement, candidate.Context, candidate.Facts, candidate.Value)
	if err != nil {
		t.Fatal(err)
	}
	if result.Value != nil || result.Evidence.Eligibility != domain.SignalEligibilitySuppressed {
		t.Fatalf("legacy 50 escaped suppression: %+v", result)
	}
	assertHasReason(t, result, domain.ReasonInsufficientObservedProducts)
}

func TestRepresentativeStructuralZeroSampleSuppressesValue(t *testing.T) {
	snapshot := domain.MarketIndexSnapshot{
		RunID:            "run-1",
		EntityID:         "segment-1",
		CompositionIndex: 68.125,
		SampleSize:       0,
		ModelVersion:     "volume-weighted-market-index-v0.1",
	}
	candidate, err := NewStructuralCompositionCandidate(snapshot, representativeContext(), EvidenceFacts{})
	if err != nil {
		t.Fatal(err)
	}
	result, err := Evaluate(candidate.Requirement, candidate.Context, candidate.Facts, candidate.Value)
	if err != nil {
		t.Fatal(err)
	}
	if result.Value != nil || result.Evidence.Eligibility != domain.SignalEligibilitySuppressed {
		t.Fatalf("zero-sample composition escaped suppression: %+v", result)
	}
	assertHasReason(t, result, domain.ReasonInsufficientObservedProducts)
}

func TestRepresentativeZeroBaselineDeltaComesFromUpstreamCountsNotDisplayed100(t *testing.T) {
	ctx := representativeContext()
	facts := EvidenceFacts{
		ComparableWindowCount:   intp(2),
		ScopeComparability:      exactScope(true),
		StableMeasureDefinition: boolp(true),
	}

	proven := domain.CatalogSnapshot{
		CatalogID:               "catalog-1",
		ObservedProducts:        8,
		PreviousNewProducts:     0,
		NewProducts:             3,
		CompetitionAcceleration: 100,
		ModelVersion:            "catalog-snapshot-v0.2",
	}
	candidate, err := NewCatalogCompetitionMomentumCandidate(proven, ctx, facts)
	if err != nil {
		t.Fatal(err)
	}
	if !reasonSliceHas(candidate.Facts.FactualReasonCodes, domain.ReasonZeroBaselineDelta) {
		t.Fatalf("explicit zero baseline reason missing: %v", candidate.Facts.FactualReasonCodes)
	}
	result, err := Evaluate(candidate.Requirement, candidate.Context, candidate.Facts, candidate.Value)
	if err != nil {
		t.Fatal(err)
	}
	assertHasReason(t, result, domain.ReasonZeroBaselineDelta)

	notProven := proven
	notProven.PreviousNewProducts = 2
	notProven.NewProducts = 4
	notProven.CompetitionAcceleration = 100
	candidate, err = NewCatalogCompetitionMomentumCandidate(notProven, ctx, facts)
	if err != nil {
		t.Fatal(err)
	}
	if reasonSliceHas(candidate.Facts.FactualReasonCodes, domain.ReasonZeroBaselineDelta) {
		t.Fatalf("displayed 100 invented zero-baseline reason: %v", candidate.Facts.FactualReasonCodes)
	}
}

func TestRepresentativeUsesSourceProvenanceWithoutChangingEntityIdentity(t *testing.T) {
	ctx := representativeContext()
	snapshot := domain.CatalogSnapshot{
		CatalogID:          "catalog-1",
		ObservedProducts:   8,
		ComparableProducts: 4,
		ExposureBreadth:    59.125,
		ModelVersion:       "catalog-snapshot-v0.2",
		ProvenanceID:       "source-provenance",
		MarketMapRunID:     "run-1",
	}
	candidate, err := NewCatalogDirectionalBreadthCandidate(snapshot, ctx, EvidenceFacts{ComparableWindowCount: intp(2), ScopeComparability: exactScope(true)})
	if err != nil {
		t.Fatal(err)
	}
	if candidate.EntityType != ctx.EntityType || candidate.EntityID != ctx.EntityID {
		t.Fatalf("entity identity changed: candidate=%+v ctx=%+v", candidate, ctx)
	}
	if candidate.ProvenanceID != snapshot.ProvenanceID || candidate.Context.ProvenanceID != snapshot.ProvenanceID {
		t.Fatalf("provenance candidate=%s context=%s", candidate.ProvenanceID, candidate.Context.ProvenanceID)
	}
}

func representativeContext() AssessmentContext {
	return AssessmentContext{
		AssessmentID: "representative-assessment",
		EntityType:   "catalog",
		EntityID:     "entity-1",
		RunID:        "run-1",
		ProvenanceID: "context-provenance",
		AssessedAt:   "2026-08-26T04:00:00+07:00",
	}
}

func reasonSliceHas(reasons []domain.ReasonCode, want domain.ReasonCode) bool {
	for _, reason := range reasons {
		if reason == want {
			return true
		}
	}
	return false
}
