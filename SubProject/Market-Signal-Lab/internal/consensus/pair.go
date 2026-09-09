package consensus

import (
	"context"
	"errors"
	"marketsignallab/internal/analyticsengine"
	"marketsignallab/internal/domain"
	"sort"
	"time"
)

type PairSnapshot struct {
	Snapshot domain.SurfaceSnapshot
	Context  domain.ObservationContext
	Items    []domain.SurfaceSnapshotItem
}

type PairMetricInput struct {
	PairID            string
	SnapshotA         PairSnapshot
	SnapshotB         PairSnapshot
	CommonTopK        int
	DataQualityScore  float64
	DataQualityGrade  domain.DataQualityGrade
	Coverage          float64
	Confidence        float64
	ComparableBatches int
	GeneratedAt       time.Time
}

type weightedValue struct {
	name          string
	value, weight float64
	available     bool
}

func weighted(values []weightedValue) (float64, []domain.ConsensusScoreComponent, []string) {
	total := 0.0
	missing := []string{}
	for _, v := range values {
		if v.available {
			total += v.weight
		} else {
			missing = append(missing, v.name)
		}
	}
	if total <= 0 {
		return 0, nil, missing
	}
	comps := make([]domain.ConsensusScoreComponent, 0, len(values))
	score := 0.0
	for _, v := range values {
		ew := 0.0
		contrib := 0.0
		if v.available {
			ew = v.weight / total
			contrib = v.value * ew
			score += contrib
		}
		comps = append(comps, domain.ConsensusScoreComponent{Name: v.name, Value: v.value, OriginalWeight: v.weight, EffectiveWeight: ew, Contribution: contrib, Available: v.available})
	}
	return clampScore(score), comps, missing
}

func orderedKeys(items []domain.SurfaceSnapshotItem, topK int) []string {
	xs := append([]domain.SurfaceSnapshotItem(nil), items...)
	sort.Slice(xs, func(i, j int) bool { return xs[i].Rank < xs[j].Rank })
	out := []string{}
	for _, it := range xs {
		if it.Rank < 1 {
			continue
		}
		if topK > 0 && it.Rank > topK {
			continue
		}
		if it.CanonicalIdentityKey != "" {
			out = append(out, it.CanonicalIdentityKey)
		}
	}
	return out
}

func distribution(items []domain.SurfaceSnapshotItem, topK int, field func(domain.SurfaceSnapshotItem) string) (map[string]float64, int) {
	out := map[string]float64{}
	excluded := 0
	for _, it := range items {
		if it.Rank < 1 || (topK > 0 && it.Rank > topK) {
			continue
		}
		if it.TaxonomyConfidence < .5 {
			excluded++
			continue
		}
		k := field(it)
		if k == "" {
			excluded++
			continue
		}
		out[k]++
	}
	return out, excluded
}

func AmbiguityLabel(score float64) domain.AmbiguityLabel {
	switch {
	case score < 25:
		return domain.AmbiguityLow
	case score < 50:
		return domain.AmbiguityModerate
	case score < 75:
		return domain.AmbiguityHigh
	default:
		return domain.AmbiguityExtreme
	}
}

func evidenceStageFromBatches(n int) domain.TemporalEvidenceStage {
	switch {
	case n >= 12:
		return domain.EvidenceSeasonalityCandidate
	case n >= 6:
		return domain.EvidenceEstablishedConsensus
	case n >= 3:
		return domain.EvidencePreliminaryConsensus
	case n >= 2:
		return domain.EvidenceVolatilityIndication
	default:
		return domain.EvidenceCurrentComparison
	}
}

func BuildPairMetricsWithEngine(ctx context.Context, engine analyticsengine.Engine, in PairMetricInput) (domain.PairMetricSnapshot, domain.MarketAmbiguitySnapshot, domain.ConsensusScoreProvenance, error) {
	if engine == nil {
		return domain.PairMetricSnapshot{}, domain.MarketAmbiguitySnapshot{}, domain.ConsensusScoreProvenance{}, ErrAnalyticsEngineRequired
	}
	if in.PairID == "" || in.SnapshotA.Snapshot.ID == "" || in.SnapshotB.Snapshot.ID == "" {
		return domain.PairMetricSnapshot{}, domain.MarketAmbiguitySnapshot{}, domain.ConsensusScoreProvenance{}, errors.New("pair and snapshot ids are required")
	}
	common := in.CommonTopK
	if common <= 0 {
		common = in.SnapshotA.Snapshot.TopKObserved
		if in.SnapshotB.Snapshot.TopKObserved < common {
			common = in.SnapshotB.Snapshot.TopKObserved
		}
	}
	if common <= 0 {
		return domain.PairMetricSnapshot{}, domain.MarketAmbiguitySnapshot{}, domain.ConsensusScoreProvenance{}, errors.New("common top-k must be positive")
	}
	aKeys := orderedKeys(in.SnapshotA.Items, common)
	bKeys := orderedKeys(in.SnapshotB.Items, common)
	overlap := OverlapCoefficient(aKeys, bKeys)
	rbo := RankBiasedOverlap(aKeys, bKeys, .90)
	rankAgreement, shared := SharedRankAgreement(aKeys, bKeys)
	itemScore, itemComps, itemMissing := weighted([]weightedValue{{"rbo", rbo, .55, true}, {"top_k_overlap", overlap, .25, true}, {"shared_rank_agreement", rankAgreement, .20, shared > 0}})

	ptA, exA1 := distribution(in.SnapshotA.Items, common, func(x domain.SurfaceSnapshotItem) string { return x.ProductTypeID })
	ptB, exB1 := distribution(in.SnapshotB.Items, common, func(x domain.SurfaceSnapshotItem) string { return x.ProductTypeID })
	ucA, exA2 := distribution(in.SnapshotA.Items, common, func(x domain.SurfaceSnapshotItem) string { return x.UseCaseID })
	ucB, exB2 := distribution(in.SnapshotB.Items, common, func(x domain.SurfaceSnapshotItem) string { return x.UseCaseID })
	caA, exA3 := distribution(in.SnapshotA.Items, common, func(x domain.SurfaceSnapshotItem) string { return x.NormalizedCatalogID })
	caB, exB3 := distribution(in.SnapshotB.Items, common, func(x domain.SurfaceSnapshotItem) string { return x.NormalizedCatalogID })
	ptAvail := len(ptA) > 0 && len(ptB) > 0
	ucAvail := len(ucA) > 0 && len(ucB) > 0
	caAvail := len(caA) > 0 && len(caB) > 0
	ptSim := 0.0
	if ptAvail {
		result, err := engine.DistributionSimilarity(ctx, analyticsengine.DistributionSimilarityInput{A: ptA, B: ptB})
		if err != nil {
			return domain.PairMetricSnapshot{}, domain.MarketAmbiguitySnapshot{}, domain.ConsensusScoreProvenance{}, err
		}
		ptSim = result.Score
	}
	ucSim := 0.0
	if ucAvail {
		result, err := engine.DistributionSimilarity(ctx, analyticsengine.DistributionSimilarityInput{A: ucA, B: ucB})
		if err != nil {
			return domain.PairMetricSnapshot{}, domain.MarketAmbiguitySnapshot{}, domain.ConsensusScoreProvenance{}, err
		}
		ucSim = result.Score
	}
	caSim := 0.0
	if caAvail {
		result, err := engine.DistributionSimilarity(ctx, analyticsengine.DistributionSimilarityInput{A: caA, B: caB})
		if err != nil {
			return domain.PairMetricSnapshot{}, domain.MarketAmbiguitySnapshot{}, domain.ConsensusScoreProvenance{}, err
		}
		caSim = result.Score
	}
	authorSim, authorAvail := AuthorBreadthSimilarity(in.SnapshotA.Items, in.SnapshotB.Items)
	conceptScore, conceptComps, conceptMissing := weighted([]weightedValue{{"product_type_similarity", ptSim, .35, ptAvail}, {"use_case_similarity", ucSim, .35, ucAvail}, {"catalog_similarity", caSim, .20, caAvail}, {"author_breadth_similarity", authorSim, .10, authorAvail}})
	conceptAvailable := ptAvail || ucAvail || caAvail || authorAvail
	overall, overallComps, overallMissing := weighted([]weightedValue{{"item_consensus", itemScore, .35, true}, {"concept_consensus", conceptScore, .65, conceptAvailable}})
	missing := append(append([]string{}, itemMissing...), conceptMissing...)
	missing = append(missing, overallMissing...)
	reasons := []string{}
	if exA1+exA2+exA3+exB1+exB2+exB3 > 0 {
		reasons = append(reasons, "taxonomy_items_excluded")
	}
	if !authorAvail {
		reasons = append(reasons, "author_breadth_unavailable")
	}
	for _, it := range append(append([]domain.SurfaceSnapshotItem{}, in.SnapshotA.Items...), in.SnapshotB.Items...) {
		if it.IdentityConfidence > 0 && it.IdentityConfidence < 1 {
			reasons = append(reasons, "identity_fallback_url")
			break
		}
	}
	if in.DataQualityGrade == domain.DataQualityGradeC || in.DataQualityGrade == domain.DataQualityGradeD {
		reasons = append(reasons, "data_quality_warning")
	}
	generated := in.GeneratedAt
	if generated.IsZero() {
		generated = time.Now().UTC()
	}
	stage := evidenceStageFromBatches(in.ComparableBatches)
	provID := domain.NewID()
	metricID := domain.NewID()
	ambID := domain.NewID()
	metrics := domain.PairMetricSnapshot{ID: metricID, PairID: in.PairID, SnapshotAID: in.SnapshotA.Snapshot.ID, SnapshotBID: in.SnapshotB.Snapshot.ID, CommonTopK: common, TopKOverlap: overlap, RankBiasedOverlap: rbo, SharedRankAgreement: rankAgreement, SharedItemCount: shared, ProductTypeSimilarity: ptSim, UseCaseSimilarity: ucSim, CatalogSimilarity: caSim, AuthorBreadthSimilarity: authorSim, ItemConsensus: itemScore, ConceptConsensus: conceptScore, OverallConsensus: overall, MissingComponents: missing, Coverage: in.Coverage, Confidence: in.Confidence, DataQualityScore: in.DataQualityScore, DataQualityGrade: in.DataQualityGrade, EvidenceStage: string(stage), EstablishedTrend: stage == domain.EvidenceEstablishedConsensus || stage == domain.EvidenceSeasonalityCandidate, ProvenanceID: provID, ModelVersions: []string{"rbo-consensus-v0.1", "concept-distribution-similarity-v0.1", "market-consensus-v0.1"}, ReasonCodes: reasons, GeneratedAt: generated.Format(time.RFC3339)}
	ambiguityScore := clampScore(100 - overall)
	amb := domain.MarketAmbiguitySnapshot{ID: ambID, PairID: in.PairID, Score: ambiguityScore, Label: string(AmbiguityLabel(ambiguityScore)), ProvenanceID: provID, ModelVersion: "market-ambiguity-v0.1", GeneratedAt: generated.Format(time.RFC3339)}
	comps := append([]domain.ConsensusScoreComponent{}, overallComps...)
	// Preserve subcomponent audit without allowing them to affect the final-weight sum.
	for _, c := range append(itemComps, conceptComps...) {
		c.EffectiveWeight = 0
		c.Contribution = 0
		comps = append(comps, c)
	}
	prov := domain.ConsensusScoreProvenance{ID: provID, ScoreType: "overall_market_consensus", EntityType: "snapshot_pair", EntityID: in.PairID, PairID: in.PairID, SnapshotIDs: []string{in.SnapshotA.Snapshot.ID, in.SnapshotB.Snapshot.ID}, ContextIDs: []string{in.SnapshotA.Context.ID, in.SnapshotB.Context.ID}, FinalScore: overall, Components: comps, MissingComponents: missing, ModelVersions: metrics.ModelVersions, TopK: common, Coverage: in.Coverage, Confidence: in.Confidence, DataQualityScore: in.DataQualityScore, DataQualityGrade: in.DataQualityGrade, ReasonCodes: reasons, GeneratedAt: generated.Format(time.RFC3339)}
	return metrics, amb, prov, nil
}
