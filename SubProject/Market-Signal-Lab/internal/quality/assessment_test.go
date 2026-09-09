package quality

import (
	"marketsignallab/internal/domain"
	"testing"
)

func hasString(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func perfectAudit() domain.SampleAudit {
	return domain.SampleAudit{StratumCompletionRate: 100, SampleSizeAdequacy: 100, SampleBalanceScore: 100, UniqueProductRatio: 100, TaxonomyConfidence: 100, AuthorCoverage: 100, SourceReliability: 100, SurfaceDiversityScore: 100, HighPriorityComplete: true}
}

func TestAssessBalancedSixRunSampleCanReachGradeA(t *testing.T) {
	got, err := Assess(Input{RunID: "run-1", EntityType: "global", EntityID: "global", Audit: perfectAudit(), ComparableRuns: 6, GeneratedAt: "2026-08-16T00:00:00Z"})
	if err != nil {
		t.Fatal(err)
	}
	if got.Score != 100 || got.Grade != domain.DataQualityGradeA {
		t.Fatalf("got=%+v", got)
	}
}

func TestAssessDominantSiteCapsGradeAtC(t *testing.T) {
	audit := perfectAudit()
	audit.DominantSiteShare = 72
	audit.SampleBalanceScore = 40
	got, err := Assess(Input{RunID: "run-1", EntityType: "global", EntityID: "global", Audit: audit, ComparableRuns: 6, GeneratedAt: "2026-08-16T00:00:00Z"})
	if err != nil {
		t.Fatal(err)
	}
	if got.Grade != domain.DataQualityGradeC || !hasString(got.CapsApplied, "dominant_site_over_70") {
		t.Fatalf("got=%+v", got)
	}
}

func TestAssessNoComparableHistoryCapsDirectionalQualityAtC(t *testing.T) {
	got, _ := Assess(Input{RunID: "run-1", EntityType: "global", EntityID: "global", Audit: perfectAudit(), ComparableRuns: 1, Directional: true, GeneratedAt: "2026-08-16T00:00:00Z"})
	if got.Grade != domain.DataQualityGradeC {
		t.Fatalf("got=%+v", got)
	}
}

func TestAssessFatalPermissionReturnsNoScore(t *testing.T) {
	if _, err := Assess(Input{RunID: "run-1", FatalSourcePermission: true}); err == nil {
		t.Fatal("fatal permission must produce no assessment")
	}
}
