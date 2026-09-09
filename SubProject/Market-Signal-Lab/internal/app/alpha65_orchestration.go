package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	analyticsenginepkg "marketsignallab/internal/analyticsengine"
	"marketsignallab/internal/autopilot"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/indexing"
	"marketsignallab/internal/quality"
	"math"
	"sort"
	"strings"
)

// Alpha65IntegrityView is the validated output of one market-map run.
// Every visible score included here has quality and provenance attached.
type Alpha65IntegrityView struct {
	Run              domain.MarketMapRun            `json:"run"`
	SampleAudit      domain.SampleAudit             `json:"sampleAudit"`
	GlobalIndex      domain.MarketIndexSnapshot     `json:"globalIndex"`
	IndexHierarchy   []domain.MarketIndexSnapshot   `json:"indexHierarchy"`
	DataQuality      []domain.DataQualityAssessment `json:"dataQuality"`
	SurfaceBreakdown []domain.SurfaceBreakdownRow   `json:"surfaceBreakdown"`
	Catalogs         []domain.CatalogSnapshot       `json:"catalogs"`
	Products         []domain.ProductSnapshot       `json:"products"`
	ComparableRuns   int                            `json:"comparableRuns"`
}

func stableIntegrityID(prefix string, values ...string) string {
	sum := sha256.Sum256([]byte(prefix + "|" + strings.Join(values, "|")))
	return prefix + "-" + hex.EncodeToString(sum[:10])
}

func (s *Service) ensureAlpha65TargetResults(run domain.MarketMapRun, plan domain.MarketMapPlan) error {
	rows, err := s.integrity.MarketMapTargetResults(run.ID)
	if err != nil {
		return err
	}
	if len(rows) > 0 {
		return nil
	}
	surfaceRows, err := s.autopilot.MarketSurfaceObservations(run.ID)
	if err != nil {
		return err
	}
	byTarget := map[string][]domain.MarketSurfaceObservation{}
	for _, row := range surfaceRows {
		byTarget[row.TargetID] = append(byTarget[row.TargetID], row)
	}
	for _, target := range plan.Targets {
		observed := byTarget[target.ID]
		products := map[string]struct{}{}
		for _, row := range observed {
			if row.ProductID != "" {
				products[row.ProductID] = struct{}{}
			}
		}
		status := domain.MarketMapTargetFailed
		failure := "no_usable_observation"
		if len(observed) > 0 {
			status, failure = domain.MarketMapTargetCompleted, ""
		}
		if run.Status == domain.MarketMapRunPartial && len(observed) > 0 && target.TargetSample > 0 && len(observed) < target.TargetSample {
			status = domain.MarketMapTargetPartial
		}
		row := domain.MarketMapTargetResult{
			ID: stableIntegrityID("target-result", run.ID, target.ID), RunID: run.ID,
			TargetID: target.ID, StratumKey: target.StratumKey, Status: status,
			RequestsUsed: minInt(target.RequestAllowance, 1), ObservedItems: len(observed),
			UniqueProducts: len(products), FailureCode: failure, CompletedAt: run.CompletedAt,
		}
		if err := s.integrity.AppendMarketMapTargetResult(row); err != nil {
			return err
		}
	}
	return nil
}

func eligibleAlpha65Runs(rows []domain.MarketMapRun, current domain.MarketMapRun) []domain.MarketMapRun {
	out := []domain.MarketMapRun{}
	for _, row := range rows {
		if row.CompatibilityKey != current.CompatibilityKey || row.CompletedAt == "" || row.CompletedAt > current.CompletedAt {
			continue
		}
		if row.Status != domain.MarketMapRunCompleted && row.Status != domain.MarketMapRunPartial {
			continue
		}
		if row.IntegrityStatus != domain.IntegrityStatusNativeAlpha65 && row.IntegrityStatus != domain.IntegrityStatusRecalculated {
			continue
		}
		out = append(out, row)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CompletedAt < out[j].CompletedAt })
	return out
}

func alpha65Quality(audit domain.SampleAudit, run domain.MarketMapRun, comparable int, entityType, entityID string, productDirection bool) (domain.DataQualityAssessment, error) {
	row, err := quality.Assess(quality.Input{
		RunID: run.ID, EntityType: entityType, EntityID: entityID, GeneratedAt: run.CompletedAt,
		Audit: audit, ComparableRuns: comparable, Directional: true,
		ProductDirection: productDirection, Partial: run.Status == domain.MarketMapRunPartial,
	})
	if err != nil {
		return row, err
	}
	row.ID = stableIntegrityID("quality", run.ID, entityType, entityID, quality.ModelVersion)
	return row, nil
}

type alpha65SegmentBucket struct {
	level                     domain.SegmentLevel
	entityID, parentID, label string
	products                  map[string]struct{}
}

func addAlpha65Bucket(buckets map[string]*alpha65SegmentBucket, level domain.SegmentLevel, entityID, parentID, label, productID string) {
	if entityID == "" || productID == "" {
		return
	}
	key := string(level) + "|" + entityID
	row := buckets[key]
	if row == nil {
		row = &alpha65SegmentBucket{level: level, entityID: entityID, parentID: parentID, label: label, products: map[string]struct{}{}}
		buckets[key] = row
	}
	row.products[productID] = struct{}{}
}

func (s *Service) alpha65SegmentEvidence(run domain.MarketMapRun, audit domain.SampleAudit, q domain.DataQualityAssessment) ([]indexing.SegmentEvidence, error) {
	observations, err := s.universe.ProductObservations(domain.ObservationFilter{MarketMapRunID: run.ID})
	if err != nil {
		return nil, err
	}
	segments, err := s.integrity.ObservationSegmentations(domain.ObservationSegmentationFilter{RunID: run.ID})
	if err != nil {
		return nil, err
	}
	catalogs, err := s.universe.CatalogNodes()
	if err != nil {
		return nil, err
	}
	catalogName := map[string]string{}
	for _, row := range catalogs {
		catalogName[row.ID] = row.Name
	}
	latest := map[string]domain.ObservationSegmentation{}
	for _, row := range segments {
		if previous, ok := latest[row.ObservationID]; !ok || row.GeneratedAt > previous.GeneratedAt {
			latest[row.ObservationID] = row
		}
	}
	buckets := map[string]*alpha65SegmentBucket{}
	for _, observation := range observations {
		segment, ok := latest[observation.ID]
		if !ok || (segment.Status != domain.IntegrityStatusNativeAlpha65 && segment.Status != domain.IntegrityStatusRecalculated) {
			continue
		}
		site := strings.TrimSpace(segment.Site)
		if site == "" {
			site = "unknown"
		}
		siteID := "site:" + site
		addAlpha65Bucket(buckets, domain.SegmentLevelSite, siteID, "global", site, observation.ProductID)
		content := strings.TrimSpace(segment.ContentType)
		if content == "" {
			content = "Unclassified"
		}
		contentID := "content:" + site + "|" + strings.ToLower(content)
		addAlpha65Bucket(buckets, domain.SegmentLevelContentType, contentID, siteID, content, observation.ProductID)
		catalogID := strings.TrimSpace(segment.CatalogID)
		if catalogID != "" {
			label := catalogName[catalogID]
			if label == "" {
				label = catalogID
			}
			addAlpha65Bucket(buckets, domain.SegmentLevelCatalog, catalogID, contentID, label, observation.ProductID)
		}
		productType := strings.TrimSpace(segment.ProductType)
		if productType != "" {
			parentID := catalogID
			if parentID == "" {
				parentID = contentID
			}
			productTypeID := "product_type:" + parentID + "|" + strings.ToLower(productType)
			addAlpha65Bucket(buckets, domain.SegmentLevelProductType, productTypeID, parentID, productType, observation.ProductID)
			if useCase := strings.TrimSpace(segment.UseCase); useCase != "" {
				useCaseID := "use_case:" + productTypeID + "|" + strings.ToLower(useCase)
				addAlpha65Bucket(buckets, domain.SegmentLevelUseCase, useCaseID, productTypeID, useCase, observation.ProductID)
			}
		}
	}

	parentTotals := map[string]int{}
	for _, bucket := range buckets {
		parentTotals[string(bucket.level)+"|"+bucket.parentID] += len(bucket.products)
	}
	keys := make([]string, 0, len(buckets))
	for key := range buckets {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	out := make([]indexing.SegmentEvidence, 0, len(keys))
	for _, key := range keys {
		bucket := buckets[key]
		total := parentTotals[string(bucket.level)+"|"+bucket.parentID]
		composition := 0.0
		if total > 0 {
			composition = roundOne(float64(len(bucket.products)) * 100 / float64(total))
		}
		out = append(out, indexing.SegmentEvidence{
			Level: bucket.level, EntityID: bucket.entityID, ParentID: bucket.parentID, Label: bucket.label,
			Volume: float64(len(bucket.products)), Composition: composition,
			Coverage: run.Coverage, Confidence: run.Confidence, Quality: q, Eligible: q.Grade != domain.DataQualityGradeD,
		})
	}
	if len(out) == 0 {
		// Ambiguous taxonomy must not invent a catalog. Keep a composition-only
		// site signal so a partial scan remains visible and auditable.
		for _, share := range audit.SiteDistribution {
			label := share.Label
			if label == "" {
				label = share.Key
			}
			out = append(out, indexing.SegmentEvidence{
				Level: domain.SegmentLevelSite, EntityID: "site:" + share.Key, ParentID: "global", Label: label,
				Volume: float64(maxInt(1, share.Count)), Composition: share.Share,
				Coverage: run.Coverage, Confidence: run.Confidence, Quality: q, Eligible: true,
			})
		}
	}
	if len(out) == 0 {
		out = append(out, indexing.SegmentEvidence{
			Level: domain.SegmentLevelSite, EntityID: "site:observed", ParentID: "global", Label: "Observed Market",
			Volume: float64(maxInt(1, audit.UniqueProducts)), Composition: 100,
			Coverage: run.Coverage, Confidence: run.Confidence, Quality: q, Eligible: true,
		})
	}
	return out, nil
}

func alpha65StructuralLevelCode(level domain.SegmentLevel) (uint8, error) {
	switch level {
	case domain.SegmentLevelGlobal:
		return 0, nil
	case domain.SegmentLevelSite:
		return 1, nil
	case domain.SegmentLevelContentType:
		return 2, nil
	case domain.SegmentLevelCatalog:
		return 3, nil
	case domain.SegmentLevelProductType:
		return 4, nil
	case domain.SegmentLevelUseCase:
		return 5, nil
	default:
		return 0, errors.New("unsupported structural segment level")
	}
}

func alpha65StructuralLevel(code uint8) (domain.SegmentLevel, error) {
	switch code {
	case 0:
		return domain.SegmentLevelGlobal, nil
	case 1:
		return domain.SegmentLevelSite, nil
	case 2:
		return domain.SegmentLevelContentType, nil
	case 3:
		return domain.SegmentLevelCatalog, nil
	case 4:
		return domain.SegmentLevelProductType, nil
	case 5:
		return domain.SegmentLevelUseCase, nil
	default:
		return "", errors.New("invalid structural result level code")
	}
}

func alpha65StructuralGradeCode(grade domain.DataQualityGrade) (uint8, error) {
	switch grade {
	case domain.DataQualityGradeA:
		return 1, nil
	case domain.DataQualityGradeB:
		return 2, nil
	case domain.DataQualityGradeC:
		return 3, nil
	case domain.DataQualityGradeD:
		return 4, nil
	default:
		return 0, errors.New("invalid structural data-quality grade")
	}
}

func alpha65StructuralGrade(code uint8) (domain.DataQualityGrade, error) {
	switch code {
	case 1:
		return domain.DataQualityGradeA, nil
	case 2:
		return domain.DataQualityGradeB, nil
	case 3:
		return domain.DataQualityGradeC, nil
	case 4:
		return domain.DataQualityGradeD, nil
	default:
		return "", errors.New("invalid structural result data-quality grade")
	}
}

func alpha65StructuralDivergence(code uint8) (domain.IndexDivergenceState, error) {
	switch code {
	case 0:
		return domain.IndexDivergenceAligned, nil
	case 1:
		return domain.IndexDivergenceModerate, nil
	case 2:
		return domain.IndexDivergenceConcentrated, nil
	default:
		return "", errors.New("invalid structural result divergence code")
	}
}

func alpha65StructuralStage(code uint8) (domain.DirectionStage, error) {
	switch code {
	case 0:
		return domain.DirectionStageComposition, nil
	case 1:
		return domain.DirectionStageMovement, nil
	case 2:
		return domain.DirectionStagePreliminary, nil
	case 3:
		return domain.DirectionStageEstablished, nil
	default:
		return "", errors.New("invalid structural result direction-stage code")
	}
}

func (s *Service) alpha65BuildStructuralWithRust(runID, priorRunID, generatedAt string, segments []indexing.SegmentEvidence) (indexing.BuildResult, error) {
	if len(segments) == 0 {
		return indexing.BuildResult{}, errors.New("structural segment evidence is empty")
	}
	ctx := context.Background()
	if err := s.RequireAnalyticsRuntime(ctx); err != nil {
		return indexing.BuildResult{}, err
	}

	coverage := segments[0].Coverage
	confidence := segments[0].Confidence
	for _, segment := range segments[1:] {
		if math.Abs(segment.Coverage-coverage) > 1e-9 || math.Abs(segment.Confidence-confidence) > 1e-9 {
			return indexing.BuildResult{}, errors.New("structural v0.1 wire cannot represent heterogeneous coverage/confidence")
		}
	}

	ids := map[string]struct{}{}
	labels := map[string]string{}
	for _, segment := range segments {
		if segment.EntityID != "" && segment.EntityID != "global" {
			ids[segment.EntityID] = struct{}{}
			labels[segment.EntityID] = segment.Label
		}
		if segment.ParentID != "" && segment.ParentID != "global" {
			ids[segment.ParentID] = struct{}{}
		}
	}
	sortedIDs := make([]string, 0, len(ids))
	for id := range ids {
		sortedIDs = append(sortedIDs, id)
	}
	sort.Strings(sortedIDs)
	keyByID := map[string]uint32{}
	idByKey := map[uint32]string{}
	for i, id := range sortedIDs {
		key := uint32(i + 1)
		keyByID[id] = key
		idByKey[key] = id
	}

	request := analyticsenginepkg.StructuralIndexV01Input{Segments: make([]analyticsenginepkg.StructuralSegmentEvidenceV01, 0, len(segments))}
	for _, segment := range segments {
		levelCode, err := alpha65StructuralLevelCode(segment.Level)
		if err != nil {
			return indexing.BuildResult{}, err
		}
		gradeCode, err := alpha65StructuralGradeCode(segment.Quality.Grade)
		if err != nil {
			return indexing.BuildResult{}, err
		}
		segmentKey := keyByID[segment.EntityID]
		if segmentKey == 0 {
			return indexing.BuildResult{}, errors.New("structural segment identity cannot be encoded")
		}
		parentKey := uint32(0)
		if segment.ParentID != "" && segment.ParentID != "global" {
			parentKey = keyByID[segment.ParentID]
			if parentKey == 0 {
				return indexing.BuildResult{}, errors.New("structural parent identity cannot be encoded")
			}
		}
		volume := math.Round(math.Max(0, segment.Volume))
		if volume > math.MaxUint32 {
			return indexing.BuildResult{}, errors.New("structural observed-product count exceeds wire range")
		}
		request.Segments = append(request.Segments, analyticsenginepkg.StructuralSegmentEvidenceV01{
			SegmentKey:       segmentKey,
			ParentKey:        parentKey,
			LevelCode:        levelCode,
			ObservedProducts: uint32(volume),
			DataQualityScore: segment.Quality.Score,
			DataQualityGrade: gradeCode,
		})
	}

	result, err := analyticsenginepkg.ExecuteStructuralIndexV01(ctx, s.analyticsRuntime, request)
	if err != nil {
		return indexing.BuildResult{}, err
	}
	hierarchy := make([]domain.MarketIndexSnapshot, 0, len(result.Rows))
	for _, row := range result.Rows {
		level, err := alpha65StructuralLevel(row.LevelCode)
		if err != nil {
			return indexing.BuildResult{}, err
		}
		grade, err := alpha65StructuralGrade(row.DataQualityGrade)
		if err != nil {
			return indexing.BuildResult{}, err
		}
		divergence, err := alpha65StructuralDivergence(row.DivergenceStateCode)
		if err != nil {
			return indexing.BuildResult{}, err
		}
		stage, err := alpha65StructuralStage(row.DirectionStageCode)
		if err != nil {
			return indexing.BuildResult{}, err
		}
		entityID := idByKey[row.SegmentKey]
		label := labels[entityID]
		if row.SegmentKey == 0 && level == domain.SegmentLevelGlobal {
			entityID, label = "global", "Observed Envato Market"
		}
		if entityID == "" {
			return indexing.BuildResult{}, errors.New("structural result references unknown entity key")
		}
		parentID := ""
		if row.ParentKey != 0 {
			parentID = idByKey[row.ParentKey]
			if parentID == "" {
				return indexing.BuildResult{}, errors.New("structural result references unknown parent key")
			}
		}
		if label == "" {
			label = entityID
		}
		hierarchy = append(hierarchy, domain.MarketIndexSnapshot{
			ID: domain.NewID(), RunID: runID, PriorRunID: priorRunID,
			Level: level, EntityID: entityID, ParentID: parentID, Label: label,
			CompositionIndex: row.CompositionIndex, VolumeWeightedValue: row.VolumeWeightedValue,
			EqualSectorValue: row.EqualSectorValue, DivergenceValue: row.DivergenceValue, DivergenceState: divergence,
			DirectionStage: stage, Coverage: coverage, Confidence: confidence,
			DataQualityScore: row.DataQualityScore, DataQualityGrade: grade, SampleSize: int(row.SampleSize),
			ModelVersion: indexing.VolumeIndexModelVersion, WeightSetVersion: "index-weighting-v0.1",
			IntegrityStatus: domain.IntegrityStatusNativeAlpha65, GeneratedAt: generatedAt,
		})
	}
	levelOrder := map[domain.SegmentLevel]int{
		domain.SegmentLevelGlobal: 0, domain.SegmentLevelSite: 1, domain.SegmentLevelContentType: 2,
		domain.SegmentLevelCatalog: 3, domain.SegmentLevelProductType: 4, domain.SegmentLevelUseCase: 5,
	}
	sort.SliceStable(hierarchy, func(i, j int) bool {
		li, lj := levelOrder[hierarchy[i].Level], levelOrder[hierarchy[j].Level]
		if li != lj {
			return li < lj
		}
		return hierarchy[i].EntityID < hierarchy[j].EntityID
	})
	if len(hierarchy) == 0 || hierarchy[0].Level != domain.SegmentLevelGlobal {
		return indexing.BuildResult{}, errors.New("global market index was not generated by Rust")
	}
	return indexing.BuildResult{Global: hierarchy[0], Hierarchy: hierarchy}, nil
}

func alpha65PriorMap(rows []domain.MarketIndexSnapshot) map[string]domain.MarketIndexSnapshot {
	out := map[string]domain.MarketIndexSnapshot{}
	for _, row := range rows {
		out[string(row.Level)+"|"+row.EntityID] = row
	}
	return out
}

func alpha65StructuralDirection(code uint8) (string, error) {
	switch code {
	case 0:
		return "", nil
	case 1:
		return "rising", nil
	case 2:
		return "falling", nil
	case 3:
		return "concentrated_rising", nil
	case 4:
		return "concentrated_falling", nil
	case 5:
		return "neutral", nil
	default:
		return "", errors.New("invalid structural direction result code")
	}
}

func (s *Service) applyAlpha65Direction(rows []domain.MarketIndexSnapshot, prior []domain.MarketIndexSnapshot, comparable int) error {
	if len(rows) == 0 {
		return nil
	}
	if comparable < 0 || uint64(comparable) > uint64(^uint32(0)) {
		return errors.New("structural comparable-run count exceeds Rust wire range")
	}
	ctx := context.Background()
	if err := s.RequireAnalyticsRuntime(ctx); err != nil {
		return err
	}
	priorByKey := alpha65PriorMap(prior)
	request := analyticsenginepkg.StructuralDirectionV01Input{Rows: make([]analyticsenginepkg.StructuralDirectionV01InputRow, 0, len(rows))}
	for i := range rows {
		row := &rows[i]
		previous := priorByKey[string(row.Level)+"|"+row.EntityID]
		request.Rows = append(request.Rows, analyticsenginepkg.StructuralDirectionV01InputRow{
			RowKey: uint32(i + 1), ComparableRuns: uint32(comparable),
			CurrentVolume: row.VolumeWeightedValue, PriorVolume: previous.VolumeWeightedValue,
			CurrentEqual: row.EqualSectorValue, PriorEqual: previous.EqualSectorValue, BaseConfidence: row.Confidence,
		})
	}
	result, err := analyticsenginepkg.ExecuteStructuralDirectionV01(ctx, s.analyticsRuntime, request)
	if err != nil {
		return err
	}
	if len(result.Rows) != len(rows) {
		return errors.New("structural direction Rust result count mismatch")
	}
	byKey := make(map[uint32]analyticsenginepkg.StructuralDirectionV01ResultRow, len(result.Rows))
	for _, resultRow := range result.Rows {
		if _, exists := byKey[resultRow.RowKey]; exists {
			return errors.New("structural direction Rust result row key is duplicated")
		}
		byKey[resultRow.RowKey] = resultRow
	}
	for i := range rows {
		row := &rows[i]
		resultRow, ok := byKey[uint32(i+1)]
		if !ok {
			return errors.New("structural direction Rust result row key is missing")
		}
		stage, err := alpha65StructuralStage(resultRow.StageCode)
		if err != nil {
			return err
		}
		direction, err := alpha65StructuralDirection(resultRow.DirectionCode)
		if err != nil {
			return err
		}
		row.DirectionStage = stage
		row.Direction = direction
		row.TrendScore = resultRow.TrendScore
		row.Confidence = resultRow.Confidence
		row.ComparableRuns = comparable
		opportunity := row.CompositionIndex
		row.OpportunityScore = &opportunity
	}
	return nil
}

func (s *Service) alpha65IndexPreview(run domain.MarketMapRun, comparable int) ([]domain.MarketIndexSnapshot, error) {
	audit, ok, err := s.integrity.LatestSampleAudit(run.ID)
	if err != nil {
		return nil, err
	}
	if !ok {
		audit, err = s.BuildAndPersistSampleAudit(run.ID, comparable)
		if err != nil {
			return nil, err
		}
	}
	q, err := alpha65Quality(audit, run, comparable, "global", "global", false)
	if err != nil {
		return nil, err
	}
	segments, err := s.alpha65SegmentEvidence(run, audit, q)
	if err != nil {
		return nil, err
	}
	built, err := s.alpha65BuildStructuralWithRust(run.ID, "", run.CompletedAt, segments)
	if err != nil {
		return nil, err
	}
	return built.Hierarchy, nil
}

func (s *Service) alpha65IndexProvenance(run domain.MarketMapRun, plan domain.MarketMapPlan, priorRunID string, audit domain.SampleAudit, q domain.DataQualityAssessment, row domain.MarketIndexSnapshot) (domain.ScoreProvenance, error) {
	visible := row.CompositionIndex
	scoreType := "composition_index"
	if row.TrendScore != nil {
		visible, scoreType = *row.TrendScore, "trend_index"
	}
	provenance, err := indexing.BuildProvenance(indexing.ProvenanceInput{
		RunID: run.ID, PriorRunID: priorRunID, ScoreType: scoreType, EntityType: string(row.Level), EntityID: row.EntityID,
		PlannerVersion: plan.PlannerVersion, SamplingSchemaVersion: plan.SamplingSchemaVersion,
		TaxonomyVersion: plan.TaxonomyVersion, WeightSetVersion: row.WeightSetVersion, ModelVersion: row.ModelVersion,
		SampleSize: row.SampleSize, UniqueProducts: audit.UniqueProducts,
		SiteDistribution: audit.SiteDistribution, CatalogDistribution: audit.CatalogDistribution,
		SurfaceDistribution: audit.SurfaceDistribution, DuplicateRate: audit.DuplicateRate,
		Coverage: row.Coverage, Confidence: row.Confidence, Quality: q,
		Components:  []domain.ScoreComponent{{Name: scoreType, RawValue: visible, NormalizedValue: visible, OriginalWeight: 1}},
		GeneratedAt: run.CompletedAt,
	})
	if err != nil {
		return provenance, err
	}
	provenance.ID = stableIntegrityID("provenance", run.ID, scoreType, string(row.Level), row.EntityID)
	if err := indexing.ValidateProvenance(provenance, visible); err != nil {
		return provenance, err
	}
	return provenance, nil
}

func (s *Service) alpha65ScoreProvenance(run domain.MarketMapRun, plan domain.MarketMapPlan, priorRunID string, audit domain.SampleAudit, q domain.DataQualityAssessment, entityType, entityID, scoreType, modelVersion string, visible float64, sampleSize int) (domain.ScoreProvenance, error) {
	provenance, err := indexing.BuildProvenance(indexing.ProvenanceInput{
		RunID: run.ID, PriorRunID: priorRunID, ScoreType: scoreType, EntityType: entityType, EntityID: entityID,
		PlannerVersion: plan.PlannerVersion, SamplingSchemaVersion: plan.SamplingSchemaVersion,
		TaxonomyVersion: plan.TaxonomyVersion, WeightSetVersion: plan.IndexWeightingVersion, ModelVersion: modelVersion,
		SampleSize: sampleSize, UniqueProducts: audit.UniqueProducts,
		SiteDistribution: audit.SiteDistribution, CatalogDistribution: audit.CatalogDistribution,
		SurfaceDistribution: audit.SurfaceDistribution, DuplicateRate: audit.DuplicateRate,
		Coverage: run.Coverage, Confidence: run.Confidence, Quality: q,
		Components:  []domain.ScoreComponent{{Name: scoreType, RawValue: visible, NormalizedValue: visible, OriginalWeight: 1}},
		GeneratedAt: run.CompletedAt,
	})
	if err != nil {
		return provenance, err
	}
	provenance.ID = stableIntegrityID("provenance", run.ID, scoreType, entityType, entityID)
	if err := indexing.ValidateProvenance(provenance, visible); err != nil {
		return provenance, err
	}
	return provenance, nil
}

func alpha65SurfaceBreakdown(audit domain.SampleAudit, targetResults []domain.MarketMapTargetResult, surfaceRows []domain.MarketSurfaceObservation) []domain.SurfaceBreakdownRow {
	order := []domain.MarketSurface{domain.MarketSurfaceNew, domain.MarketSurfaceRandomNew, domain.MarketSurfacePopular, domain.MarketSurfaceFeatured, domain.MarketSurfaceSearch, domain.MarketSurfaceCategory, domain.MarketSurfaceSimilar}
	rows := map[domain.MarketSurface]*domain.SurfaceBreakdownRow{}
	products := map[domain.MarketSurface]map[string]struct{}{}
	for _, surface := range order {
		rows[surface] = &domain.SurfaceBreakdownRow{Surface: surface}
		products[surface] = map[string]struct{}{}
	}
	for _, observation := range surfaceRows {
		row := rows[observation.Surface]
		if row == nil {
			continue
		}
		row.Observations++
		row.Reliability += observation.Reliability
		if observation.ProductID != "" {
			products[observation.Surface][observation.ProductID] = struct{}{}
		}
	}
	targetSurface := map[string]domain.MarketSurface{}
	for _, stratum := range audit.Strata {
		targetSurface[stratum.TargetID] = stratum.Surface
	}
	for _, target := range targetResults {
		row := rows[targetSurface[target.TargetID]]
		if row == nil {
			continue
		}
		switch target.Status {
		case domain.MarketMapTargetCompleted:
			row.TargetsCompleted++
		case domain.MarketMapTargetFailed:
			row.TargetsFailed++
		}
	}
	total := 0
	for _, row := range rows {
		total += row.Observations
	}
	out := make([]domain.SurfaceBreakdownRow, 0, len(order))
	for _, surface := range order {
		row := rows[surface]
		row.UniqueProducts = len(products[surface])
		if row.Observations > 0 {
			row.Reliability = row.Reliability / float64(row.Observations)
			row.DuplicateRate = (1 - float64(row.UniqueProducts)/float64(row.Observations)) * 100
		}
		if total > 0 {
			row.Contribution = float64(row.Observations) * 100 / float64(total)
		}
		out = append(out, *row)
	}
	return out
}

func alpha65GateInsight(row *domain.ProductionInsight, q domain.DataQualityAssessment, stage domain.DirectionStage) {
	row.DataQualityScore, row.DataQualityGrade, row.DirectionStage = q.Score, q.Grade, stage
	switch q.Grade {
	case domain.DataQualityGradeD:
		row.Code, row.Recommendation = "INSUFFICIENT_EVIDENCE", "insufficient_evidence"
		if row.Priority > 49 {
			row.Priority, row.Score = 49, 49
		}
		row.RiskCodes = append(row.RiskCodes, "DATA_QUALITY_D")
	case domain.DataQualityGradeC:
		if row.Recommendation == "produce_candidate" || row.Recommendation == "prototype" {
			row.Code, row.Recommendation = "RESEARCH_NOW", "research_now"
		}
		row.RiskCodes = append(row.RiskCodes, "DATA_QUALITY_C")
	}
}

func (s *Service) finalizeAlpha65Outputs(runID string) (Alpha65IntegrityView, error) {
	run, ok, err := s.autopilot.MarketMapRunByID(runID)
	if err != nil {
		return Alpha65IntegrityView{}, err
	}
	if !ok {
		return Alpha65IntegrityView{}, errors.New("market map run not found")
	}
	plan, ok, err := s.autopilot.MarketMapPlanByID(run.PlanID)
	if err != nil {
		return Alpha65IntegrityView{}, err
	}
	if !ok {
		return Alpha65IntegrityView{}, errors.New("market map plan not found")
	}
	if run.Status != domain.MarketMapRunCompleted && run.Status != domain.MarketMapRunPartial {
		return Alpha65IntegrityView{}, errors.New("market map run is not finalizable")
	}
	run.IntegrityStatus = domain.IntegrityStatusNativeAlpha65
	if err := s.ensureAlpha65TargetResults(run, plan); err != nil {
		return Alpha65IntegrityView{}, err
	}
	allRuns, err := s.autopilot.MarketMapRuns()
	if err != nil {
		return Alpha65IntegrityView{}, err
	}
	comparable := eligibleAlpha65Runs(allRuns, run)
	comparableCount := len(comparable)
	if comparableCount == 0 {
		comparableCount = 1
	}
	var prior domain.MarketMapRun
	priorOK := false
	for i := len(comparable) - 1; i >= 0; i-- {
		if comparable[i].ID != run.ID {
			prior, priorOK = comparable[i], true
			break
		}
	}

	audit, err := s.BuildAndPersistSampleAudit(run.ID, comparableCount)
	if err != nil {
		return Alpha65IntegrityView{}, err
	}
	globalQuality, err := alpha65Quality(audit, run, comparableCount, "global", "global", false)
	if err != nil {
		return Alpha65IntegrityView{}, err
	}
	segments, err := s.alpha65SegmentEvidence(run, audit, globalQuality)
	if err != nil {
		return Alpha65IntegrityView{}, err
	}
	priorID := ""
	priorIndices := []domain.MarketIndexSnapshot{}
	if priorOK {
		priorID = prior.ID
		priorIndices, err = s.integrity.MarketIndexSnapshots(domain.MarketIndexFilter{RunID: prior.ID, IntegrityStatus: domain.IntegrityStatusNativeAlpha65})
		if err != nil {
			return Alpha65IntegrityView{}, err
		}
		if len(priorIndices) == 0 {
			priorIndices, err = s.alpha65IndexPreview(prior, maxInt(1, comparableCount-1))
			if err != nil {
				return Alpha65IntegrityView{}, err
			}
		}
	}
	built, err := s.alpha65BuildStructuralWithRust(run.ID, priorID, run.CompletedAt, segments)
	if err != nil {
		return Alpha65IntegrityView{}, err
	}
	if err := s.applyAlpha65Direction(built.Hierarchy, priorIndices, comparableCount); err != nil {
		return Alpha65IntegrityView{}, err
	}
	if len(built.Hierarchy) == 0 {
		return Alpha65IntegrityView{}, errors.New("global market index was not generated")
	}
	built.Global = built.Hierarchy[0]

	qualityRows := []domain.DataQualityAssessment{globalQuality}
	provenanceRows := []domain.ScoreProvenance{}
	for i := range built.Hierarchy {
		row := &built.Hierarchy[i]
		row.DataQualityScore, row.DataQualityGrade = globalQuality.Score, globalQuality.Grade
		row.ID = stableIntegrityID("index", run.ID, string(row.Level), row.EntityID, row.ModelVersion)
		provenance, err := s.alpha65IndexProvenance(run, plan, priorID, audit, globalQuality, *row)
		if err != nil {
			return Alpha65IntegrityView{}, err
		}
		row.ProvenanceID = provenance.ID
		provenanceRows = append(provenanceRows, provenance)
	}
	built.Global = built.Hierarchy[0]
	stage := built.Global.DirectionStage

	rankingsByWindow := map[int]domain.RankingBuildResult{}
	for _, days := range []int{7, 30, 90} {
		result, buildErr := s.buildRankings(domain.RankingBuildRequest{MarketMapRunID: run.ID, AsOf: run.CompletedAt, WindowDays: days}, false)
		if buildErr != nil {
			if days == 30 {
				return Alpha65IntegrityView{}, buildErr
			}
			continue
		}
		rankingsByWindow[days] = result
	}
	currentRankings, ok := rankingsByWindow[30]
	if !ok {
		return Alpha65IntegrityView{}, errors.New("30-day ranking output is unavailable")
	}
	allProducts := []domain.ProductSnapshot{}
	allCatalogs := []domain.CatalogSnapshot{}
	for _, days := range []int{7, 30, 90} {
		result, exists := rankingsByWindow[days]
		if !exists {
			continue
		}
		for i := range result.ProductSnapshots {
			row := &result.ProductSnapshots[i]
			q, err := alpha65Quality(audit, run, comparableCount, "product", row.ProductID, true)
			if err != nil {
				return Alpha65IntegrityView{}, err
			}
			qualityRows = append(qualityRows, q)
			row.DataQualityScore, row.DataQualityGrade, row.DirectionStage = q.Score, q.Grade, stage
			row.IntegrityStatus, row.MarketMapRunID = domain.IntegrityStatusNativeAlpha65, run.ID
			if stage == domain.DirectionStageComposition {
				row.Direction = ""
			}
			provenance, err := s.alpha65ScoreProvenance(run, plan, priorID, audit, q, "product", row.ProductID, "opportunity", row.ModelVersion, row.OpportunityScore, row.CurrentObservationCount)
			if err != nil {
				return Alpha65IntegrityView{}, err
			}
			row.ProvenanceID = provenance.ID
			provenanceRows = append(provenanceRows, provenance)
			allProducts = append(allProducts, *row)
		}
		for i := range result.CatalogSnapshots {
			row := &result.CatalogSnapshots[i]
			q, err := alpha65Quality(audit, run, comparableCount, "catalog", row.CatalogID, false)
			if err != nil {
				return Alpha65IntegrityView{}, err
			}
			qualityRows = append(qualityRows, q)
			row.DataQualityScore, row.DataQualityGrade, row.DirectionStage = q.Score, q.Grade, stage
			row.IntegrityStatus, row.MarketMapRunID = domain.IntegrityStatusNativeAlpha65, run.ID
			if stage == domain.DirectionStageComposition {
				row.Direction = ""
			}
			provenance, err := s.alpha65ScoreProvenance(run, plan, priorID, audit, q, "catalog", row.CatalogID, "opportunity", row.ModelVersion, row.OpportunityScore, row.ObservedProducts)
			if err != nil {
				return Alpha65IntegrityView{}, err
			}
			row.ProvenanceID = provenance.ID
			provenanceRows = append(provenanceRows, provenance)
			allCatalogs = append(allCatalogs, *row)
		}
	}

	clusterProducts, err := s.clusterProductsForRun(run)
	if err != nil {
		return Alpha65IntegrityView{}, err
	}
	clustered := autopilot.BuildProductDirections(autopilot.ClusterInput{RunID: run.ID, Coverage: run.Coverage, AsOf: run.CompletedAt, Products: clusterProducts})
	for i := range clustered.Clusters {
		row := &clustered.Clusters[i]
		row.DataQualityScore, row.DataQualityGrade, row.DirectionStage = globalQuality.Score, globalQuality.Grade, stage
		row.IntegrityStatus = domain.IntegrityStatusNativeAlpha65
		if globalQuality.Grade == domain.DataQualityGradeD {
			row.NeedsReview = true
		}
		provenance, err := s.alpha65ScoreProvenance(run, plan, priorID, audit, globalQuality, "product_direction", row.ID, "product_direction_opportunity", row.ModelVersion, row.Opportunity, row.ProductCount)
		if err != nil {
			return Alpha65IntegrityView{}, err
		}
		row.ProvenanceID = provenance.ID
		provenanceRows = append(provenanceRows, provenance)
	}

	currentCatalogs := currentRankings.CatalogSnapshots
	currentProducts := currentRankings.ProductSnapshots
	for i := range currentCatalogs {
		for _, row := range allCatalogs {
			if row.CatalogID == currentCatalogs[i].CatalogID && row.Window.Days == 30 {
				currentCatalogs[i] = row
				break
			}
		}
	}
	for i := range currentProducts {
		for _, row := range allProducts {
			if row.ProductID == currentProducts[i].ProductID && row.Window.Days == 30 {
				currentProducts[i] = row
				break
			}
		}
	}

	insights := autopilot.BuildProductionInsights(autopilot.ProductionInsightInput{RunID: run.ID, Coverage: run.Coverage, Confidence: run.Confidence, Catalogs: currentCatalogs, Clusters: clustered.Clusters})
	for i := range insights {
		row := &insights[i]
		alpha65GateInsight(row, globalQuality, stage)
		provenance, err := s.alpha65ScoreProvenance(run, plan, priorID, audit, globalQuality, "production_insight", row.ID, "production_priority", row.ModelVersion, row.Priority, audit.TotalObservations)
		if err != nil {
			return Alpha65IntegrityView{}, err
		}
		row.ProvenanceID = provenance.ID
		provenanceRows = append(provenanceRows, provenance)
	}
	alerts := autopilot.BuildSaturationAlerts(autopilot.SaturationInput{RunID: run.ID, Catalogs: currentCatalogs})
	for i := range alerts {
		row := &alerts[i]
		row.DataQualityScore, row.DataQualityGrade, row.DirectionStage = globalQuality.Score, globalQuality.Grade, stage
		provenance, err := s.alpha65ScoreProvenance(run, plan, priorID, audit, globalQuality, "saturation_alert", row.ID, "saturation_signal", row.ModelVersion, row.Trend, audit.TotalObservations)
		if err != nil {
			return Alpha65IntegrityView{}, err
		}
		row.ProvenanceID = provenance.ID
		provenanceRows = append(provenanceRows, provenance)
	}

	// Publish visible records only after every quality/provenance check succeeds.
	if err := s.integrity.AppendDataQualityAssessments(qualityRows); err != nil {
		return Alpha65IntegrityView{}, err
	}
	if err := s.integrity.AppendScoreProvenances(provenanceRows); err != nil {
		return Alpha65IntegrityView{}, err
	}
	if err := s.integrity.AppendMarketIndexSnapshots(built.Hierarchy); err != nil {
		return Alpha65IntegrityView{}, err
	}
	if err := s.ranking.AppendProductSnapshots(allProducts); err != nil {
		return Alpha65IntegrityView{}, err
	}
	if err := s.ranking.AppendCatalogSnapshots(allCatalogs); err != nil {
		return Alpha65IntegrityView{}, err
	}
	if err := s.autopilot.AppendProductDirectionClusters(clustered.Clusters); err != nil {
		return Alpha65IntegrityView{}, err
	}
	if err := s.autopilot.AppendClassificationReviews(clustered.Reviews); err != nil {
		return Alpha65IntegrityView{}, err
	}
	if err := s.autopilot.AppendProductionInsights(insights); err != nil {
		return Alpha65IntegrityView{}, err
	}
	if err := s.autopilot.AppendSaturationAlerts(alerts); err != nil {
		return Alpha65IntegrityView{}, err
	}
	lifecycle := map[int][]domain.ProductSnapshot{}
	for _, row := range allProducts {
		lifecycle[row.Window.Days] = append(lifecycle[row.Window.Days], row)
	}
	if err := s.persistTrendLifecycle(run, priorID, lifecycle); err != nil {
		return Alpha65IntegrityView{}, err
	}

	direction := domain.MarketDirectionSnapshot{
		ID: stableIntegrityID("direction", run.ID), RunID: run.ID, PriorRunID: priorID, AsOf: run.CompletedAt,
		Temperature: built.Global.CompositionIndex, Direction: built.Global.Direction,
		Status: string(stage), CompositionOnly: stage == domain.DirectionStageComposition,
		Coverage: built.Global.Coverage, Confidence: built.Global.Confidence, ModelVersion: indexing.DirectionModelVersion,
	}
	if direction.CompositionOnly {
		direction.Direction, direction.Status = "composition_only", "composition_only"
		direction.ReasonCodes = []string{"CURRENT_COMPOSITION_ONLY"}
	}
	if err := s.autopilot.AppendMarketDirectionSnapshot(direction); err != nil {
		return Alpha65IntegrityView{}, err
	}
	run.RankingAsOf = currentRankings.Window.CurrentEnd
	run.DirectionAvailable = stage != domain.DirectionStageComposition
	run.DirectionStage = stage
	run.ComparableRunCount = comparableCount
	run.SampleAuditID = audit.ID
	run.GlobalIndexID = built.Global.ID
	run.IntegrityStatus = domain.IntegrityStatusNativeAlpha65
	if err := s.autopilot.AppendMarketMapRun(run); err != nil {
		return Alpha65IntegrityView{}, err
	}
	targets, err := s.integrity.MarketMapTargetResults(run.ID)
	if err != nil {
		return Alpha65IntegrityView{}, err
	}
	surfaceRows, err := s.autopilot.MarketSurfaceObservations(run.ID)
	if err != nil {
		return Alpha65IntegrityView{}, err
	}
	return Alpha65IntegrityView{
		Run: run, SampleAudit: audit, GlobalIndex: built.Global, IndexHierarchy: built.Hierarchy,
		DataQuality: qualityRows, SurfaceBreakdown: alpha65SurfaceBreakdown(audit, targets, surfaceRows),
		Catalogs: currentCatalogs, Products: currentProducts, ComparableRuns: comparableCount,
	}, nil
}

func (s *Service) loadIntegritySummary(runID string) (*domain.IntegritySummary, error) {
	audit, ok, err := s.integrity.LatestSampleAudit(runID)
	if err != nil || !ok {
		return nil, err
	}
	indices, err := s.integrity.MarketIndexSnapshots(domain.MarketIndexFilter{RunID: runID, IntegrityStatus: domain.IntegrityStatusNativeAlpha65})
	if err != nil || len(indices) == 0 {
		return nil, err
	}
	global := indices[0]
	for _, row := range indices {
		if row.Level == domain.SegmentLevelGlobal && row.EntityID == "global" {
			global = row
			break
		}
	}
	qualities, err := s.integrity.DataQualityAssessments(domain.DataQualityFilter{RunID: runID})
	if err != nil {
		return nil, err
	}
	targets, err := s.integrity.MarketMapTargetResults(runID)
	if err != nil {
		return nil, err
	}
	surfaces, err := s.autopilot.MarketSurfaceObservations(runID)
	if err != nil {
		return nil, err
	}
	reviews, err := s.integrity.LegacyClassificationReviews(domain.LegacyClassificationReviewFilter{})
	if err != nil {
		return nil, err
	}
	return &domain.IntegritySummary{
		SampleAudit: audit, GlobalIndex: global, IndexHierarchy: indices, DataQuality: qualities,
		SurfaceBreakdown: alpha65SurfaceBreakdown(audit, targets, surfaces),
		ComparableRuns:   global.ComparableRuns, LegacyReviewCount: len(reviews),
	}, nil
}
