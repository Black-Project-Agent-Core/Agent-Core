package evidence

import (
	"strings"
	"time"

	"marketsignallab/internal/domain"
)

type ScopeDescriptor struct {
	TemporalComparison         bool
	Run                        domain.MarketMapRun
	Plan                       domain.MarketMapPlan
	WindowDuration             time.Duration
	SourcePolicyVersion        string
	QueryUniverseFingerprint   string
	SurfaceUniverseFingerprint string
}

type ScopeCompatibilityDeclaration struct {
	Version                 string
	CurrentCompatibilityKey string
	PriorCompatibilityKey   string
}

var productionScopeCompatibilityDeclarations = []ScopeCompatibilityDeclaration{}

func ProductionScopeCompatibilityDeclarations() []ScopeCompatibilityDeclaration {
	out := make([]ScopeCompatibilityDeclaration, len(productionScopeCompatibilityDeclarations))
	copy(out, productionScopeCompatibilityDeclarations)
	return out
}

func CompareScope(current, prior ScopeDescriptor, declarations []ScopeCompatibilityDeclaration) domain.ScopeComparabilityResult {
	out := compareFacts(current, prior)
	currentKey := strings.TrimSpace(current.Run.CompatibilityKey)
	priorKey := strings.TrimSpace(prior.Run.CompatibilityKey)

	switch {
	case !current.TemporalComparison:
		out.Status = domain.ScopeComparabilityNotApplicable
	case currentKey != "" && currentKey == priorKey:
		out.Status = domain.ScopeComparabilityExactMatch
	case declaredCompatible(currentKey, priorKey, declarations):
		out.Status = domain.ScopeComparabilityDeclaredCompatible
	default:
		out.Status = domain.ScopeComparabilityIncompatible
	}
	return out
}

func compareFacts(current, prior ScopeDescriptor) domain.ScopeComparabilityResult {
	return domain.ScopeComparabilityResult{
		CurrentRunID:              current.Run.ID,
		PriorRunID:                prior.Run.ID,
		PlannerComparable:         compareKnownString(current.Plan.PlannerVersion, prior.Plan.PlannerVersion),
		SamplingSchemaComparable:  compareKnownString(samplingVersion(current), samplingVersion(prior)),
		TaxonomyComparable:        compareKnownString(taxonomyVersion(current), taxonomyVersion(prior)),
		WeightingComparable:       compareKnownString(weightingVersion(current), weightingVersion(prior)),
		SourcePolicyComparable:    compareKnownString(current.SourcePolicyVersion, prior.SourcePolicyVersion),
		WindowDurationComparable:  compareKnownDuration(current.WindowDuration, prior.WindowDuration),
		QueryUniverseComparable:   compareKnownString(current.QueryUniverseFingerprint, prior.QueryUniverseFingerprint),
		SurfaceUniverseComparable: compareKnownString(current.SurfaceUniverseFingerprint, prior.SurfaceUniverseFingerprint),
	}
}

func declaredCompatible(currentKey, priorKey string, declarations []ScopeCompatibilityDeclaration) bool {
	if currentKey == "" || priorKey == "" {
		return false
	}
	for _, declaration := range declarations {
		if strings.TrimSpace(declaration.Version) == "" {
			continue
		}
		if strings.TrimSpace(declaration.CurrentCompatibilityKey) == currentKey &&
			strings.TrimSpace(declaration.PriorCompatibilityKey) == priorKey {
			return true
		}
	}
	return false
}

func compareKnownString(current, prior string) *bool {
	current = strings.TrimSpace(current)
	prior = strings.TrimSpace(prior)
	if current == "" || prior == "" {
		return nil
	}
	value := current == prior
	return &value
}

func compareKnownDuration(current, prior time.Duration) *bool {
	if current <= 0 || prior <= 0 {
		return nil
	}
	value := current == prior
	return &value
}

func samplingVersion(scope ScopeDescriptor) string {
	if value := strings.TrimSpace(scope.Run.SamplingSchemaVersion); value != "" {
		return value
	}
	return scope.Plan.SamplingSchemaVersion
}

func taxonomyVersion(scope ScopeDescriptor) string {
	if value := strings.TrimSpace(scope.Run.TaxonomyVersion); value != "" {
		return value
	}
	return scope.Plan.TaxonomyVersion
}

func weightingVersion(scope ScopeDescriptor) string {
	if value := strings.TrimSpace(scope.Run.IndexWeightingVersion); value != "" {
		return value
	}
	return scope.Plan.IndexWeightingVersion
}
