package evidence

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"

	"marketsignallab/internal/domain"
)

const (
	ContractVersion        = "msl-evidence-contract/1"
	RequirementsVersion    = "msl-evidence-requirements/1"
	RequirementsVersionC31 = "msl-evidence-requirements/2"
	StagePolicyVersion     = "msl-evidence-stage/c3.0-1"
	StagePolicyVersionC31  = "msl-evidence-stage/c3.1-1"
	ConfidenceModelVersion = "msl-evidence-confidence/uncalibrated-1"
)

func AssessmentID(runID, entityType, entityID, signalID, modelVersion, requirementsVersion string) string {
	raw := strings.Join([]string{runID, entityType, entityID, signalID, modelVersion, requirementsVersion}, "\x1f")
	sum := sha256.Sum256([]byte(raw))
	return "eva_" + hex.EncodeToString(sum[:12])
}

func validateVersion(kind, got, want string) error {
	if got != want {
		return fmt.Errorf("unsupported %s %q", kind, got)
	}
	return nil
}

func ValidateContractVersion(version string) error {
	return validateVersion("evidence contract", version, ContractVersion)
}

func ValidateRequirementsVersion(version string) error {
	switch version {
	case RequirementsVersion, RequirementsVersionC31:
		return nil
	default:
		return fmt.Errorf("unsupported evidence requirements %q", version)
	}
}
func ValidateStagePolicyVersion(version string) error {
	switch version {
	case StagePolicyVersion, StagePolicyVersionC31:
		return nil
	default:
		return fmt.Errorf("unsupported evidence stage policy %q", version)
	}
}

func ValidateConfidenceModelVersion(version string) error {
	return validateVersion("evidence confidence model", version, ConfidenceModelVersion)
}

var reasonCodes = []domain.ReasonCode{
	domain.ReasonLimitedTemporalDepth,
	domain.ReasonNoComparableWindow,
	domain.ReasonWindowDurationMismatch,
	domain.ReasonUnstableScanScope,
	domain.ReasonSamplingPolicyChanged,
	domain.ReasonSourcePolicyChanged,
	domain.ReasonIncompatibleModelVersion,
	domain.ReasonInsufficientObservedProducts,
	domain.ReasonLowTemporalComparability,
	domain.ReasonLowParticipation,
	domain.ReasonLowObservationReliability,
	domain.ReasonLowQueryObservation,
	domain.ReasonLowQueryComparability,
	domain.ReasonIncompleteSurfaceCoverage,
	domain.ReasonLowAttributionCoverage,
	domain.ReasonNoAttributedProducts,
	domain.ReasonSmallPeerGroup,
	domain.ReasonLowPeerComparability,
	domain.ReasonLowPeerSpread,
	domain.ReasonHighTieDensity,
	domain.ReasonInsufficientMovementEligibility,
	domain.ReasonCapRelaxedForSmallPeerSet,
	domain.ReasonZeroBaselineDelta,
	domain.ReasonMissingRequiredComponent,
}

func ReasonCodes() []domain.ReasonCode {
	out := make([]domain.ReasonCode, len(reasonCodes))
	copy(out, reasonCodes)
	return out
}

func IsKnownReasonCode(code domain.ReasonCode) bool {
	for _, known := range reasonCodes {
		if known == code {
			return true
		}
	}
	return false
}

func UncalibratedConfidence() domain.ConfidenceAssessment {
	return domain.ConfidenceAssessment{Band: domain.ConfidenceBandUncalibrated, ModelVersion: ConfidenceModelVersion}
}
func invalidEnum(kind string, value any) error {
	return fmt.Errorf("invalid %s %q", kind, value)
}

func ValidateEvidenceStage(value domain.EvidenceStage) error {
	switch value {
	case domain.EvidenceStageCompositionOnly,
		domain.EvidenceStageMovementIndication,
		domain.EvidenceStagePreliminaryTrend,
		domain.EvidenceStageEstablishedTrend,
		domain.EvidenceStageSeasonalityCandidate:
		return nil
	default:
		return invalidEnum("evidence stage", value)
	}
}

func ValidateSignalEligibility(value domain.SignalEligibility) error {
	switch value {
	case domain.SignalEligibilityEligible, domain.SignalEligibilityDegraded, domain.SignalEligibilitySuppressed:
		return nil
	default:
		return invalidEnum("signal eligibility", value)
	}
}
func ValidateClaimType(value domain.ClaimType) error {
	switch value {
	case domain.ClaimTypeComposition, domain.ClaimTypeMovement, domain.ClaimTypePeerRelative:
		return nil
	default:
		return invalidEnum("claim type", value)
	}
}

func ValidateRuleClass(value domain.RuleClass) error {
	switch value {
	case domain.RuleClassDeterministic, domain.RuleClassConfigurableThreshold, domain.RuleClassFutureCalibrationTarget:
		return nil
	default:
		return invalidEnum("rule class", value)
	}
}

func ValidateRequirementApplicability(value domain.RequirementApplicability) error {
	switch value {
	case domain.RequirementRequired, domain.RequirementRecommended, domain.RequirementNotApplicable:
		return nil
	default:
		return invalidEnum("requirement applicability", value)
	}
}
func ValidateFailureDisposition(value domain.FailureDisposition) error {
	switch value {
	case domain.FailureDispositionInfo, domain.FailureDispositionDegrade, domain.FailureDispositionSuppress:
		return nil
	default:
		return invalidEnum("failure disposition", value)
	}
}
func ValidateScopeComparabilityStatus(value domain.ScopeComparabilityStatus) error {
	switch value {
	case domain.ScopeComparabilityNotApplicable,
		domain.ScopeComparabilityExactMatch,
		domain.ScopeComparabilityDeclaredCompatible,
		domain.ScopeComparabilityIncompatible:
		return nil
	default:
		return invalidEnum("scope comparability status", value)
	}
}
func ValidateThresholdState(value domain.ThresholdState) error {
	switch value {
	case domain.ThresholdConcrete, domain.ThresholdToBeCalibrated:
		return nil
	default:
		return invalidEnum("threshold state", value)
	}
}
