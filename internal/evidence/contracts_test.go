package evidence

import (
	"reflect"
	"testing"

	"marketsignallab/internal/domain"
)

func TestContractVersionsAreExact(t *testing.T) {
	if ContractVersion != "msl-evidence-contract/1" {
		t.Fatalf("ContractVersion=%q", ContractVersion)
	}
	if RequirementsVersion != "msl-evidence-requirements/1" {
		t.Fatalf("RequirementsVersion=%q", RequirementsVersion)
	}
	if StagePolicyVersion != "msl-evidence-stage/c3.0-1" {
		t.Fatalf("StagePolicyVersion=%q", StagePolicyVersion)
	}
	if ConfidenceModelVersion != "msl-evidence-confidence/uncalibrated-1" {
		t.Fatalf("ConfidenceModelVersion=%q", ConfidenceModelVersion)
	}
}

func TestContractVersionValidatorsRejectUnknownValues(t *testing.T) {
	checks := []func(string) error{ValidateContractVersion, ValidateRequirementsVersion, ValidateStagePolicyVersion, ValidateConfidenceModelVersion}
	for _, check := range checks {
		if err := check("unknown/version"); err == nil {
			t.Fatal("unknown version was accepted")
		}
	}
}
func TestCoreEvidenceEnumsAreExact(t *testing.T) {
	got := []string{
		string(domain.EvidenceStageCompositionOnly), string(domain.EvidenceStageMovementIndication),
		string(domain.EvidenceStagePreliminaryTrend), string(domain.EvidenceStageEstablishedTrend),
		string(domain.EvidenceStageSeasonalityCandidate),
		string(domain.SignalEligibilityEligible), string(domain.SignalEligibilityDegraded), string(domain.SignalEligibilitySuppressed),
		string(domain.RuleClassDeterministic), string(domain.RuleClassConfigurableThreshold), string(domain.RuleClassFutureCalibrationTarget),
		string(domain.RequirementRequired), string(domain.RequirementRecommended), string(domain.RequirementNotApplicable),
		string(domain.FailureDispositionInfo), string(domain.FailureDispositionDegrade), string(domain.FailureDispositionSuppress),
		string(domain.ScopeComparabilityNotApplicable), string(domain.ScopeComparabilityExactMatch), string(domain.ScopeComparabilityDeclaredCompatible), string(domain.ScopeComparabilityIncompatible),
	}
	want := []string{
		"COMPOSITION_ONLY", "MOVEMENT_INDICATION", "PRELIMINARY_TREND", "ESTABLISHED_TREND", "SEASONALITY_CANDIDATE",
		"ELIGIBLE", "DEGRADED", "SUPPRESSED",
		"DETERMINISTIC_PRODUCTION_RULE", "CONFIGURABLE_THRESHOLD", "FUTURE_CALIBRATION_TARGET",
		"REQUIRED", "RECOMMENDED", "NOT_APPLICABLE", "INFO", "DEGRADE", "SUPPRESS",
		"NOT_APPLICABLE", "EXACT_MATCH", "DECLARED_COMPATIBLE", "INCOMPATIBLE",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("enum strings mismatch\ngot=%v\nwant=%v", got, want)
	}
}

func TestClaimAndThresholdEnumsAreExact(t *testing.T) {
	got := []string{
		string(domain.ClaimTypeComposition), string(domain.ClaimTypeMovement), string(domain.ClaimTypePeerRelative),
		string(domain.ThresholdConcrete), string(domain.ThresholdToBeCalibrated), string(domain.ConfidenceBandUncalibrated),
	}
	want := []string{"composition", "movement", "peer_relative", "CONCRETE", "TO_BE_CALIBRATED", "UNCALIBRATED"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("claim/threshold strings mismatch: got=%v want=%v", got, want)
	}
}

func TestUncalibratedConfidenceIsNull(t *testing.T) {
	got := UncalibratedConfidence()
	if got.Score != nil || got.Band != domain.ConfidenceBandUncalibrated || got.ModelVersion != ConfidenceModelVersion {
		t.Fatalf("confidence=%+v", got)
	}
}

func TestReasonCodeRegistryIsExact(t *testing.T) {
	want := []domain.ReasonCode{
		"LIMITED_TEMPORAL_DEPTH", "NO_COMPARABLE_WINDOW", "WINDOW_DURATION_MISMATCH",
		"UNSTABLE_SCAN_SCOPE", "SAMPLING_POLICY_CHANGED", "SOURCE_POLICY_CHANGED",
		"INCOMPATIBLE_MODEL_VERSION", "INSUFFICIENT_OBSERVED_PRODUCTS",
		"LOW_TEMPORAL_COMPARABILITY", "LOW_PARTICIPATION", "LOW_OBSERVATION_RELIABILITY",
		"LOW_QUERY_OBSERVATION", "LOW_QUERY_COMPARABILITY", "INCOMPLETE_SURFACE_COVERAGE",
		"LOW_ATTRIBUTION_COVERAGE", "NO_ATTRIBUTED_PRODUCTS",
		"SMALL_PEER_GROUP", "LOW_PEER_COMPARABILITY", "LOW_PEER_SPREAD", "HIGH_TIE_DENSITY",
		"INSUFFICIENT_MOVEMENT_ELIGIBILITY", "CAP_RELAXED_FOR_SMALL_PEER_SET",
		"ZERO_BASELINE_DELTA", "MISSING_REQUIRED_COMPONENT",
	}
	if got := ReasonCodes(); !reflect.DeepEqual(got, want) {
		t.Fatalf("reason registry mismatch\ngot=%v\nwant=%v", got, want)
	}
	for _, code := range want {
		if !IsKnownReasonCode(code) {
			t.Fatalf("known reason rejected: %s", code)
		}
	}
	if IsKnownReasonCode("INVENTED_CAUSAL_STORY") {
		t.Fatal("unknown reason code was accepted")
	}
}

func TestEnumValidatorsRejectUnknownValues(t *testing.T) {
	checks := []error{
		ValidateEvidenceStage(domain.EvidenceStage("UNKNOWN")),
		ValidateSignalEligibility(domain.SignalEligibility("UNKNOWN")),
		ValidateClaimType(domain.ClaimType("unknown")),
		ValidateRuleClass(domain.RuleClass("UNKNOWN")),
		ValidateRequirementApplicability(domain.RequirementApplicability("UNKNOWN")),
		ValidateFailureDisposition(domain.FailureDisposition("UNKNOWN")),
		ValidateScopeComparabilityStatus(domain.ScopeComparabilityStatus("UNKNOWN")),
		ValidateThresholdState(domain.ThresholdState("UNKNOWN")),
	}
	for i, err := range checks {
		if err == nil {
			t.Fatalf("validator %d accepted unknown value", i)
		}
	}
}

func TestAssessmentIDIsStableAndChangesWithIdentityTuple(t *testing.T) {
	base := []string{"run-1", "catalog", "catalog-1", "signal-a", "model-1", RequirementsVersion}
	got := AssessmentID(base[0], base[1], base[2], base[3], base[4], base[5])
	if got != AssessmentID(base[0], base[1], base[2], base[3], base[4], base[5]) {
		t.Fatalf("same identity tuple changed assessment ID: %q", got)
	}
	if len(got) != len("eva_")+24 || got[:4] != "eva_" {
		t.Fatalf("unexpected assessment ID shape: %q", got)
	}
	for i := range base {
		changed := append([]string(nil), base...)
		changed[i] += "-changed"
		if other := AssessmentID(changed[0], changed[1], changed[2], changed[3], changed[4], changed[5]); other == got {
			t.Fatalf("identity field %d did not affect assessment ID", i)
		}
	}
}
