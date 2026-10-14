package evidence

import (
	"reflect"
	"testing"

	"marketsignallab/internal/domain"
)

type requirementIdentity struct {
	signalID string
	model    string
	claim    domain.ClaimType
}

func TestInitialRequirementsHaveExactPinnedIdentities(t *testing.T) {
	got := Requirements()
	want := []requirementIdentity{
		{"catalog.directional_breadth.v0.1", "catalog-snapshot-v0.2", domain.ClaimTypeMovement},
		{"catalog.competition_momentum.v0.1", "catalog-snapshot-v0.2", domain.ClaimTypeMovement},
		{"product.peer_relative_rank.v0.1", "product-snapshot-v0.2", domain.ClaimTypePeerRelative},
		{"catalog.peer_relative_rank.v0.1", "catalog-snapshot-v0.2", domain.ClaimTypePeerRelative},
		{"structural.observed_segment_composition.v0.1", "volume-weighted-market-index-v0.1", domain.ClaimTypeComposition},
	}
	if len(got) != len(want) {
		t.Fatalf("requirement count=%d want=%d", len(got), len(want))
	}
	for i, req := range got {
		identity := requirementIdentity{req.SignalID, req.SignalModelVersion, req.ClaimType}
		if identity != want[i] {
			t.Fatalf("requirement[%d]=%+v want=%+v", i, identity, want[i])
		}
	}
}

func TestInitialRequirementsUseExactContractVersionsAndUniqueIdentities(t *testing.T) {
	seen := map[string]struct{}{}
	for _, req := range Requirements() {
		if req.RequirementsVersion != RequirementsVersion ||
			req.StagePolicyVersion != StagePolicyVersion ||
			req.ConfidenceModelVersion != ConfidenceModelVersion {
			t.Fatalf("%s versions=%+v", req.SignalID, req)
		}
		key := req.SignalID + "\x00" + req.SignalModelVersion
		if _, ok := seen[key]; ok {
			t.Fatalf("duplicate requirement identity %s@%s", req.SignalID, req.SignalModelVersion)
		}
		seen[key] = struct{}{}
	}
}

type deterministicRuleExpectation struct {
	dimension string
	value     *float64
	reason    domain.ReasonCode
}

func f64(v float64) *float64 { return &v }

func TestInitialRequirementsEncodeDeterministicMinima(t *testing.T) {
	tests := []struct {
		signalID string
		model    string
		want     []deterministicRuleExpectation
	}{
		{"catalog.directional_breadth.v0.1", "catalog-snapshot-v0.2", []deterministicRuleExpectation{
			{"comparableWindowCount", f64(2), domain.ReasonNoComparableWindow},
			{"comparableProducts", f64(1), domain.ReasonInsufficientObservedProducts},
			{"scopeComparabilityStatus", nil, domain.ReasonUnstableScanScope},
			{"windowDurationComparable", nil, domain.ReasonWindowDurationMismatch},
		}},
		{"catalog.competition_momentum.v0.1", "catalog-snapshot-v0.2", []deterministicRuleExpectation{
			{"comparableWindowCount", f64(2), domain.ReasonNoComparableWindow},
			{"scopeComparabilityStatus", nil, domain.ReasonUnstableScanScope},
			{"windowDurationComparable", nil, domain.ReasonWindowDurationMismatch},
			{"stableMeasureDefinition", nil, domain.ReasonMissingRequiredComponent},
		}},
		{"product.peer_relative_rank.v0.1", "product-snapshot-v0.2", []deterministicRuleExpectation{
			{"peerDefinitionVersion", nil, domain.ReasonIncompatibleModelVersion},
			{"peerGroupSize", f64(2), domain.ReasonSmallPeerGroup},
		}},
		{"catalog.peer_relative_rank.v0.1", "catalog-snapshot-v0.2", []deterministicRuleExpectation{
			{"peerDefinitionVersion", nil, domain.ReasonIncompatibleModelVersion},
			{"peerGroupSize", f64(2), domain.ReasonSmallPeerGroup},
			{"minimumUnderlyingStage", nil, domain.ReasonInsufficientMovementEligibility},
		}},
		{"structural.observed_segment_composition.v0.1", "volume-weighted-market-index-v0.1", []deterministicRuleExpectation{
			{"valuePresent", nil, domain.ReasonMissingRequiredComponent},
			{"sampleSize", f64(1), domain.ReasonInsufficientObservedProducts},
		}},
	}
	for _, tc := range tests {
		req, err := Requirement(tc.signalID, tc.model)
		if err != nil {
			t.Fatalf("%s lookup: %v", tc.signalID, err)
		}
		for _, want := range tc.want {
			rule := findRule(t, req, want.dimension, domain.RuleClassDeterministic)
			if rule.Applicability != domain.RequirementRequired ||
				rule.FailureDisposition != domain.FailureDispositionSuppress ||
				rule.ReasonCode != want.reason {
				t.Fatalf("%s %s rule=%+v", tc.signalID, want.dimension, rule)
			}
			if want.value == nil {
				if rule.Threshold != nil {
					t.Fatalf("%s %s threshold=%+v want nil", tc.signalID, want.dimension, rule.Threshold)
				}
				continue
			}
			if rule.Threshold == nil || rule.Threshold.State != domain.ThresholdConcrete ||
				rule.Threshold.Value == nil || *rule.Threshold.Value != *want.value {
				t.Fatalf("%s %s threshold=%+v want=%v", tc.signalID, want.dimension, rule.Threshold, *want.value)
			}
		}
	}
}

func TestInitialRequirementsDeclareUncalibratedRobustnessThresholds(t *testing.T) {
	wantDimensions := []string{
		"observedProducts",
		"sampleSize",
		"temporalComparabilityRate",
		"movementParticipationRate",
		"observationReliability",
		"queryObservationRate",
		"queryComparabilityRate",
		"surfaceCompletionRate",
		"attributionCoverage",
		"peerGroupSize",
		"comparablePeerShare",
		"peerSpread",
		"tieDensity",
	}
	seen := map[string]bool{}
	for _, req := range Requirements() {
		for _, rule := range req.Rules {
			if rule.Threshold != nil && rule.Threshold.State == domain.ThresholdToBeCalibrated {
				if rule.Threshold.Value != nil {
					t.Fatalf("%s %s TO_BE_CALIBRATED has value=%v", req.SignalID, rule.Dimension, *rule.Threshold.Value)
				}
				if rule.RuleClass != domain.RuleClassFutureCalibrationTarget {
					t.Fatalf("%s %s TBC rule class=%s", req.SignalID, rule.Dimension, rule.RuleClass)
				}
				seen[rule.Dimension] = true
			}
		}
	}
	for _, dimension := range wantDimensions {
		if !seen[dimension] {
			t.Fatalf("preferred robustness threshold %q was silently omitted", dimension)
		}
	}
}

func TestInitialRequirementsContainNoGuessedCalibrationThresholds(t *testing.T) {
	for _, req := range Requirements() {
		for _, rule := range req.Rules {
			if rule.RuleClass != domain.RuleClassDeterministic &&
				rule.Threshold != nil &&
				rule.Threshold.State == domain.ThresholdConcrete {
				t.Fatalf("%s guessed threshold: %+v", req.SignalID, rule)
			}
		}
	}
}

func TestRequirementLookupIsExactAndFailClosed(t *testing.T) {
	req, err := Requirement("product.peer_relative_rank.v0.1", "product-snapshot-v0.2")
	if err != nil {
		t.Fatal(err)
	}
	if req.SignalID != "product.peer_relative_rank.v0.1" || req.SignalModelVersion != "product-snapshot-v0.2" {
		t.Fatalf("lookup=%+v", req)
	}
	for _, tc := range [][2]string{
		{"product.peer_relative_rank.v0.1", "product-snapshot-v0.1"},
		{"product.peer_relative_rank.v0.2", "product-snapshot-v0.2"},
		{"unknown.signal", "catalog-snapshot-v0.2"},
	} {
		if _, err := Requirement(tc[0], tc[1]); err == nil {
			t.Fatalf("unsupported requirement %s@%s was accepted", tc[0], tc[1])
		}
	}
}

func TestPeerDefinitionVersionsArePinned(t *testing.T) {
	got := []string{ProductPRRPeerDefinitionVersion, CatalogPRRPeerDefinitionVersion}
	want := []string{"c1-product-prr-peer/1", "c1-catalog-prr-peer/1"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("peer definition versions=%v want=%v", got, want)
	}
}

func findRule(t *testing.T, req domain.SignalEvidenceRequirement, dimension string, class domain.RuleClass) domain.RequirementRule {
	t.Helper()
	for _, rule := range req.Rules {
		if rule.Dimension == dimension && rule.RuleClass == class {
			return rule
		}
	}
	t.Fatalf("%s missing %s rule class=%s", req.SignalID, dimension, class)
	return domain.RequirementRule{}
}
