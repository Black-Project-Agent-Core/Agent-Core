package indexing

import (
	"errors"
	"marketsignallab/internal/domain"
	"math"
	"sort"
	"strings"
)

const ProvenanceModelVersion = "score-provenance-v0.1"

type ProvenanceInput struct {
	RunID, PriorRunID, ScoreType, EntityType, EntityID                                     string
	PlannerVersion, SamplingSchemaVersion, TaxonomyVersion, WeightSetVersion, ModelVersion string
	Parameters                                                                             map[string]float64
	SampleSize, UniqueProducts                                                             int
	SiteDistribution, CatalogDistribution, SurfaceDistribution                             []domain.DistributionShare
	DuplicateRate, Coverage, Confidence                                                    float64
	Quality                                                                                domain.DataQualityAssessment
	Components                                                                             []domain.ScoreComponent
	MissingComponents, FallbackRules, ReasonCodes                                          []string
	GeneratedAt                                                                            string
}

func round4(value float64) float64     { return math.Round(value*10000) / 10000 }
func roundProv1(value float64) float64 { return math.Round(value*10) / 10 }

func BuildProvenance(in ProvenanceInput) (domain.ScoreProvenance, error) {
	if in.RunID == "" || in.ScoreType == "" || in.EntityType == "" || in.EntityID == "" {
		return domain.ScoreProvenance{}, errors.New("run, score type, and entity identity are required")
	}
	if in.GeneratedAt == "" {
		return domain.ScoreProvenance{}, errors.New("generated timestamp is required")
	}
	originalTotal := 0.0
	availableTotal := 0.0
	for _, component := range in.Components {
		if component.OriginalWeight < 0 {
			return domain.ScoreProvenance{}, errors.New("component weights cannot be negative")
		}
		originalTotal += component.OriginalWeight
		if !component.Missing {
			availableTotal += component.OriginalWeight
		}
	}
	if len(in.Components) > 0 && math.Abs(originalTotal-1) > .001 {
		return domain.ScoreProvenance{}, errors.New("original component weights must total one")
	}
	if len(in.Components) > 0 && availableTotal == 0 {
		return domain.ScoreProvenance{}, errors.New("no score components are available")
	}
	if availableTotal < originalTotal {
		in.FallbackRules = append(in.FallbackRules, "renormalized_available_components")
	}
	unroundedTotal := 0.0
	effectiveTotal := 0.0
	missing := append([]string(nil), in.MissingComponents...)
	for i := range in.Components {
		component := &in.Components[i]
		if component.Missing {
			component.EffectiveWeight = 0
			component.Contribution = 0
			missing = append(missing, component.Name)
			continue
		}
		component.EffectiveWeight = component.OriginalWeight / availableTotal
		rawContribution := component.NormalizedValue * component.EffectiveWeight
		component.Contribution = round4(rawContribution)
		unroundedTotal += rawContribution
		effectiveTotal += component.EffectiveWeight
	}
	finalScore := roundProv1(unroundedTotal)
	return domain.ScoreProvenance{ID: domain.NewID(), RunID: in.RunID, PriorRunID: in.PriorRunID, ScoreType: in.ScoreType, EntityType: in.EntityType, EntityID: in.EntityID, PlannerVersion: in.PlannerVersion, SamplingSchemaVersion: in.SamplingSchemaVersion, TaxonomyVersion: in.TaxonomyVersion, WeightSetVersion: in.WeightSetVersion, ModelVersion: in.ModelVersion, FinalScore: finalScore, OriginalWeightTotal: round4(originalTotal), EffectiveWeightTotal: round4(effectiveTotal), Parameters: copyFloatMap(in.Parameters), SampleSize: in.SampleSize, UniqueProducts: in.UniqueProducts, SiteDistribution: cloneDistribution(in.SiteDistribution), CatalogDistribution: cloneDistribution(in.CatalogDistribution), SurfaceDistribution: cloneDistribution(in.SurfaceDistribution), DuplicateRate: in.DuplicateRate, Coverage: in.Coverage, Confidence: in.Confidence, DataQualityScore: in.Quality.Score, DataQualityGrade: in.Quality.Grade, Components: append([]domain.ScoreComponent(nil), in.Components...), MissingComponents: uniqueSortedStrings(missing), FallbackRules: uniqueSortedStrings(in.FallbackRules), ReasonCodes: uniqueSortedStrings(in.ReasonCodes), GeneratedAt: in.GeneratedAt}, nil
}

func ValidateProvenance(row domain.ScoreProvenance, visibleScore float64) error {
	contributionTotal := 0.0
	originalTotal := 0.0
	effectiveTotal := 0.0
	for _, component := range row.Components {
		originalTotal += component.OriginalWeight
		if component.Missing {
			if component.EffectiveWeight != 0 || component.Contribution != 0 {
				return errors.New("missing component must have zero effective weight and contribution")
			}
			continue
		}
		contributionTotal += component.Contribution
		effectiveTotal += component.EffectiveWeight
	}
	if math.Abs(row.FinalScore-visibleScore) > .01 {
		return errors.New("provenance final score does not match visible score")
	}
	if math.Abs(contributionTotal-row.FinalScore) > .06 {
		return errors.New("component contributions do not match final score")
	}
	if len(row.Components) > 0 && math.Abs(originalTotal-1) > .001 {
		return errors.New("original weights do not total one")
	}
	if len(row.Components) > 0 && math.Abs(effectiveTotal-1) > .001 {
		return errors.New("effective weights do not total one")
	}
	if math.Abs(row.OriginalWeightTotal-originalTotal) > .001 || math.Abs(row.EffectiveWeightTotal-effectiveTotal) > .001 {
		return errors.New("stored weight totals do not match components")
	}
	return nil
}
func copyFloatMap(in map[string]float64) map[string]float64 {
	if in == nil {
		return nil
	}
	out := make(map[string]float64, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}
func cloneDistribution(in []domain.DistributionShare) []domain.DistributionShare {
	return append([]domain.DistributionShare(nil), in...)
}
func uniqueSortedStrings(in []string) []string {
	set := map[string]struct{}{}
	for _, v := range in {
		v = strings.TrimSpace(v)
		if v != "" {
			set[v] = struct{}{}
		}
	}
	out := make([]string, 0, len(set))
	for v := range set {
		out = append(out, v)
	}
	sort.Strings(out)
	return out
}
