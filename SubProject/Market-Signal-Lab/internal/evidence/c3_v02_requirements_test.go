package evidence

import (
	"testing"

	"marketsignallab/internal/domain"
)

func TestC31RequirementsVersionRegistryIsAdditive(t *testing.T) {
	v1 := Requirements()
	if len(v1) != 5 {
		t.Fatalf("v1 len=%d want=5", len(v1))
	}
	for _, req := range v1 {
		if req.RequirementsVersion != RequirementsVersion || req.StagePolicyVersion != StagePolicyVersion {
			t.Fatalf("v1 changed: %+v", req)
		}
	}
	v2, err := RequirementsForVersion(RequirementsVersionC31)
	if err != nil {
		t.Fatal(err)
	}
	if len(v2) != 9 {
		t.Fatalf("v2 len=%d want=9", len(v2))
	}
	for _, req := range v2 {
		if req.RequirementsVersion != RequirementsVersionC31 || req.StagePolicyVersion != StagePolicyVersionC31 || req.ConfidenceModelVersion != ConfidenceModelVersion {
			t.Fatalf("v2 identity mismatch: %+v", req)
		}
	}
	if err := ValidateRequirementsVersion(RequirementsVersion); err != nil {
		t.Fatal(err)
	}
	if err := ValidateRequirementsVersion(RequirementsVersionC31); err != nil {
		t.Fatal(err)
	}
	if err := ValidateStagePolicyVersion(StagePolicyVersion); err != nil {
		t.Fatal(err)
	}
	if err := ValidateStagePolicyVersion(StagePolicyVersionC31); err != nil {
		t.Fatal(err)
	}
}

func TestC31RequirementsTruthTable(t *testing.T) {
	accel := mustRequirementVersion(t, RequirementsVersionC31, "catalog.competition_acceleration.v0.2", CompetitionAccelerationModelV02)
	assertConcreteMinimum(t, accel, "comparableWindowCount", 3)
	assertRequiredPredicate(t, accel, "scopeComparabilityStatus")
	assertRequiredPredicate(t, accel, "windowDurationComparable")
	assertRequiredPredicate(t, accel, "stableMeasureDefinition")

	odmi := mustRequirementVersion(t, RequirementsVersionC31, "catalog.odmi.v0.2", DirectionalMomentumModelV02)
	assertConcreteMinimum(t, odmi, "comparableWindowCount", 2)
	assertConcreteMinimum(t, odmi, "comparableProducts", 1)

	magnitude := mustRequirementVersion(t, RequirementsVersionC31, "catalog.momentum_magnitude.v0.2", DirectionalMomentumModelV02)
	assertConcreteMinimum(t, magnitude, "comparableWindowCount", 2)

	prr := mustRequirementVersion(t, RequirementsVersionC31, "catalog.peer_relative_rank_odmi.v0.2", PeerRelativeRankModelV02)
	assertRequiredPredicate(t, prr, "peerDefinitionVersion")
	assertConcreteMinimum(t, prr, "peerGroupSize", 2)
	assertRequiredPredicate(t, prr, "minimumUnderlyingStage")

	author := mustRequirementVersion(t, RequirementsVersionC31, "catalog.author_concentration_change.v0.2", AuthorConcentrationChangeModelV02)
	assertConcreteMinimum(t, author, "comparableWindowCount", 2)
	assertRequiredPredicate(t, author, "attributionPresent")
	assertRequiredPredicate(t, author, "stableMeasureDefinition")

	weighted := mustRequirementVersion(t, RequirementsVersionC31, "structural.product_mass_weighted_movement.v0.2", MovementDivergenceModelV02)
	assertConcreteMinimum(t, weighted, "eligibleChildCount", 1)
	equal := mustRequirementVersion(t, RequirementsVersionC31, "structural.equal_segment_movement.v0.2", MovementDivergenceModelV02)
	assertConcreteMinimum(t, equal, "eligibleChildCount", 1)
	signed := mustRequirementVersion(t, RequirementsVersionC31, "structural.signed_movement_divergence.v0.2", MovementDivergenceModelV02)
	assertConcreteMinimum(t, signed, "eligibleChildCount", 2)
	divMag := mustRequirementVersion(t, RequirementsVersionC31, "structural.divergence_magnitude.v0.2", MovementDivergenceModelV02)
	assertConcreteMinimum(t, divMag, "eligibleChildCount", 2)

	for _, req := range append([]domain.SignalEvidenceRequirement{}, accel, odmi, magnitude, prr, author, weighted, equal, signed, divMag) {
		for _, rule := range req.Rules {
			if rule.RuleClass == domain.RuleClassFutureCalibrationTarget {
				if rule.Threshold == nil || rule.Threshold.State != domain.ThresholdToBeCalibrated || rule.Threshold.Value != nil {
					t.Fatalf("future calibration rule executed/filled: %+v", rule)
				}
			}
		}
	}
}

func TestC31EvaluateAccelerationRequiresThreeComparableWindows(t *testing.T) {
	req := mustRequirementVersion(t, RequirementsVersionC31, "catalog.competition_acceleration.v0.2", CompetitionAccelerationModelV02)
	value := 15.0
	compatible := domain.ScopeComparabilityResult{Status: domain.ScopeComparabilityExactMatch, WindowDurationComparable: boolp(true)}
	stable := true
	for _, tc := range []struct {
		windows      int
		eligibility  domain.SignalEligibility
		valuePresent bool
	}{
		{2, domain.SignalEligibilitySuppressed, false},
		{3, domain.SignalEligibilityEligible, true},
	} {
		present := true
		got, err := Evaluate(req, AssessmentContext{AssessmentID: "eva", EntityType: "catalog", EntityID: "c", RunID: "r"}, EvidenceFacts{
			ComparableWindowCount: intp(tc.windows), ScopeComparability: &compatible, StableMeasureDefinition: &stable, ValuePresent: &present,
		}, &value)
		if err != nil {
			t.Fatal(err)
		}
		if got.Evidence.Eligibility != tc.eligibility {
			t.Fatalf("windows=%d eligibility=%s", tc.windows, got.Evidence.Eligibility)
		}
		if (got.Value != nil) != tc.valuePresent {
			t.Fatalf("windows=%d value=%v", tc.windows, got.Value)
		}
		if got.Evidence.EvidenceStage != domain.EvidenceStageMovementIndication && tc.windows >= 3 {
			t.Fatalf("stage=%s", got.Evidence.EvidenceStage)
		}
	}
}

func TestC31EvaluatePRRRequiresODMIPeerDefinition(t *testing.T) {
	req := mustRequirementVersion(t, RequirementsVersionC31, "catalog.peer_relative_rank_odmi.v0.2", PeerRelativeRankModelV02)
	value := 75.0
	peer := CatalogODMIPeerDefinitionVersion
	stage := domain.EvidenceStageMovementIndication
	present := true
	got, err := Evaluate(req, AssessmentContext{AssessmentID: "eva", EntityType: "catalog", EntityID: "c", RunID: "r"}, EvidenceFacts{
		PeerDefinitionVersion: &peer, PeerGroupSize: intp(3), UnderlyingStage: &stage, ValuePresent: &present,
	}, &value)
	if err != nil {
		t.Fatal(err)
	}
	if got.Evidence.Eligibility != domain.SignalEligibilityEligible || got.Value == nil {
		t.Fatalf("got=%+v", got)
	}
	wrong := "c1-catalog-prr-peer/1"
	got, err = Evaluate(req, AssessmentContext{AssessmentID: "eva2", EntityType: "catalog", EntityID: "c", RunID: "r"}, EvidenceFacts{
		PeerDefinitionVersion: &wrong, PeerGroupSize: intp(3), UnderlyingStage: &stage,
	}, &value)
	if err != nil {
		t.Fatal(err)
	}
	if got.Evidence.Eligibility != domain.SignalEligibilitySuppressed || got.Value != nil {
		t.Fatalf("wrong peer got=%+v", got)
	}
}

func mustRequirementVersion(t *testing.T, version, signalID, model string) domain.SignalEvidenceRequirement {
	t.Helper()
	req, err := RequirementForVersion(version, signalID, model)
	if err != nil {
		t.Fatal(err)
	}
	return req
}

func assertConcreteMinimum(t *testing.T, req domain.SignalEvidenceRequirement, dimension string, want float64) {
	t.Helper()
	for _, rule := range req.Rules {
		if rule.Dimension == dimension && rule.RuleClass == domain.RuleClassDeterministic {
			if rule.Threshold == nil || rule.Threshold.State != domain.ThresholdConcrete || rule.Threshold.Value == nil || *rule.Threshold.Value != want {
				t.Fatalf("%s rule=%+v", dimension, rule)
			}
			return
		}
	}
	t.Fatalf("missing deterministic minimum %s in %s", dimension, req.SignalID)
}

func assertRequiredPredicate(t *testing.T, req domain.SignalEvidenceRequirement, dimension string) {
	t.Helper()
	for _, rule := range req.Rules {
		if rule.Dimension == dimension && rule.RuleClass == domain.RuleClassDeterministic && rule.Applicability == domain.RequirementRequired && rule.Threshold == nil {
			return
		}
	}
	t.Fatalf("missing required predicate %s in %s", dimension, req.SignalID)
}
