package quality

import (
	"errors"
	"marketsignallab/internal/domain"
	"math"
	"sort"
)

const ModelVersion = "data-quality-v0.1"

type Input struct {
	RunID, EntityType, EntityID, GeneratedAt string
	Audit                                    domain.SampleAudit
	ComparableRuns                           int
	Directional, ProductDirection            bool
	Partial                                  bool
	FatalSourcePermission                    bool
}

func grade(score float64) domain.DataQualityGrade {
	switch {
	case score >= 85:
		return domain.DataQualityGradeA
	case score >= 70:
		return domain.DataQualityGradeB
	case score >= 50:
		return domain.DataQualityGradeC
	default:
		return domain.DataQualityGradeD
	}
}

func capGrade(current, cap domain.DataQualityGrade) domain.DataQualityGrade {
	order := map[domain.DataQualityGrade]int{domain.DataQualityGradeA: 4, domain.DataQualityGradeB: 3, domain.DataQualityGradeC: 2, domain.DataQualityGradeD: 1}
	if order[current] > order[cap] {
		return cap
	}
	return current
}

func roundQuality1(value float64) float64 { return math.Round(value*10) / 10 }

func Assess(in Input) (domain.DataQualityAssessment, error) {
	if in.FatalSourcePermission {
		return domain.DataQualityAssessment{}, errors.New("fatal source permission prevents data-quality assessment")
	}
	components := domain.DataQualityComponents{
		StratumCompletion: in.Audit.StratumCompletionRate,
		SampleSize:        in.Audit.SampleSizeAdequacy,
		SampleBalance:     in.Audit.SampleBalanceScore,
		UniqueProduct:     in.Audit.UniqueProductRatio,
		Taxonomy:          in.Audit.TaxonomyConfidence,
		AuthorCoverage:    in.Audit.AuthorCoverage,
		SourceReliability: in.Audit.SourceReliability,
		HistoryDepth:      math.Min(100, float64(in.ComparableRuns)/6*100),
		SurfaceDiversity:  in.Audit.SurfaceDiversityScore,
	}
	score := roundQuality1(
		components.StratumCompletion*.20 + components.SampleSize*.15 +
			components.SampleBalance*.15 + components.UniqueProduct*.10 +
			components.Taxonomy*.10 + components.AuthorCoverage*.05 +
			components.SourceReliability*.10 + components.HistoryDepth*.10 +
			components.SurfaceDiversity*.05,
	)
	resultGrade := grade(score)
	caps, reasons := []string{}, []string{}
	applyCap := func(code string, cap domain.DataQualityGrade) {
		caps = append(caps, code)
		reasons = append(reasons, code)
		resultGrade = capGrade(resultGrade, cap)
	}
	if in.Directional && in.ComparableRuns < 2 {
		applyCap("no_comparable_history", domain.DataQualityGradeC)
	}
	if len(in.Audit.SurfaceDistribution) > 0 && len(in.Audit.SurfaceDistribution) < 2 {
		applyCap("insufficient_surface_diversity", domain.DataQualityGradeC)
	}
	if in.ProductDirection && in.Audit.TaxonomyConfidence < 50 {
		applyCap("taxonomy_below_50", domain.DataQualityGradeC)
	}
	if in.Audit.DominantSiteShare > 70 {
		applyCap("dominant_site_over_70", domain.DataQualityGradeC)
	}
	if in.Partial {
		if !(in.Audit.HighPriorityComplete && in.Audit.DominantSiteShare <= 60 && in.Audit.DominantCatalogShare <= 60) {
			applyCap("partial_run_quality_cap", domain.DataQualityGradeC)
		} else {
			applyCap("partial_run_high_priority_complete", domain.DataQualityGradeB)
		}
	}
	sort.Strings(caps)
	sort.Strings(reasons)
	return domain.DataQualityAssessment{
		ID: domain.NewID(), RunID: in.RunID, EntityType: in.EntityType, EntityID: in.EntityID,
		Score: score, Grade: resultGrade, Components: components, CapsApplied: caps,
		ReasonCodes: reasons, ModelVersion: ModelVersion, GeneratedAt: in.GeneratedAt,
	}, nil
}
