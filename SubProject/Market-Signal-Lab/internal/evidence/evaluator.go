package evidence

import (
	"fmt"
	"sort"

	"marketsignallab/internal/domain"
)

func Evaluate(req domain.SignalEvidenceRequirement, ctx AssessmentContext, facts EvidenceFacts, value *float64) (domain.SignalResult, error) {
	if err := validateEvaluationRequirement(req); err != nil {
		return domain.SignalResult{}, err
	}

	eligibility := domain.SignalEligibilityEligible
	reasons := map[domain.ReasonCode]struct{}{}
	for _, reason := range facts.FactualReasonCodes {
		if !IsKnownReasonCode(reason) {
			return domain.SignalResult{}, fmt.Errorf("unknown factual reason code %q", reason)
		}
		reasons[reason] = struct{}{}
	}

	for _, rule := range req.Rules {
		if rule.RuleClass != domain.RuleClassDeterministic {
			continue
		}
		if err := ValidateRequirementApplicability(rule.Applicability); err != nil {
			return domain.SignalResult{}, err
		}
		if err := ValidateFailureDisposition(rule.FailureDisposition); err != nil {
			return domain.SignalResult{}, err
		}
		if rule.Applicability == domain.RequirementNotApplicable {
			continue
		}

		passed, present, err := deterministicRulePass(req, rule, facts)
		if err != nil {
			return domain.SignalResult{}, err
		}
		if !present {
			if rule.Applicability == domain.RequirementRequired {
				eligibility = domain.SignalEligibilitySuppressed
				reasons[domain.ReasonMissingRequiredComponent] = struct{}{}
			}
			continue
		}
		if passed {
			continue
		}
		if !IsKnownReasonCode(rule.ReasonCode) {
			return domain.SignalResult{}, fmt.Errorf("unknown reason code %q for deterministic dimension %q", rule.ReasonCode, rule.Dimension)
		}
		reasons[rule.ReasonCode] = struct{}{}
		eligibility = applyFailureDisposition(eligibility, rule.FailureDisposition)
	}

	stage, stageReasons := MaximumStage(stageInputFromFacts(req.ClaimType, facts))
	for _, reason := range stageReasons {
		if !IsKnownReasonCode(reason) {
			return domain.SignalResult{}, fmt.Errorf("unknown stage reason code %q", reason)
		}
		reasons[reason] = struct{}{}
	}

	resultValue := cloneFloat64(value)
	if eligibility == domain.SignalEligibilitySuppressed {
		resultValue = nil
	}

	assessment := domain.EvidenceAssessment{
		AssessmentID:              ctx.AssessmentID,
		RequirementsVersion:       req.RequirementsVersion,
		SignalID:                  req.SignalID,
		SignalModelVersion:        req.SignalModelVersion,
		EntityType:                ctx.EntityType,
		EntityID:                  ctx.EntityID,
		RunID:                     ctx.RunID,
		EvidenceStage:             stage,
		Eligibility:               eligibility,
		ReasonCodes:               sortedReasons(reasons),
		ComparableWindowCount:     cloneInt(facts.ComparableWindowCount),
		ObservedProducts:          cloneInt(facts.ObservedProducts),
		ComparableProducts:        cloneInt(facts.ComparableProducts),
		TemporalComparabilityRate: cloneFloat64(facts.TemporalComparabilityRate),
		MovementParticipationRate: cloneFloat64(facts.MovementParticipationRate),
		QueriesPlanned:            cloneInt(facts.QueriesPlanned),
		QueriesObserved:           cloneInt(facts.QueriesObserved),
		QueriesComparable:         cloneInt(facts.QueriesComparable),
		QueryObservationRate:      cloneFloat64(facts.QueryObservationRate),
		QueryComparabilityRate:    cloneFloat64(facts.QueryComparabilityRate),
		EligibleSurfaces:          cloneInt(facts.EligibleSurfaces),
		CompletedSurfaces:         cloneInt(facts.CompletedSurfaces),
		SurfaceCompletionRate:     cloneFloat64(facts.SurfaceCompletionRate),
		AttributedProducts:        cloneInt(facts.AttributedProducts),
		AttributionCoverage:       cloneFloat64(facts.AttributionCoverage),
		ObservationReliability:    cloneFloat64(facts.ObservationReliability),
		PeerGroupSize:             cloneInt(facts.PeerGroupSize),
		ComparablePeerShare:       cloneFloat64(facts.ComparablePeerShare),
		PeerSpread:                cloneFloat64(facts.PeerSpread),
		TieDensity:                cloneFloat64(facts.TieDensity),
		EligibleChildCount:        cloneInt(facts.EligibleChildCount),
		TotalChildCount:           cloneInt(facts.TotalChildCount),
		EligibleChildShare:        cloneFloat64(facts.EligibleChildShare),
		ScopeComparability:        cloneScopeComparability(facts.ScopeComparability),
		Confidence:                UncalibratedConfidence(),
		ProvenanceID:              ctx.ProvenanceID,
		AssessedAt:                ctx.AssessedAt,
	}

	return domain.SignalResult{
		SignalID:           req.SignalID,
		SignalModelVersion: req.SignalModelVersion,
		Value:              resultValue,
		Evidence:           assessment,
	}, nil
}

func validateEvaluationRequirement(req domain.SignalEvidenceRequirement) error {
	if err := ValidateRequirementsVersion(req.RequirementsVersion); err != nil {
		return err
	}
	canonical, err := RequirementForVersion(req.RequirementsVersion, req.SignalID, req.SignalModelVersion)
	if err != nil {
		return err
	}
	if err := ValidateStagePolicyVersion(req.StagePolicyVersion); err != nil {
		return err
	}
	if err := ValidateConfidenceModelVersion(req.ConfidenceModelVersion); err != nil {
		return err
	}
	if err := ValidateClaimType(req.ClaimType); err != nil {
		return err
	}
	if req.StagePolicyVersion != canonical.StagePolicyVersion {
		return fmt.Errorf("stage policy %q does not match registered requirement %q for %s@%s", req.StagePolicyVersion, canonical.StagePolicyVersion, req.SignalID, req.SignalModelVersion)
	}
	if req.ConfidenceModelVersion != canonical.ConfidenceModelVersion {
		return fmt.Errorf("confidence model %q does not match registered requirement %q for %s@%s", req.ConfidenceModelVersion, canonical.ConfidenceModelVersion, req.SignalID, req.SignalModelVersion)
	}
	if req.ClaimType != canonical.ClaimType {
		return fmt.Errorf("claim type %q does not match registered requirement %q for %s@%s", req.ClaimType, canonical.ClaimType, req.SignalID, req.SignalModelVersion)
	}
	return nil
}

func deterministicRulePass(req domain.SignalEvidenceRequirement, rule domain.RequirementRule, facts EvidenceFacts) (passed bool, present bool, err error) {
	switch rule.Dimension {
	case "scopeComparabilityStatus":
		if facts.ScopeComparability == nil {
			return false, false, nil
		}
		status := facts.ScopeComparability.Status
		return status == domain.ScopeComparabilityExactMatch || status == domain.ScopeComparabilityDeclaredCompatible, true, nil
	case "windowDurationComparable":
		if facts.ScopeComparability == nil || facts.ScopeComparability.WindowDurationComparable == nil {
			return false, false, nil
		}
		return *facts.ScopeComparability.WindowDurationComparable, true, nil
	case "stableMeasureDefinition":
		if facts.StableMeasureDefinition == nil {
			return false, false, nil
		}
		return *facts.StableMeasureDefinition, true, nil
	case "valuePresent":
		if facts.ValuePresent == nil {
			return false, false, nil
		}
		return *facts.ValuePresent, true, nil
	case "attributionPresent":
		if facts.AttributionPresent == nil {
			return false, false, nil
		}
		return *facts.AttributionPresent, true, nil
	case "peerDefinitionVersion":
		if facts.PeerDefinitionVersion == nil {
			return false, false, nil
		}
		expected, err := expectedPeerDefinitionVersion(req.SignalID)
		if err != nil {
			return false, true, err
		}
		return *facts.PeerDefinitionVersion == expected, true, nil
	case "minimumUnderlyingStage":
		if facts.UnderlyingStage == nil {
			return false, false, nil
		}
		return capC30(*facts.UnderlyingStage) == domain.EvidenceStageMovementIndication, true, nil
	default:
		got, present, ok := numericFact(rule.Dimension, facts)
		if !ok {
			return false, false, fmt.Errorf("unsupported deterministic evidence dimension %q", rule.Dimension)
		}
		if !present {
			return false, false, nil
		}
		if rule.Threshold == nil || rule.Threshold.State != domain.ThresholdConcrete || rule.Threshold.Value == nil {
			return false, true, fmt.Errorf("deterministic numeric dimension %q requires a concrete threshold", rule.Dimension)
		}
		return got >= *rule.Threshold.Value, true, nil
	}
}

func expectedPeerDefinitionVersion(signalID string) (string, error) {
	switch signalID {
	case "product.peer_relative_rank.v0.1":
		return ProductPRRPeerDefinitionVersion, nil
	case "catalog.peer_relative_rank.v0.1":
		return CatalogPRRPeerDefinitionVersion, nil
	case "catalog.peer_relative_rank_odmi.v0.2":
		return CatalogODMIPeerDefinitionVersion, nil
	default:
		return "", fmt.Errorf("signal %q has no registered peer definition", signalID)
	}
}

func numericFact(dimension string, facts EvidenceFacts) (float64, bool, bool) {
	switch dimension {
	case "comparableWindowCount":
		return intFact(facts.ComparableWindowCount)
	case "observedProducts":
		return intFact(facts.ObservedProducts)
	case "comparableProducts":
		return intFact(facts.ComparableProducts)
	case "temporalComparabilityRate":
		return floatFact(facts.TemporalComparabilityRate)
	case "movementParticipationRate":
		return floatFact(facts.MovementParticipationRate)
	case "queriesPlanned":
		return intFact(facts.QueriesPlanned)
	case "queriesObserved":
		return intFact(facts.QueriesObserved)
	case "queriesComparable":
		return intFact(facts.QueriesComparable)
	case "queryObservationRate":
		return floatFact(facts.QueryObservationRate)
	case "queryComparabilityRate":
		return floatFact(facts.QueryComparabilityRate)
	case "eligibleSurfaces":
		return intFact(facts.EligibleSurfaces)
	case "completedSurfaces":
		return intFact(facts.CompletedSurfaces)
	case "surfaceCompletionRate":
		return floatFact(facts.SurfaceCompletionRate)
	case "attributedProducts":
		return intFact(facts.AttributedProducts)
	case "attributionCoverage":
		return floatFact(facts.AttributionCoverage)
	case "observationReliability":
		return floatFact(facts.ObservationReliability)
	case "peerGroupSize":
		return intFact(facts.PeerGroupSize)
	case "comparablePeerShare":
		return floatFact(facts.ComparablePeerShare)
	case "peerSpread":
		return floatFact(facts.PeerSpread)
	case "tieDensity":
		return floatFact(facts.TieDensity)
	case "eligibleChildCount":
		return intFact(facts.EligibleChildCount)
	case "totalChildCount":
		return intFact(facts.TotalChildCount)
	case "eligibleChildShare":
		return floatFact(facts.EligibleChildShare)
	case "sampleSize":
		return intFact(facts.SampleSize)
	default:
		return 0, false, false
	}
}

func intFact(value *int) (float64, bool, bool) {
	if value == nil {
		return 0, false, true
	}
	return float64(*value), true, true
}

func floatFact(value *float64) (float64, bool, bool) {
	if value == nil {
		return 0, false, true
	}
	return *value, true, true
}

func applyFailureDisposition(current domain.SignalEligibility, disposition domain.FailureDisposition) domain.SignalEligibility {
	switch disposition {
	case domain.FailureDispositionSuppress:
		return domain.SignalEligibilitySuppressed
	case domain.FailureDispositionDegrade:
		if current != domain.SignalEligibilitySuppressed {
			return domain.SignalEligibilityDegraded
		}
	}
	return current
}

func stageInputFromFacts(claim domain.ClaimType, facts EvidenceFacts) StageInput {
	in := StageInput{ClaimType: claim, InheritedStage: facts.UnderlyingStage}
	if facts.ComparableWindowCount != nil {
		in.ComparableWindowCount = *facts.ComparableWindowCount
	}
	if facts.ScopeComparability != nil {
		in.ScopeComparable = facts.ScopeComparability.Status == domain.ScopeComparabilityExactMatch ||
			facts.ScopeComparability.Status == domain.ScopeComparabilityDeclaredCompatible
		if facts.ScopeComparability.WindowDurationComparable != nil {
			in.WindowDurationComparable = *facts.ScopeComparability.WindowDurationComparable
		}
	}
	return in
}

func sortedReasons(set map[domain.ReasonCode]struct{}) []domain.ReasonCode {
	if len(set) == 0 {
		return nil
	}
	out := make([]domain.ReasonCode, 0, len(set))
	for reason := range set {
		out = append(out, reason)
	}
	sort.Slice(out, func(i, j int) bool { return string(out[i]) < string(out[j]) })
	return out
}

func cloneInt(value *int) *int {
	if value == nil {
		return nil
	}
	out := *value
	return &out
}

func cloneFloat64(value *float64) *float64 {
	if value == nil {
		return nil
	}
	out := *value
	return &out
}

func cloneScopeComparability(value *domain.ScopeComparabilityResult) *domain.ScopeComparabilityResult {
	if value == nil {
		return nil
	}
	out := *value
	out.PlannerComparable = cloneBool(value.PlannerComparable)
	out.SamplingSchemaComparable = cloneBool(value.SamplingSchemaComparable)
	out.TaxonomyComparable = cloneBool(value.TaxonomyComparable)
	out.WeightingComparable = cloneBool(value.WeightingComparable)
	out.SourcePolicyComparable = cloneBool(value.SourcePolicyComparable)
	out.WindowDurationComparable = cloneBool(value.WindowDurationComparable)
	out.QueryUniverseComparable = cloneBool(value.QueryUniverseComparable)
	out.SurfaceUniverseComparable = cloneBool(value.SurfaceUniverseComparable)
	if value.ReasonCodes != nil {
		out.ReasonCodes = append([]domain.ReasonCode(nil), value.ReasonCodes...)
	}
	return &out
}

func cloneBool(value *bool) *bool {
	if value == nil {
		return nil
	}
	out := *value
	return &out
}
