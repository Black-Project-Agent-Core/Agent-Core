package evidence

import (
	"reflect"
	"testing"

	"marketsignallab/internal/domain"
)

func TestEvaluateSuppressesMovementWithoutComparableHistory(t *testing.T) {
	req := mustRequirement(t, "catalog.directional_breadth.v0.1", "catalog-snapshot-v0.2")
	legacy := 100.0
	result, err := Evaluate(req, assessmentContext(), EvidenceFacts{
		ComparableWindowCount: intp(0),
		ComparableProducts:    intp(4),
		ScopeComparability:    exactScope(true),
	}, &legacy)
	if err != nil {
		t.Fatal(err)
	}
	if result.Value != nil {
		t.Fatalf("suppressed value=%v want nil", *result.Value)
	}
	if result.Evidence.Eligibility != domain.SignalEligibilitySuppressed {
		t.Fatalf("eligibility=%s", result.Evidence.Eligibility)
	}
	if result.Evidence.EvidenceStage != domain.EvidenceStageCompositionOnly {
		t.Fatalf("stage=%s", result.Evidence.EvidenceStage)
	}
	assertHasReason(t, result, domain.ReasonNoComparableWindow)
	assertHasReason(t, result, domain.ReasonLimitedTemporalDepth)
}

func TestEvaluateSuppressesOneMemberPRRWithoutReturningLegacy50(t *testing.T) {
	req := mustRequirement(t, "product.peer_relative_rank.v0.1", "product-snapshot-v0.2")
	legacy := 50.0
	result, err := Evaluate(req, assessmentContext(), EvidenceFacts{
		PeerDefinitionVersion: strp(ProductPRRPeerDefinitionVersion),
		PeerGroupSize:         intp(1),
	}, &legacy)
	if err != nil {
		t.Fatal(err)
	}
	if result.Value != nil || result.Evidence.Eligibility != domain.SignalEligibilitySuppressed {
		t.Fatalf("result=%+v", result)
	}
	assertHasReason(t, result, domain.ReasonSmallPeerGroup)
}

func TestEvaluateValidCompositionIsEligibleAndRetainsValue(t *testing.T) {
	req := mustRequirement(t, "structural.observed_segment_composition.v0.1", "volume-weighted-market-index-v0.1")
	value := 42.125
	result, err := Evaluate(req, assessmentContext(), EvidenceFacts{
		ValuePresent: boolp(true),
		SampleSize:   intp(1),
	}, &value)
	if err != nil {
		t.Fatal(err)
	}
	if result.Value == nil || *result.Value != value {
		t.Fatalf("value=%v want=%v", result.Value, value)
	}
	if result.Evidence.Eligibility != domain.SignalEligibilityEligible {
		t.Fatalf("eligibility=%s", result.Evidence.Eligibility)
	}
	if result.Evidence.EvidenceStage != domain.EvidenceStageCompositionOnly {
		t.Fatalf("stage=%s", result.Evidence.EvidenceStage)
	}
	if len(result.Evidence.ReasonCodes) != 0 {
		t.Fatalf("reasons=%v", result.Evidence.ReasonCodes)
	}
	if result.Evidence.Confidence.Score != nil ||
		result.Evidence.Confidence.Band != domain.ConfidenceBandUncalibrated ||
		result.Evidence.Confidence.ModelVersion != ConfidenceModelVersion {
		t.Fatalf("confidence=%+v", result.Evidence.Confidence)
	}
}

func TestEvaluateSyntheticDeterministicDegradeRetainsValue(t *testing.T) {
	req := mustRequirement(t, "structural.observed_segment_composition.v0.1", "volume-weighted-market-index-v0.1")
	req.Rules = []domain.RequirementRule{{
		Dimension:          "observedProducts",
		Applicability:      domain.RequirementRequired,
		RuleClass:          domain.RuleClassDeterministic,
		Threshold:          concrete(10),
		FailureDisposition: domain.FailureDispositionDegrade,
		ReasonCode:         domain.ReasonInsufficientObservedProducts,
	}}
	value := 31.5
	result, err := Evaluate(req, assessmentContext(), EvidenceFacts{ObservedProducts: intp(3)}, &value)
	if err != nil {
		t.Fatal(err)
	}
	if result.Value == nil || *result.Value != value {
		t.Fatalf("value=%v want=%v", result.Value, value)
	}
	if result.Evidence.Eligibility != domain.SignalEligibilityDegraded {
		t.Fatalf("eligibility=%s", result.Evidence.Eligibility)
	}
	assertHasReason(t, result, domain.ReasonInsufficientObservedProducts)
}

func TestEvaluateDoesNotNumericallyExecuteToBeCalibratedRules(t *testing.T) {
	req := mustRequirement(t, "catalog.directional_breadth.v0.1", "catalog-snapshot-v0.2")
	value := 67.25
	zero := 0.0
	result, err := Evaluate(req, assessmentContext(), EvidenceFacts{
		ComparableWindowCount:     intp(2),
		ComparableProducts:        intp(3),
		ObservedProducts:          intp(0),
		TemporalComparabilityRate: &zero,
		MovementParticipationRate: &zero,
		ObservationReliability:    &zero,
		QueryObservationRate:      &zero,
		QueryComparabilityRate:    &zero,
		SurfaceCompletionRate:     &zero,
		AttributionCoverage:       &zero,
		ScopeComparability:        exactScope(true),
	}, &value)
	if err != nil {
		t.Fatal(err)
	}
	if result.Evidence.Eligibility != domain.SignalEligibilityEligible {
		t.Fatalf("eligibility=%s reasons=%v", result.Evidence.Eligibility, result.Evidence.ReasonCodes)
	}
	if result.Evidence.EvidenceStage != domain.EvidenceStageMovementIndication {
		t.Fatalf("stage=%s", result.Evidence.EvidenceStage)
	}
	if len(result.Evidence.ReasonCodes) != 0 {
		t.Fatalf("TO_BE_CALIBRATED generated reasons=%v", result.Evidence.ReasonCodes)
	}
}

func TestEvaluateRejectsUnknownRequirementIdentityAndVersions(t *testing.T) {
	known := mustRequirement(t, "product.peer_relative_rank.v0.1", "product-snapshot-v0.2")
	cases := []domain.SignalEvidenceRequirement{
		{SignalID: "unknown.signal", SignalModelVersion: "product-snapshot-v0.2", ClaimType: domain.ClaimTypePeerRelative, RequirementsVersion: RequirementsVersion, StagePolicyVersion: StagePolicyVersion, ConfidenceModelVersion: ConfidenceModelVersion},
		func() domain.SignalEvidenceRequirement {
			out := known
			out.SignalModelVersion = "product-snapshot-v0.1"
			return out
		}(),
		func() domain.SignalEvidenceRequirement {
			out := known
			out.RequirementsVersion = "msl-evidence-requirements/unknown"
			return out
		}(),
		func() domain.SignalEvidenceRequirement {
			out := known
			out.StagePolicyVersion = "msl-evidence-stage/unknown"
			return out
		}(),
		func() domain.SignalEvidenceRequirement {
			out := known
			out.ConfidenceModelVersion = "msl-evidence-confidence/unknown"
			return out
		}(),
		func() domain.SignalEvidenceRequirement {
			out := known
			out.ClaimType = domain.ClaimTypeMovement
			return out
		}(),
	}
	for i, req := range cases {
		if _, err := Evaluate(req, assessmentContext(), EvidenceFacts{}, nil); err == nil {
			t.Fatalf("case %d accepted unsupported requirement %+v", i, req)
		}
	}
}

func TestEvaluateMissingRequiredFactSuppressesWithMissingRequiredComponent(t *testing.T) {
	req := mustRequirement(t, "product.peer_relative_rank.v0.1", "product-snapshot-v0.2")
	value := 88.0
	result, err := Evaluate(req, assessmentContext(), EvidenceFacts{PeerGroupSize: intp(2)}, &value)
	if err != nil {
		t.Fatal(err)
	}
	if result.Evidence.Eligibility != domain.SignalEligibilitySuppressed || result.Value != nil {
		t.Fatalf("result=%+v", result)
	}
	assertHasReason(t, result, domain.ReasonMissingRequiredComponent)
	if hasReason(result, domain.ReasonIncompatibleModelVersion) {
		t.Fatalf("missing fact was misreported as incompatible: %v", result.Evidence.ReasonCodes)
	}
}

func TestEvaluateConcreteZeroIsNotTreatedAsMissing(t *testing.T) {
	req := mustRequirement(t, "product.peer_relative_rank.v0.1", "product-snapshot-v0.2")
	value := 50.0
	result, err := Evaluate(req, assessmentContext(), EvidenceFacts{
		PeerDefinitionVersion: strp(ProductPRRPeerDefinitionVersion),
		PeerGroupSize:         intp(0),
	}, &value)
	if err != nil {
		t.Fatal(err)
	}
	assertHasReason(t, result, domain.ReasonSmallPeerGroup)
	if hasReason(result, domain.ReasonMissingRequiredComponent) {
		t.Fatalf("concrete zero treated as missing: %v", result.Evidence.ReasonCodes)
	}
}

func TestEvaluateReasonsAreDeduplicatedAndSorted(t *testing.T) {
	req := mustRequirement(t, "structural.observed_segment_composition.v0.1", "volume-weighted-market-index-v0.1")
	req.Rules = []domain.RequirementRule{
		{Dimension: "comparableProducts", Applicability: domain.RequirementRequired, RuleClass: domain.RuleClassDeterministic, Threshold: concrete(2), FailureDisposition: domain.FailureDispositionDegrade, ReasonCode: domain.ReasonInsufficientObservedProducts},
		{Dimension: "observedProducts", Applicability: domain.RequirementRequired, RuleClass: domain.RuleClassDeterministic, Threshold: concrete(2), FailureDisposition: domain.FailureDispositionDegrade, ReasonCode: domain.ReasonInsufficientObservedProducts},
		{Dimension: "stableMeasureDefinition", Applicability: domain.RequirementRequired, RuleClass: domain.RuleClassDeterministic, FailureDisposition: domain.FailureDispositionDegrade, ReasonCode: domain.ReasonNoComparableWindow},
	}
	value := 9.0
	result, err := Evaluate(req, assessmentContext(), EvidenceFacts{
		ComparableProducts:      intp(0),
		ObservedProducts:        intp(0),
		StableMeasureDefinition: boolp(false),
	}, &value)
	if err != nil {
		t.Fatal(err)
	}
	want := []domain.ReasonCode{domain.ReasonInsufficientObservedProducts, domain.ReasonNoComparableWindow}
	if !reflect.DeepEqual(result.Evidence.ReasonCodes, want) {
		t.Fatalf("reasons=%v want=%v", result.Evidence.ReasonCodes, want)
	}
}

func TestEvaluateCatalogPRRRequiresMovementEligibleUnderlyingStage(t *testing.T) {
	req := mustRequirement(t, "catalog.peer_relative_rank.v0.1", "catalog-snapshot-v0.2")
	value := 73.0
	result, err := Evaluate(req, assessmentContext(), EvidenceFacts{
		PeerDefinitionVersion: strp(CatalogPRRPeerDefinitionVersion),
		PeerGroupSize:         intp(4),
		UnderlyingStage:       stagep(domain.EvidenceStageCompositionOnly),
	}, &value)
	if err != nil {
		t.Fatal(err)
	}
	if result.Value != nil || result.Evidence.Eligibility != domain.SignalEligibilitySuppressed {
		t.Fatalf("result=%+v", result)
	}
	assertHasReason(t, result, domain.ReasonInsufficientMovementEligibility)
}

func TestEvaluateAssessmentCopiesContextFactsAndUsesUncalibratedConfidence(t *testing.T) {
	req := mustRequirement(t, "catalog.directional_breadth.v0.1", "catalog-snapshot-v0.2")
	ctx := assessmentContext()
	value := 61.0
	result, err := Evaluate(req, ctx, EvidenceFacts{
		ComparableWindowCount: intp(2),
		ComparableProducts:    intp(7),
		ObservedProducts:      intp(9),
		ScopeComparability:    exactScope(true),
	}, &value)
	if err != nil {
		t.Fatal(err)
	}
	e := result.Evidence
	if e.AssessmentID != ctx.AssessmentID || e.EntityType != ctx.EntityType || e.EntityID != ctx.EntityID || e.RunID != ctx.RunID || e.ProvenanceID != ctx.ProvenanceID || e.AssessedAt != ctx.AssessedAt {
		t.Fatalf("context not copied: evidence=%+v ctx=%+v", e, ctx)
	}
	if e.ComparableWindowCount == nil || *e.ComparableWindowCount != 2 || e.ComparableProducts == nil || *e.ComparableProducts != 7 || e.ObservedProducts == nil || *e.ObservedProducts != 9 {
		t.Fatalf("facts not copied: %+v", e)
	}
	if e.ScopeComparability == nil || e.ScopeComparability.Status != domain.ScopeComparabilityExactMatch {
		t.Fatalf("scope=%+v", e.ScopeComparability)
	}
	if e.Confidence.Score != nil || e.Confidence.Band != domain.ConfidenceBandUncalibrated || e.Confidence.ModelVersion != ConfidenceModelVersion {
		t.Fatalf("confidence=%+v", e.Confidence)
	}
}

func mustRequirement(t *testing.T, signalID, model string) domain.SignalEvidenceRequirement {
	t.Helper()
	req, err := Requirement(signalID, model)
	if err != nil {
		t.Fatal(err)
	}
	return req
}

func assessmentContext() AssessmentContext {
	return AssessmentContext{
		AssessmentID: "assessment-1",
		EntityType:   "catalog",
		EntityID:     "entity-1",
		RunID:        "run-1",
		ProvenanceID: "provenance-1",
		AssessedAt:   "2026-08-26T03:00:00+07:00",
	}
}

func exactScope(windowComparable bool) *domain.ScopeComparabilityResult {
	return &domain.ScopeComparabilityResult{
		Status:                   domain.ScopeComparabilityExactMatch,
		WindowDurationComparable: boolp(windowComparable),
	}
}

func intp(v int) *int                                     { return &v }
func strp(v string) *string                               { return &v }
func boolp(v bool) *bool                                  { return &v }
func stagep(v domain.EvidenceStage) *domain.EvidenceStage { return &v }

func assertHasReason(t *testing.T, result domain.SignalResult, reason domain.ReasonCode) {
	t.Helper()
	if !hasReason(result, reason) {
		t.Fatalf("reason %s missing from %v", reason, result.Evidence.ReasonCodes)
	}
}

func hasReason(result domain.SignalResult, reason domain.ReasonCode) bool {
	for _, got := range result.Evidence.ReasonCodes {
		if got == reason {
			return true
		}
	}
	return false
}
