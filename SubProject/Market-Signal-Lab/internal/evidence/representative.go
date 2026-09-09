package evidence

import (
	"fmt"
	"strings"

	"marketsignallab/internal/domain"
)

type PeerUniverseDescriptor struct {
	DefinitionVersion string
	CatalogID         string
	Platform          string
	ContentType       string
	Level             domain.CatalogLevel
}

type EvidenceCandidate struct {
	Requirement  domain.SignalEvidenceRequirement
	Context      AssessmentContext
	Facts        EvidenceFacts
	Value        *float64
	EntityType   string
	EntityID     string
	ProvenanceID string
	PeerUniverse PeerUniverseDescriptor
}

func NewCatalogDirectionalBreadthCandidate(snapshot domain.CatalogSnapshot, ctx AssessmentContext, facts EvidenceFacts) (EvidenceCandidate, error) {
	req, err := Requirement("catalog.directional_breadth.v0.1", snapshot.ModelVersion)
	if err != nil {
		return EvidenceCandidate{}, err
	}
	if err := ensureIntFact(&facts.ObservedProducts, snapshot.ObservedProducts, "observedProducts"); err != nil {
		return EvidenceCandidate{}, err
	}
	if err := ensureIntFact(&facts.ComparableProducts, snapshot.ComparableProducts, "comparableProducts"); err != nil {
		return EvidenceCandidate{}, err
	}
	return buildRepresentativeCandidate(req, ctx, facts, snapshot.ExposureBreadth, snapshot.MarketMapRunID, snapshot.ProvenanceID, PeerUniverseDescriptor{})
}

func NewCatalogCompetitionMomentumCandidate(snapshot domain.CatalogSnapshot, ctx AssessmentContext, facts EvidenceFacts) (EvidenceCandidate, error) {
	req, err := Requirement("catalog.competition_momentum.v0.1", snapshot.ModelVersion)
	if err != nil {
		return EvidenceCandidate{}, err
	}
	if err := ensureIntFact(&facts.ObservedProducts, snapshot.ObservedProducts, "observedProducts"); err != nil {
		return EvidenceCandidate{}, err
	}
	if snapshot.PreviousNewProducts == 0 && snapshot.NewProducts > 0 {
		facts.FactualReasonCodes = appendReasonIfMissing(facts.FactualReasonCodes, domain.ReasonZeroBaselineDelta)
	}
	return buildRepresentativeCandidate(req, ctx, facts, snapshot.CompetitionAcceleration, snapshot.MarketMapRunID, snapshot.ProvenanceID, PeerUniverseDescriptor{})
}

func NewProductPRRCandidate(snapshot domain.ProductSnapshot, ctx AssessmentContext, facts EvidenceFacts) (EvidenceCandidate, error) {
	if strings.TrimSpace(snapshot.CatalogID) == "" {
		return EvidenceCandidate{}, fmt.Errorf("product PRR requires a non-empty CatalogID peer universe")
	}
	req, err := Requirement("product.peer_relative_rank.v0.1", snapshot.ModelVersion)
	if err != nil {
		return EvidenceCandidate{}, err
	}
	if err := ensureStringFact(&facts.PeerDefinitionVersion, ProductPRRPeerDefinitionVersion, "peerDefinitionVersion"); err != nil {
		return EvidenceCandidate{}, err
	}
	if facts.UnderlyingStage == nil {
		stage := domain.EvidenceStageCompositionOnly
		if snapshot.ComparableHistory && snapshot.RankVelocityScore != nil {
			stage = domain.EvidenceStageMovementIndication
		}
		facts.UnderlyingStage = &stage
	} else if !snapshot.ComparableHistory && capC30(*facts.UnderlyingStage) != domain.EvidenceStageCompositionOnly {
		return EvidenceCandidate{}, fmt.Errorf("product PRR without comparable history cannot inherit movement evidence stage")
	}
	peer := PeerUniverseDescriptor{
		DefinitionVersion: ProductPRRPeerDefinitionVersion,
		CatalogID:         snapshot.CatalogID,
	}
	return buildRepresentativeCandidate(req, ctx, facts, snapshot.RelativeStrength, snapshot.MarketMapRunID, snapshot.ProvenanceID, peer)
}

func NewCatalogPRRCandidate(snapshot domain.CatalogSnapshot, node domain.CatalogNode, ctx AssessmentContext, facts EvidenceFacts) (EvidenceCandidate, error) {
	if snapshot.CatalogID == "" || node.ID != snapshot.CatalogID {
		return EvidenceCandidate{}, fmt.Errorf("catalog PRR snapshot/node identity mismatch: snapshot=%q node=%q", snapshot.CatalogID, node.ID)
	}
	if strings.TrimSpace(node.Platform) == "" || strings.TrimSpace(node.ContentType) == "" || node.Level == "" {
		return EvidenceCandidate{}, fmt.Errorf("catalog PRR requires Platform|ContentType|Level peer-universe facts")
	}
	req, err := Requirement("catalog.peer_relative_rank.v0.1", snapshot.ModelVersion)
	if err != nil {
		return EvidenceCandidate{}, err
	}
	if err := ensureStringFact(&facts.PeerDefinitionVersion, CatalogPRRPeerDefinitionVersion, "peerDefinitionVersion"); err != nil {
		return EvidenceCandidate{}, err
	}
	peer := PeerUniverseDescriptor{
		DefinitionVersion: CatalogPRRPeerDefinitionVersion,
		Platform:          node.Platform,
		ContentType:       node.ContentType,
		Level:             node.Level,
	}
	return buildRepresentativeCandidate(req, ctx, facts, snapshot.RelativeStrength, snapshot.MarketMapRunID, snapshot.ProvenanceID, peer)
}

func NewStructuralCompositionCandidate(snapshot domain.MarketIndexSnapshot, ctx AssessmentContext, facts EvidenceFacts) (EvidenceCandidate, error) {
	req, err := Requirement("structural.observed_segment_composition.v0.1", snapshot.ModelVersion)
	if err != nil {
		return EvidenceCandidate{}, err
	}
	if facts.ValuePresent == nil {
		present := true
		facts.ValuePresent = &present
	} else if !*facts.ValuePresent {
		return EvidenceCandidate{}, fmt.Errorf("structural composition source value is present but facts.valuePresent=false")
	}
	if err := ensureIntFact(&facts.SampleSize, snapshot.SampleSize, "sampleSize"); err != nil {
		return EvidenceCandidate{}, err
	}
	return buildRepresentativeCandidate(req, ctx, facts, snapshot.CompositionIndex, snapshot.RunID, snapshot.ProvenanceID, PeerUniverseDescriptor{})
}

func buildRepresentativeCandidate(
	req domain.SignalEvidenceRequirement,
	ctx AssessmentContext,
	facts EvidenceFacts,
	value float64,
	sourceRunID string,
	sourceProvenanceID string,
	peer PeerUniverseDescriptor,
) (EvidenceCandidate, error) {
	if ctx.RunID != "" && sourceRunID != "" && ctx.RunID != sourceRunID {
		return EvidenceCandidate{}, fmt.Errorf("assessment run %q does not match source run %q", ctx.RunID, sourceRunID)
	}
	if ctx.RunID == "" {
		ctx.RunID = sourceRunID
	}
	if sourceProvenanceID != "" {
		ctx.ProvenanceID = sourceProvenanceID
	}
	return EvidenceCandidate{
		Requirement:  req,
		Context:      ctx,
		Facts:        facts,
		Value:        cloneFloat64(&value),
		EntityType:   ctx.EntityType,
		EntityID:     ctx.EntityID,
		ProvenanceID: ctx.ProvenanceID,
		PeerUniverse: peer,
	}, nil
}

func ensureIntFact(target **int, source int, dimension string) error {
	if *target == nil {
		value := source
		*target = &value
		return nil
	}
	if **target != source {
		return fmt.Errorf("%s fact=%d does not match frozen source=%d", dimension, **target, source)
	}
	return nil
}

func ensureStringFact(target **string, expected, dimension string) error {
	if *target == nil {
		value := expected
		*target = &value
		return nil
	}
	if **target != expected {
		return fmt.Errorf("%s fact=%q does not match pinned definition=%q", dimension, **target, expected)
	}
	return nil
}

func appendReasonIfMissing(reasons []domain.ReasonCode, reason domain.ReasonCode) []domain.ReasonCode {
	for _, existing := range reasons {
		if existing == reason {
			return reasons
		}
	}
	return append(reasons, reason)
}
