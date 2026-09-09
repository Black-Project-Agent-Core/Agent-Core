package app

import (
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"marketsignallab/internal/domain"
	evidencepkg "marketsignallab/internal/evidence"
)

const (
	c3CatalogSnapshotModel = "catalog-snapshot-v0.2"
	c3ProductSnapshotModel = "product-snapshot-v0.2"
	c3StructuralIndexModel = "volume-weighted-market-index-v0.1"
)

func (s *Service) EvidenceRequirements() []domain.SignalEvidenceRequirement {
	return evidencepkg.Requirements()
}

func (s *Service) EvidenceAssessments(filter domain.SignalEvidenceAssessmentFilter) ([]domain.SignalEvidenceAssessmentRecord, error) {
	return s.store.SignalEvidenceAssessments(filter)
}

func (s *Service) EvidenceAssessment(filter domain.SignalEvidenceAssessmentFilter) (domain.SignalEvidenceAssessmentRecord, bool, error) {
	return s.store.LatestSignalEvidenceAssessment(filter)
}

func (s *Service) BuildEvidenceAssessments(runID string) (domain.EvidenceBuildResult, error) {
	runID = strings.TrimSpace(runID)
	if runID == "" {
		return domain.EvidenceBuildResult{}, errors.New("runId is required")
	}
	current, ok, err := s.autopilot.MarketMapRunByID(runID)
	if err != nil {
		return domain.EvidenceBuildResult{}, err
	}
	if !ok {
		return domain.EvidenceBuildResult{}, fmt.Errorf("market map run %q not found", runID)
	}
	if current.Status != domain.MarketMapRunCompleted {
		return domain.EvidenceBuildResult{}, fmt.Errorf("market map run %q must be completed before evidence assessment", runID)
	}
	currentPlan, ok, err := s.autopilot.MarketMapPlanByID(current.PlanID)
	if err != nil {
		return domain.EvidenceBuildResult{}, err
	}
	if !ok {
		return domain.EvidenceBuildResult{}, fmt.Errorf("market map plan %q for run %q not found", current.PlanID, runID)
	}

	prior, priorPlan, hasPrior, err := s.evidencePriorRun(current)
	if err != nil {
		return domain.EvidenceBuildResult{}, err
	}

	catalogRows, err := s.ranking.CatalogSnapshots(domain.CatalogSnapshotFilter{})
	if err != nil {
		return domain.EvidenceBuildResult{}, err
	}
	productRows, err := s.ranking.ProductSnapshots(domain.ProductSnapshotFilter{})
	if err != nil {
		return domain.EvidenceBuildResult{}, err
	}
	indexRows, err := s.integrity.MarketIndexSnapshots(domain.MarketIndexFilter{RunID: current.ID})
	if err != nil {
		return domain.EvidenceBuildResult{}, err
	}
	nodes, err := s.universe.CatalogNodes()
	if err != nil {
		return domain.EvidenceBuildResult{}, err
	}

	currentCatalogs := latestC3CatalogSnapshotsForRun(catalogRows, current)
	currentProducts := latestC3ProductSnapshotsForRun(productRows, current)
	currentIndexes := latestC3IndexSnapshotsForRun(indexRows, current)
	nodeByID := make(map[string]domain.CatalogNode, len(nodes))
	for _, node := range nodes {
		nodeByID[node.ID] = node
	}

	priorCatalogByIdentity := map[string]domain.CatalogSnapshot{}
	if hasPrior {
		priorCatalogs := latestC3CatalogSnapshotsForRun(catalogRows, prior)
		for _, row := range priorCatalogs {
			priorCatalogByIdentity[catalogSnapshotIdentity(row)] = row
		}
	}

	records := make([]domain.SignalEvidenceAssessmentRecord, 0, len(currentCatalogs)*3+len(currentProducts)+len(currentIndexes))
	for _, catalog := range currentCatalogs {
		movementFacts := evidenceMovementFacts(current, currentPlan, prior, priorPlan, hasPrior, catalog, priorCatalogByIdentity[catalogSnapshotIdentity(catalog)])

		breadthContext := evidenceAssessmentContext(
			current.ID, "catalog", catalog.CatalogID,
			"catalog.directional_breadth.v0.1", catalog.ModelVersion,
			catalog.ProvenanceID, firstNonEmpty(catalog.ObservedAt, current.CompletedAt),
		)
		breadthCandidate, err := evidencepkg.NewCatalogDirectionalBreadthCandidate(catalog, breadthContext, movementFacts)
		if err != nil {
			return domain.EvidenceBuildResult{}, err
		}
		breadthRecord, err := evaluateEvidenceCandidate(breadthCandidate)
		if err != nil {
			return domain.EvidenceBuildResult{}, err
		}
		records = append(records, breadthRecord)

		momentumFacts := movementFacts
		if _, hasPriorSnapshot := priorCatalogByIdentity[catalogSnapshotIdentity(catalog)]; hasPriorSnapshot {
			stable := true
			momentumFacts.StableMeasureDefinition = &stable
		}
		momentumContext := evidenceAssessmentContext(
			current.ID, "catalog", catalog.CatalogID,
			"catalog.competition_momentum.v0.1", catalog.ModelVersion,
			catalog.ProvenanceID, firstNonEmpty(catalog.ObservedAt, current.CompletedAt),
		)
		momentumCandidate, err := evidencepkg.NewCatalogCompetitionMomentumCandidate(catalog, momentumContext, momentumFacts)
		if err != nil {
			return domain.EvidenceBuildResult{}, err
		}
		momentumRecord, err := evaluateEvidenceCandidate(momentumCandidate)
		if err != nil {
			return domain.EvidenceBuildResult{}, err
		}
		records = append(records, momentumRecord)

		node, ok := nodeByID[catalog.CatalogID]
		if !ok {
			return domain.EvidenceBuildResult{}, fmt.Errorf("catalog node %q required for C3 catalog PRR peer universe", catalog.CatalogID)
		}
		underlying := movementEvidenceStage(movementFacts)
		peerCount := catalogPeerGroupSize(catalog, currentCatalogs, nodeByID)
		catalogPRRFacts := evidencepkg.EvidenceFacts{PeerGroupSize: &peerCount, UnderlyingStage: &underlying}
		catalogPRRContext := evidenceAssessmentContext(
			current.ID, "catalog", catalog.CatalogID,
			"catalog.peer_relative_rank.v0.1", catalog.ModelVersion,
			catalog.ProvenanceID, firstNonEmpty(catalog.ObservedAt, current.CompletedAt),
		)
		catalogPRRCandidate, err := evidencepkg.NewCatalogPRRCandidate(catalog, node, catalogPRRContext, catalogPRRFacts)
		if err != nil {
			return domain.EvidenceBuildResult{}, err
		}
		catalogPRRRecord, err := evaluateEvidenceCandidate(catalogPRRCandidate)
		if err != nil {
			return domain.EvidenceBuildResult{}, err
		}
		records = append(records, catalogPRRRecord)
	}

	for _, product := range currentProducts {
		peerCount := productPeerGroupSize(product, currentProducts)
		facts := evidencepkg.EvidenceFacts{PeerGroupSize: &peerCount}
		ctx := evidenceAssessmentContext(
			current.ID, "product", product.ProductID,
			"product.peer_relative_rank.v0.1", product.ModelVersion,
			product.ProvenanceID, firstNonEmpty(product.ObservedAt, current.CompletedAt),
		)
		candidate, err := evidencepkg.NewProductPRRCandidate(product, ctx, facts)
		if err != nil {
			return domain.EvidenceBuildResult{}, err
		}
		record, err := evaluateEvidenceCandidate(candidate)
		if err != nil {
			return domain.EvidenceBuildResult{}, err
		}
		records = append(records, record)
	}

	for _, index := range currentIndexes {
		entityType := string(index.Level)
		if entityType == "" {
			entityType = "segment"
		}
		ctx := evidenceAssessmentContext(
			current.ID, entityType, index.EntityID,
			"structural.observed_segment_composition.v0.1", index.ModelVersion,
			index.ProvenanceID, firstNonEmpty(index.GeneratedAt, current.CompletedAt),
		)
		candidate, err := evidencepkg.NewStructuralCompositionCandidate(index, ctx, evidencepkg.EvidenceFacts{})
		if err != nil {
			return domain.EvidenceBuildResult{}, err
		}
		record, err := evaluateEvidenceCandidate(candidate)
		if err != nil {
			return domain.EvidenceBuildResult{}, err
		}
		records = append(records, record)
	}

	sort.Slice(records, func(i, j int) bool {
		if records[i].EntityType != records[j].EntityType {
			return records[i].EntityType < records[j].EntityType
		}
		if records[i].EntityID != records[j].EntityID {
			return records[i].EntityID < records[j].EntityID
		}
		if records[i].SignalID != records[j].SignalID {
			return records[i].SignalID < records[j].SignalID
		}
		return records[i].AssessmentID < records[j].AssessmentID
	})

	if err := s.store.AppendSignalEvidenceAssessments(records); err != nil {
		return domain.EvidenceBuildResult{}, err
	}
	return domain.EvidenceBuildResult{
		RunID:           current.ID,
		AssessmentCount: len(records),
		Persisted:       true,
		Assessments:     records,
	}, nil
}

func (s *Service) evidencePriorRun(current domain.MarketMapRun) (domain.MarketMapRun, domain.MarketMapPlan, bool, error) {
	runs, err := s.autopilot.MarketMapRuns()
	if err != nil {
		return domain.MarketMapRun{}, domain.MarketMapPlan{}, false, err
	}
	currentKey := evidenceRunOrderKey(current)
	var prior domain.MarketMapRun
	found := false
	for _, row := range runs {
		if row.ID == current.ID || row.Status != domain.MarketMapRunCompleted {
			continue
		}
		rowKey := evidenceRunOrderKey(row)
		if rowKey == "" || (currentKey != "" && rowKey >= currentKey) {
			continue
		}
		if !found || rowKey > evidenceRunOrderKey(prior) {
			prior = row
			found = true
		}
	}
	if !found {
		return domain.MarketMapRun{}, domain.MarketMapPlan{}, false, nil
	}
	plan, ok, err := s.autopilot.MarketMapPlanByID(prior.PlanID)
	if err != nil {
		return domain.MarketMapRun{}, domain.MarketMapPlan{}, false, err
	}
	if !ok {
		return domain.MarketMapRun{}, domain.MarketMapPlan{}, false, nil
	}
	return prior, plan, true, nil
}

func evidenceRunOrderKey(run domain.MarketMapRun) string {
	if strings.TrimSpace(run.CompletedAt) != "" {
		return run.CompletedAt
	}
	return run.StartedAt
}

func latestC3CatalogSnapshotsForRun(rows []domain.CatalogSnapshot, run domain.MarketMapRun) []domain.CatalogSnapshot {
	latest := map[string]domain.CatalogSnapshot{}
	for _, row := range rows {
		if row.MarketMapRunID != run.ID || row.ModelVersion != c3CatalogSnapshotModel {
			continue
		}
		if run.RankingAsOf != "" && row.Window.CurrentEnd != run.RankingAsOf {
			continue
		}
		key := catalogSnapshotIdentity(row)
		if current, ok := latest[key]; !ok || row.Window.CurrentEnd > current.Window.CurrentEnd {
			latest[key] = row
		}
	}
	out := make([]domain.CatalogSnapshot, 0, len(latest))
	for _, row := range latest {
		out = append(out, row)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].CatalogID != out[j].CatalogID {
			return out[i].CatalogID < out[j].CatalogID
		}
		return out[i].ModelVersion < out[j].ModelVersion
	})
	return out
}

func latestC3ProductSnapshotsForRun(rows []domain.ProductSnapshot, run domain.MarketMapRun) []domain.ProductSnapshot {
	latest := map[string]domain.ProductSnapshot{}
	for _, row := range rows {
		if row.MarketMapRunID != run.ID || row.ModelVersion != c3ProductSnapshotModel {
			continue
		}
		if run.RankingAsOf != "" && row.Window.CurrentEnd != run.RankingAsOf {
			continue
		}
		key := row.ProductID + "\x1f" + row.ModelVersion
		if current, ok := latest[key]; !ok || row.Window.CurrentEnd > current.Window.CurrentEnd {
			latest[key] = row
		}
	}
	out := make([]domain.ProductSnapshot, 0, len(latest))
	for _, row := range latest {
		out = append(out, row)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].ProductID != out[j].ProductID {
			return out[i].ProductID < out[j].ProductID
		}
		return out[i].ModelVersion < out[j].ModelVersion
	})
	return out
}

func latestC3IndexSnapshotsForRun(rows []domain.MarketIndexSnapshot, run domain.MarketMapRun) []domain.MarketIndexSnapshot {
	latest := map[string]domain.MarketIndexSnapshot{}
	for _, row := range rows {
		if row.RunID != run.ID || row.ModelVersion != c3StructuralIndexModel {
			continue
		}
		key := row.EntityID + "\x1f" + string(row.Level) + "\x1f" + row.ModelVersion
		if current, ok := latest[key]; !ok || row.GeneratedAt > current.GeneratedAt {
			latest[key] = row
		}
	}
	out := make([]domain.MarketIndexSnapshot, 0, len(latest))
	for _, row := range latest {
		out = append(out, row)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].EntityID != out[j].EntityID {
			return out[i].EntityID < out[j].EntityID
		}
		return out[i].Level < out[j].Level
	})
	return out
}

func catalogSnapshotIdentity(row domain.CatalogSnapshot) string {
	return row.CatalogID + "\x1f" + row.ModelVersion
}

func evidenceMovementFacts(
	current domain.MarketMapRun,
	currentPlan domain.MarketMapPlan,
	prior domain.MarketMapRun,
	priorPlan domain.MarketMapPlan,
	hasPrior bool,
	currentSnapshot domain.CatalogSnapshot,
	priorSnapshot domain.CatalogSnapshot,
) evidencepkg.EvidenceFacts {
	count := 1
	facts := evidencepkg.EvidenceFacts{ComparableWindowCount: &count}
	if !hasPrior {
		return facts
	}
	priorDuration := time.Duration(0)
	if priorSnapshot.MarketMapRunID == prior.ID && priorSnapshot.ModelVersion == currentSnapshot.ModelVersion {
		count = 2
		facts.ComparableWindowCount = &count
		priorDuration = rankingWindowDuration(priorSnapshot.Window)
	}
	scope := evidencepkg.CompareScope(
		evidencepkg.ScopeDescriptor{TemporalComparison: true, Run: current, Plan: currentPlan, WindowDuration: rankingWindowDuration(currentSnapshot.Window)},
		evidencepkg.ScopeDescriptor{TemporalComparison: true, Run: prior, Plan: priorPlan, WindowDuration: priorDuration},
		evidencepkg.ProductionScopeCompatibilityDeclarations(),
	)
	facts.ScopeComparability = &scope
	return facts
}

func rankingWindowDuration(window domain.RankingWindow) time.Duration {
	if window.Days <= 0 {
		return 0
	}
	return time.Duration(window.Days) * 24 * time.Hour
}

func movementEvidenceStage(facts evidencepkg.EvidenceFacts) domain.EvidenceStage {
	in := evidencepkg.StageInput{ClaimType: domain.ClaimTypeMovement}
	if facts.ComparableWindowCount != nil {
		in.ComparableWindowCount = *facts.ComparableWindowCount
	}
	if facts.ScopeComparability != nil {
		in.ScopeComparable = facts.ScopeComparability.Status == domain.ScopeComparabilityExactMatch ||
			facts.ScopeComparability.Status == domain.ScopeComparabilityDeclaredCompatible
		if facts.ScopeComparability.WindowDurationComparable != nil {
			in.WindowDurationComparable = *facts.ScopeComparability.WindowDurationComparable
		}
	}
	stage, _ := evidencepkg.MaximumStage(in)
	return stage
}

func productPeerGroupSize(target domain.ProductSnapshot, rows []domain.ProductSnapshot) int {
	count := 0
	for _, row := range rows {
		if row.MarketMapRunID == target.MarketMapRunID &&
			row.CatalogID == target.CatalogID &&
			row.ModelVersion == target.ModelVersion &&
			row.Window.Days == target.Window.Days &&
			row.Window.CurrentEnd == target.Window.CurrentEnd {
			count++
		}
	}
	return count
}

func catalogPeerGroupSize(target domain.CatalogSnapshot, rows []domain.CatalogSnapshot, nodes map[string]domain.CatalogNode) int {
	targetNode, ok := nodes[target.CatalogID]
	if !ok {
		return 0
	}
	count := 0
	for _, row := range rows {
		if row.MarketMapRunID != target.MarketMapRunID || row.ModelVersion != target.ModelVersion || row.Window.Days != target.Window.Days || row.Window.CurrentEnd != target.Window.CurrentEnd {
			continue
		}
		node, ok := nodes[row.CatalogID]
		if !ok {
			continue
		}
		if node.Platform == targetNode.Platform && node.ContentType == targetNode.ContentType && node.Level == targetNode.Level {
			count++
		}
	}
	return count
}

func evidenceAssessmentContext(runID, entityType, entityID, signalID, modelVersion, provenanceID, assessedAt string) evidencepkg.AssessmentContext {
	return evidencepkg.AssessmentContext{
		AssessmentID: evidencepkg.AssessmentID(runID, entityType, entityID, signalID, modelVersion, evidencepkg.RequirementsVersion),
		EntityType:   entityType,
		EntityID:     entityID,
		RunID:        runID,
		ProvenanceID: provenanceID,
		AssessedAt:   assessedAt,
	}
}

func evaluateEvidenceCandidate(candidate evidencepkg.EvidenceCandidate) (domain.SignalEvidenceAssessmentRecord, error) {
	result, err := evidencepkg.Evaluate(candidate.Requirement, candidate.Context, candidate.Facts, candidate.Value)
	if err != nil {
		return domain.SignalEvidenceAssessmentRecord{}, err
	}
	return domain.SignalEvidenceAssessmentRecord{
		AssessmentID:        result.Evidence.AssessmentID,
		RunID:               result.Evidence.RunID,
		EntityType:          result.Evidence.EntityType,
		EntityID:            result.Evidence.EntityID,
		SignalID:            result.SignalID,
		SignalModelVersion:  result.SignalModelVersion,
		RequirementsVersion: result.Evidence.RequirementsVersion,
		ValuePresent:        result.Value != nil,
		Value:               result.Value,
		Assessment:          result.Evidence,
		ProvenanceID:        result.Evidence.ProvenanceID,
		AssessedAt:          result.Evidence.AssessedAt,
	}, nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
