package evidence

import (
	"testing"
	"time"

	"marketsignallab/internal/domain"
)

func TestCompareScopeNoTemporalComparisonIsNotApplicable(t *testing.T) {
	current := scopeDescriptor("run-current", "scope-a")
	current.TemporalComparison = false
	prior := scopeDescriptor("run-prior", "scope-b")

	got := CompareScope(current, prior, nil)
	if got.Status != domain.ScopeComparabilityNotApplicable {
		t.Fatalf("status=%s", got.Status)
	}
	if got.CurrentRunID != "run-current" || got.PriorRunID != "run-prior" {
		t.Fatalf("run ids=%+v", got)
	}
}

func TestCompareScopeSameNonEmptyCompatibilityKeyIsExactMatch(t *testing.T) {
	current := scopeDescriptor("run-current", "scope-a")
	prior := scopeDescriptor("run-prior", "scope-a")

	got := CompareScope(current, prior, nil)
	if got.Status != domain.ScopeComparabilityExactMatch {
		t.Fatalf("status=%s", got.Status)
	}
}

func TestCompareScopeInjectedVersionedDeclarationIsDeclaredCompatible(t *testing.T) {
	current := scopeDescriptor("run-current", "scope-new")
	prior := scopeDescriptor("run-prior", "scope-old")
	declarations := []ScopeCompatibilityDeclaration{{
		Version:                 "synthetic-scope-compat/1",
		CurrentCompatibilityKey: "scope-new",
		PriorCompatibilityKey:   "scope-old",
	}}

	got := CompareScope(current, prior, declarations)
	if got.Status != domain.ScopeComparabilityDeclaredCompatible {
		t.Fatalf("status=%s", got.Status)
	}
}

func TestCompareScopeUnversionedDeclarationIsIgnored(t *testing.T) {
	current := scopeDescriptor("run-current", "scope-new")
	prior := scopeDescriptor("run-prior", "scope-old")
	declarations := []ScopeCompatibilityDeclaration{{
		CurrentCompatibilityKey: "scope-new",
		PriorCompatibilityKey:   "scope-old",
	}}

	got := CompareScope(current, prior, declarations)
	if got.Status != domain.ScopeComparabilityIncompatible {
		t.Fatalf("status=%s", got.Status)
	}
}

func TestCompareScopeDifferentKeyWithoutDeclarationIsIncompatible(t *testing.T) {
	current := scopeDescriptor("run-current", "scope-a")
	prior := scopeDescriptor("run-prior", "scope-b")

	got := CompareScope(current, prior, nil)
	if got.Status != domain.ScopeComparabilityIncompatible {
		t.Fatalf("status=%s", got.Status)
	}
}

func TestCompareScopeUnknownDetailFactsStayNil(t *testing.T) {
	current := scopeDescriptor("run-current", "scope-a")
	prior := scopeDescriptor("run-prior", "scope-a")

	got := CompareScope(current, prior, nil)
	flags := []*bool{
		got.PlannerComparable,
		got.SamplingSchemaComparable,
		got.TaxonomyComparable,
		got.WeightingComparable,
		got.SourcePolicyComparable,
		got.WindowDurationComparable,
		got.QueryUniverseComparable,
		got.SurfaceUniverseComparable,
	}
	for i, flag := range flags {
		if flag != nil {
			t.Fatalf("detail flag %d defaulted to %v", i, *flag)
		}
	}
}

func TestCompareScopeKnownFactsAreComparedIndependently(t *testing.T) {
	current := scopeDescriptor("run-current", "scope-a")
	prior := scopeDescriptor("run-prior", "scope-a")
	current.Plan.PlannerVersion = "planner/2"
	prior.Plan.PlannerVersion = "planner/1"
	current.Run.SamplingSchemaVersion = "sampling/1"
	prior.Run.SamplingSchemaVersion = "sampling/1"
	current.Run.TaxonomyVersion = "taxonomy/2"
	prior.Run.TaxonomyVersion = "taxonomy/1"
	current.Run.IndexWeightingVersion = "weights/1"
	prior.Run.IndexWeightingVersion = "weights/1"
	current.SourcePolicyVersion = "source/1"
	prior.SourcePolicyVersion = "source/1"
	current.WindowDuration = 24 * time.Hour
	prior.WindowDuration = 24 * time.Hour
	current.QueryUniverseFingerprint = "queries/a"
	prior.QueryUniverseFingerprint = "queries/b"
	current.SurfaceUniverseFingerprint = "surfaces/a"
	prior.SurfaceUniverseFingerprint = "surfaces/a"

	got := CompareScope(current, prior, nil)
	assertBool(t, "planner", got.PlannerComparable, false)
	assertBool(t, "sampling", got.SamplingSchemaComparable, true)
	assertBool(t, "taxonomy", got.TaxonomyComparable, false)
	assertBool(t, "weighting", got.WeightingComparable, true)
	assertBool(t, "source policy", got.SourcePolicyComparable, true)
	assertBool(t, "window duration", got.WindowDurationComparable, true)
	assertBool(t, "query universe", got.QueryUniverseComparable, false)
	assertBool(t, "surface universe", got.SurfaceUniverseComparable, true)
}

func TestCompareScopeExactKeyDoesNotHideWindowDurationMismatch(t *testing.T) {
	current := scopeDescriptor("run-current", "scope-a")
	prior := scopeDescriptor("run-prior", "scope-a")
	current.WindowDuration = 24 * time.Hour
	prior.WindowDuration = 48 * time.Hour

	got := CompareScope(current, prior, nil)
	if got.Status != domain.ScopeComparabilityExactMatch {
		t.Fatalf("status=%s", got.Status)
	}
	assertBool(t, "window duration", got.WindowDurationComparable, false)
}

func TestCompareScopeProductionDeclarationRegistryStartsEmpty(t *testing.T) {
	if got := ProductionScopeCompatibilityDeclarations(); len(got) != 0 {
		t.Fatalf("production declarations=%+v", got)
	}
}

func scopeDescriptor(runID, compatibilityKey string) ScopeDescriptor {
	return ScopeDescriptor{
		TemporalComparison: true,
		Run: domain.MarketMapRun{
			ID:               runID,
			CompatibilityKey: compatibilityKey,
		},
	}
}

func assertBool(t *testing.T, name string, got *bool, want bool) {
	t.Helper()
	if got == nil || *got != want {
		t.Fatalf("%s=%v want=%v", name, got, want)
	}
}
