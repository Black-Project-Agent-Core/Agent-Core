package evidence

import (
	"fmt"

	"marketsignallab/internal/domain"
)

const (
	ProductPRRPeerDefinitionVersion  = "c1-product-prr-peer/1"
	CatalogPRRPeerDefinitionVersion  = "c1-catalog-prr-peer/1"
	CatalogODMIPeerDefinitionVersion = "catalog-odmi-peer/1"

	CompetitionAccelerationModelV02   = "competition-acceleration-v0.2"
	DirectionalMomentumModelV02       = "directional-momentum-v0.2"
	PeerRelativeRankModelV02          = "peer-relative-rank-v0.2"
	AuthorConcentrationChangeModelV02 = "author-concentration-change-v0.2"
	MovementDivergenceModelV02        = "movement-divergence-v0.2"
)

func concrete(v float64) *domain.RequirementThreshold {
	return &domain.RequirementThreshold{State: domain.ThresholdConcrete, Value: &v}
}

func toBeCalibrated() *domain.RequirementThreshold {
	return &domain.RequirementThreshold{State: domain.ThresholdToBeCalibrated}
}

func deterministicMinimum(dimension string, value float64, reason domain.ReasonCode) domain.RequirementRule {
	return domain.RequirementRule{
		Dimension:     dimension,
		Applicability: domain.RequirementRequired, RuleClass: domain.RuleClassDeterministic,
		Threshold:          concrete(value),
		FailureDisposition: domain.FailureDispositionSuppress,
		ReasonCode:         reason,
	}
}

func deterministicPredicate(dimension string, reason domain.ReasonCode) domain.RequirementRule {
	return domain.RequirementRule{
		Dimension:          dimension,
		Applicability:      domain.RequirementRequired,
		RuleClass:          domain.RuleClassDeterministic,
		FailureDisposition: domain.FailureDispositionSuppress,
		ReasonCode:         reason,
	}
}

func futureCalibration(dimension string, reason domain.ReasonCode) domain.RequirementRule {
	return domain.RequirementRule{
		Dimension:          dimension,
		Applicability:      domain.RequirementRecommended,
		RuleClass:          domain.RuleClassFutureCalibrationTarget,
		Threshold:          toBeCalibrated(),
		FailureDisposition: domain.FailureDispositionDegrade,
		ReasonCode:         reason,
	}
}

func movementCalibrationRules() []domain.RequirementRule {
	return []domain.RequirementRule{
		futureCalibration("observedProducts", domain.ReasonInsufficientObservedProducts),
		futureCalibration("temporalComparabilityRate", domain.ReasonLowTemporalComparability),
		futureCalibration("movementParticipationRate", domain.ReasonLowParticipation),
		futureCalibration("observationReliability", domain.ReasonLowObservationReliability),
		futureCalibration("queryObservationRate", domain.ReasonLowQueryObservation),
		futureCalibration("queryComparabilityRate", domain.ReasonLowQueryComparability),
		futureCalibration("surfaceCompletionRate", domain.ReasonIncompleteSurfaceCoverage),
		futureCalibration("attributionCoverage", domain.ReasonLowAttributionCoverage),
	}
}

func peerCalibrationRules() []domain.RequirementRule {
	return []domain.RequirementRule{
		futureCalibration("peerGroupSize", domain.ReasonSmallPeerGroup),
		futureCalibration("comparablePeerShare", domain.ReasonLowPeerComparability),
		futureCalibration("peerSpread", domain.ReasonLowPeerSpread),
		futureCalibration("tieDensity", domain.ReasonHighTieDensity),
	}
}

func requirement(signalID, model string, claim domain.ClaimType, rules []domain.RequirementRule) domain.SignalEvidenceRequirement {
	return requirementVersioned(RequirementsVersion, StagePolicyVersion, signalID, model, claim, rules)
}

func requirementC31(signalID, model string, claim domain.ClaimType, rules []domain.RequirementRule) domain.SignalEvidenceRequirement {
	withValuePresence := make([]domain.RequirementRule, 0, len(rules)+1)
	withValuePresence = append(withValuePresence, deterministicPredicate("valuePresent", domain.ReasonMissingRequiredComponent))
	withValuePresence = append(withValuePresence, rules...)
	return requirementVersioned(RequirementsVersionC31, StagePolicyVersionC31, signalID, model, claim, withValuePresence)
}

func requirementVersioned(requirementsVersion, stagePolicyVersion, signalID, model string, claim domain.ClaimType, rules []domain.RequirementRule) domain.SignalEvidenceRequirement {
	return domain.SignalEvidenceRequirement{
		SignalID:               signalID,
		SignalModelVersion:     model,
		ClaimType:              claim,
		RequirementsVersion:    requirementsVersion,
		StagePolicyVersion:     stagePolicyVersion,
		ConfidenceModelVersion: ConfidenceModelVersion,
		Rules:                  rules,
	}
}

func withRules(base []domain.RequirementRule, extra ...domain.RequirementRule) []domain.RequirementRule {
	rules := make([]domain.RequirementRule, 0, len(base)+len(extra))
	rules = append(rules, extra...)
	rules = append(rules, base...)
	return rules
}

var initialRequirements = []domain.SignalEvidenceRequirement{
	requirement(
		"catalog.directional_breadth.v0.1",
		"catalog-snapshot-v0.2",
		domain.ClaimTypeMovement,
		withRules(
			movementCalibrationRules(),
			deterministicMinimum("comparableWindowCount", 2, domain.ReasonNoComparableWindow),
			deterministicMinimum("comparableProducts", 1, domain.ReasonInsufficientObservedProducts),
			deterministicPredicate("scopeComparabilityStatus", domain.ReasonUnstableScanScope),
			deterministicPredicate("windowDurationComparable", domain.ReasonWindowDurationMismatch),
		),
	),
	requirement(
		"catalog.competition_momentum.v0.1",
		"catalog-snapshot-v0.2",
		domain.ClaimTypeMovement,
		withRules(
			movementCalibrationRules(),
			deterministicMinimum("comparableWindowCount", 2, domain.ReasonNoComparableWindow),
			deterministicPredicate("scopeComparabilityStatus", domain.ReasonUnstableScanScope),
			deterministicPredicate("windowDurationComparable", domain.ReasonWindowDurationMismatch),
			deterministicPredicate("stableMeasureDefinition", domain.ReasonMissingRequiredComponent),
		),
	),
	requirement(
		"product.peer_relative_rank.v0.1",
		"product-snapshot-v0.2",
		domain.ClaimTypePeerRelative,
		withRules(
			peerCalibrationRules(),
			deterministicPredicate("peerDefinitionVersion", domain.ReasonIncompatibleModelVersion),
			deterministicMinimum("peerGroupSize", 2, domain.ReasonSmallPeerGroup),
		),
	),
	requirement(
		"catalog.peer_relative_rank.v0.1",
		"catalog-snapshot-v0.2",
		domain.ClaimTypePeerRelative,
		withRules(
			peerCalibrationRules(),
			deterministicPredicate("peerDefinitionVersion", domain.ReasonIncompatibleModelVersion),
			deterministicMinimum("peerGroupSize", 2, domain.ReasonSmallPeerGroup),
			deterministicPredicate("minimumUnderlyingStage", domain.ReasonInsufficientMovementEligibility),
		),
	),
	requirement(
		"structural.observed_segment_composition.v0.1",
		"volume-weighted-market-index-v0.1",
		domain.ClaimTypeComposition,
		[]domain.RequirementRule{
			deterministicPredicate("valuePresent", domain.ReasonMissingRequiredComponent),
			deterministicMinimum("sampleSize", 1, domain.ReasonInsufficientObservedProducts),
			futureCalibration("sampleSize", domain.ReasonInsufficientObservedProducts),
		},
	),
}

func c31AggregateCalibrationRules() []domain.RequirementRule {
	return []domain.RequirementRule{
		futureCalibration("eligibleChildShare", domain.ReasonLowParticipation),
		futureCalibration("observationReliability", domain.ReasonLowObservationReliability),
	}
}

var c31Requirements = []domain.SignalEvidenceRequirement{
	requirementC31(
		"catalog.competition_acceleration.v0.2",
		CompetitionAccelerationModelV02,
		domain.ClaimTypeMovement,
		withRules(
			movementCalibrationRules(),
			deterministicMinimum("comparableWindowCount", 3, domain.ReasonNoComparableWindow),
			deterministicPredicate("scopeComparabilityStatus", domain.ReasonUnstableScanScope),
			deterministicPredicate("windowDurationComparable", domain.ReasonWindowDurationMismatch),
			deterministicPredicate("stableMeasureDefinition", domain.ReasonMissingRequiredComponent),
		),
	),
	requirementC31(
		"catalog.odmi.v0.2",
		DirectionalMomentumModelV02,
		domain.ClaimTypeMovement,
		withRules(
			movementCalibrationRules(),
			deterministicMinimum("comparableWindowCount", 2, domain.ReasonNoComparableWindow),
			deterministicMinimum("comparableProducts", 1, domain.ReasonInsufficientObservedProducts),
			deterministicPredicate("scopeComparabilityStatus", domain.ReasonUnstableScanScope),
			deterministicPredicate("windowDurationComparable", domain.ReasonWindowDurationMismatch),
		),
	),
	requirementC31(
		"catalog.momentum_magnitude.v0.2",
		DirectionalMomentumModelV02,
		domain.ClaimTypeMovement,
		withRules(
			movementCalibrationRules(),
			deterministicMinimum("comparableWindowCount", 2, domain.ReasonNoComparableWindow),
			deterministicMinimum("comparableProducts", 1, domain.ReasonInsufficientObservedProducts),
			deterministicPredicate("scopeComparabilityStatus", domain.ReasonUnstableScanScope),
			deterministicPredicate("windowDurationComparable", domain.ReasonWindowDurationMismatch),
		),
	),
	requirementC31(
		"catalog.peer_relative_rank_odmi.v0.2",
		PeerRelativeRankModelV02,
		domain.ClaimTypePeerRelative,
		withRules(
			peerCalibrationRules(),
			deterministicPredicate("peerDefinitionVersion", domain.ReasonIncompatibleModelVersion),
			deterministicMinimum("peerGroupSize", 2, domain.ReasonSmallPeerGroup),
			deterministicPredicate("minimumUnderlyingStage", domain.ReasonInsufficientMovementEligibility),
		),
	),
	requirementC31(
		"catalog.author_concentration_change.v0.2",
		AuthorConcentrationChangeModelV02,
		domain.ClaimTypeMovement,
		withRules(
			movementCalibrationRules(),
			deterministicMinimum("comparableWindowCount", 2, domain.ReasonNoComparableWindow),
			deterministicPredicate("attributionPresent", domain.ReasonNoAttributedProducts),
			deterministicPredicate("scopeComparabilityStatus", domain.ReasonUnstableScanScope),
			deterministicPredicate("windowDurationComparable", domain.ReasonWindowDurationMismatch),
			deterministicPredicate("stableMeasureDefinition", domain.ReasonMissingRequiredComponent),
		),
	),
	requirementC31(
		"structural.product_mass_weighted_movement.v0.2",
		MovementDivergenceModelV02,
		domain.ClaimTypeMovement,
		withRules(
			c31AggregateCalibrationRules(),
			deterministicMinimum("eligibleChildCount", 1, domain.ReasonInsufficientMovementEligibility),
			deterministicPredicate("minimumUnderlyingStage", domain.ReasonInsufficientMovementEligibility),
			deterministicPredicate("stableMeasureDefinition", domain.ReasonMissingRequiredComponent),
		),
	),
	requirementC31(
		"structural.equal_segment_movement.v0.2",
		MovementDivergenceModelV02,
		domain.ClaimTypeMovement,
		withRules(
			c31AggregateCalibrationRules(),
			deterministicMinimum("eligibleChildCount", 1, domain.ReasonInsufficientMovementEligibility),
			deterministicPredicate("minimumUnderlyingStage", domain.ReasonInsufficientMovementEligibility),
			deterministicPredicate("stableMeasureDefinition", domain.ReasonMissingRequiredComponent),
		),
	),
	requirementC31(
		"structural.signed_movement_divergence.v0.2",
		MovementDivergenceModelV02,
		domain.ClaimTypeMovement,
		withRules(
			c31AggregateCalibrationRules(),
			deterministicMinimum("eligibleChildCount", 2, domain.ReasonInsufficientMovementEligibility),
			deterministicPredicate("minimumUnderlyingStage", domain.ReasonInsufficientMovementEligibility),
			deterministicPredicate("stableMeasureDefinition", domain.ReasonMissingRequiredComponent),
		),
	),
	requirementC31(
		"structural.divergence_magnitude.v0.2",
		MovementDivergenceModelV02,
		domain.ClaimTypeMovement,
		withRules(
			c31AggregateCalibrationRules(),
			deterministicMinimum("eligibleChildCount", 2, domain.ReasonInsufficientMovementEligibility),
			deterministicPredicate("minimumUnderlyingStage", domain.ReasonInsufficientMovementEligibility),
			deterministicPredicate("stableMeasureDefinition", domain.ReasonMissingRequiredComponent),
		),
	),
}

func cloneRequirement(req domain.SignalEvidenceRequirement) domain.SignalEvidenceRequirement {
	out := req
	out.Rules = make([]domain.RequirementRule, len(req.Rules))
	for i, rule := range req.Rules {
		out.Rules[i] = rule
		if rule.Threshold != nil {
			threshold := *rule.Threshold
			if rule.Threshold.Value != nil {
				value := *rule.Threshold.Value
				threshold.Value = &value
			}
			out.Rules[i].Threshold = &threshold
		}
	}
	return out
}

func Requirements() []domain.SignalEvidenceRequirement {
	out, _ := RequirementsForVersion(RequirementsVersion)
	return out
}

func RequirementsForVersion(version string) ([]domain.SignalEvidenceRequirement, error) {
	var registry []domain.SignalEvidenceRequirement
	switch version {
	case RequirementsVersion:
		registry = initialRequirements
	case RequirementsVersionC31:
		registry = c31Requirements
	default:
		return nil, fmt.Errorf("unsupported evidence requirements %q", version)
	}
	out := make([]domain.SignalEvidenceRequirement, len(registry))
	for i, req := range registry {
		out[i] = cloneRequirement(req)
	}
	return out, nil
}

func Requirement(signalID, signalModelVersion string) (domain.SignalEvidenceRequirement, error) {
	return RequirementForVersion(RequirementsVersion, signalID, signalModelVersion)
}

func RequirementForVersion(version, signalID, signalModelVersion string) (domain.SignalEvidenceRequirement, error) {
	registry, err := RequirementsForVersion(version)
	if err != nil {
		return domain.SignalEvidenceRequirement{}, err
	}
	for _, req := range registry {
		if req.SignalID == signalID && req.SignalModelVersion == signalModelVersion {
			return cloneRequirement(req), nil
		}
	}
	return domain.SignalEvidenceRequirement{}, fmt.Errorf("unsupported evidence requirement %q@%q for %s", signalID, signalModelVersion, version)
}
