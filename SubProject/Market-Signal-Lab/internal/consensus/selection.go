package consensus

import (
	"context"
	"marketsignallab/internal/analyticsengine"
	"marketsignallab/internal/domain"
	"time"
)

type SelectionObservation struct {
	SnapshotID  string
	ContextType string
	Weight      float64
	Selected    bool
}

type SelectionInput struct {
	EntityType           string
	EntityID             string
	Observations         []SelectionObservation
	TopK                 int
	MaterialityThreshold float64
	ContextTypes         []string
	WindowStart          string
	WindowEnd            string
	Coverage             float64
	Confidence           float64
	DataQualityScore     float64
	DataQualityGrade     domain.DataQualityGrade
	GeneratedAt          time.Time
}

type ContextHealthInput struct {
	ContextID           string
	CaptureBatchID      string
	Coverage            float64
	ContextCompleteness float64
	TimeAlignment       float64
	TopKDepth           float64
	TaxonomyConfidence  float64
	IdentityResolution  float64
	SourceReliability   float64
	HistoricalDepth     float64
	ContextDiversity    float64
	GeneratedAt         time.Time
}

func qualityGrade(score float64) domain.DataQualityGrade {
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

func BuildSelectionProbabilityWithEngine(ctx context.Context, engine analyticsengine.Engine, in SelectionInput) (domain.SelectionProbabilitySnapshot, error) {
	if engine == nil {
		return domain.SelectionProbabilitySnapshot{}, ErrAnalyticsEngineRequired
	}
	observations := make([]analyticsengine.SelectionObservation, 0, len(in.Observations))
	ids := make([]string, 0, len(in.Observations))
	contexts := append([]string(nil), in.ContextTypes...)
	seenCtx := map[string]bool{}
	for _, c := range contexts {
		seenCtx[c] = true
	}
	for _, o := range in.Observations {
		observations = append(observations, analyticsengine.SelectionObservation{Weight: o.Weight, Selected: o.Selected})
		ids = append(ids, o.SnapshotID)
		if o.ContextType != "" && !seenCtx[o.ContextType] {
			seenCtx[o.ContextType] = true
			contexts = append(contexts, o.ContextType)
		}
	}
	result, err := engine.SelectionProbability(ctx, analyticsengine.SelectionProbabilityInput{Observations: observations})
	if err != nil {
		return domain.SelectionProbabilitySnapshot{}, err
	}
	at := in.GeneratedAt
	if at.IsZero() {
		at = time.Now().UTC()
	}
	grade := in.DataQualityGrade
	if grade == "" {
		grade = qualityGrade(in.DataQualityScore)
	}
	return domain.SelectionProbabilitySnapshot{
		ID:                   domain.NewID(),
		EntityType:           in.EntityType,
		EntityID:             in.EntityID,
		Label:                "observed_selection_probability",
		Score:                result.Score,
		SelectedCount:        result.SelectedCount,
		EligibleCount:        result.EligibleCount,
		SelectedWeight:       result.SelectedWeight,
		EligibleWeight:       result.EligibleWeight,
		EligibleSnapshotIDs:  ids,
		ContextTypes:         uniqueStrings(contexts),
		TopK:                 in.TopK,
		MaterialityThreshold: in.MaterialityThreshold,
		WindowStart:          in.WindowStart,
		WindowEnd:            in.WindowEnd,
		Coverage:             in.Coverage,
		Confidence:           in.Confidence,
		DataQualityScore:     in.DataQualityScore,
		DataQualityGrade:     grade,
		ProvenanceID:         domain.NewID(),
		ModelVersion:         "observed-selection-probability-v0.1",
		GeneratedAt:          at.Format(time.RFC3339),
	}, nil
}

func BuildContextHealth(in ContextHealthInput) domain.ContextHealthSnapshot {
	score := clampScore(in.ContextCompleteness*.15 + in.TimeAlignment*.15 + in.TopKDepth*.10 + in.TaxonomyConfidence*.15 + in.IdentityResolution*.15 + in.SourceReliability*.10 + in.HistoricalDepth*.10 + in.ContextDiversity*.10)
	at := in.GeneratedAt
	if at.IsZero() {
		at = time.Now().UTC()
	}
	grade := qualityGrade(score)
	reasons := []string{}
	if in.TopKDepth < 50 {
		reasons = append(reasons, "shallow_top_k")
	}
	if in.TaxonomyConfidence < 50 {
		reasons = append(reasons, "low_taxonomy_confidence")
	}
	if in.TimeAlignment < 50 {
		reasons = append(reasons, "weak_time_alignment")
	}
	return domain.ContextHealthSnapshot{ID: domain.NewID(), ContextID: in.ContextID, CaptureBatchID: in.CaptureBatchID, Score: score, Coverage: in.Coverage, Confidence: score, DataQualityScore: score, DataQualityGrade: grade, TopKDepthScore: in.TopKDepth, TimeAlignmentScore: in.TimeAlignment, TaxonomyConfidence: in.TaxonomyConfidence, IdentityResolution: in.IdentityResolution, ContextDiversity: in.ContextDiversity, SourceReliability: in.SourceReliability, HistoricalDepth: in.HistoricalDepth, ReasonCodes: reasons, ModelVersion: "context-health-v0.1", GeneratedAt: at.Format(time.RFC3339)}
}
