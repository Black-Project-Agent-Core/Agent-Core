package indexing

import (
	"marketsignallab/internal/domain"
	"testing"
)

func hasProvenanceFallback(values []string, want string) bool {
	for _, v := range values {
		if v == want {
			return true
		}
	}
	return false
}
func TestBuildProvenanceRenormalizesMissingComponentsAndStoresTotals(t *testing.T) {
	got, err := BuildProvenance(ProvenanceInput{RunID: "run-1", ScoreType: "composition", EntityType: "global", EntityID: "global", GeneratedAt: "2026-08-16T00:00:00Z", Parameters: map[string]float64{"configuredCap": .45, "effectiveCap": .50}, Components: []domain.ScoreComponent{{Name: "activity", NormalizedValue: 80, OriginalWeight: .5}, {Name: "freshness", NormalizedValue: 60, OriginalWeight: .3}, {Name: "author_diversity", OriginalWeight: .2, Missing: true, ReasonCode: "author_missing"}}})
	if err != nil {
		t.Fatal(err)
	}
	if got.OriginalWeightTotal != 1 || got.EffectiveWeightTotal != 1 {
		t.Fatalf("got=%+v", got)
	}
	if got.FinalScore != 72.5 {
		t.Fatalf("score=%v", got.FinalScore)
	}
	if !hasProvenanceFallback(got.FallbackRules, "renormalized_available_components") {
		t.Fatal(got.FallbackRules)
	}
	if err := ValidateProvenance(got, 72.5); err != nil {
		t.Fatal(err)
	}
}
func TestValidateProvenanceRejectsContributionMismatch(t *testing.T) {
	row := domain.ScoreProvenance{FinalScore: 80, OriginalWeightTotal: 1, EffectiveWeightTotal: 1, Components: []domain.ScoreComponent{{Name: "a", OriginalWeight: 1, EffectiveWeight: 1, Contribution: 70}}}
	if err := ValidateProvenance(row, 80); err == nil {
		t.Fatal("expected mismatch")
	}
}
