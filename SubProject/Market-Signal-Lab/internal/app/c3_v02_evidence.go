package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"sort"
	"strings"

	analyticsenginepkg "marketsignallab/internal/analyticsengine"
	"marketsignallab/internal/domain"
	evidencepkg "marketsignallab/internal/evidence"
)

type c31RunPlan struct {
	Run  domain.MarketMapRun
	Plan domain.MarketMapPlan
}

func (s *Service) EvidenceRequirementsVersion(version string) ([]domain.SignalEvidenceRequirement, error) {
	if strings.TrimSpace(version) == "" {
		version = evidencepkg.RequirementsVersion
	}
	return evidencepkg.RequirementsForVersion(version)
}

func (s *Service) BuildEvidenceAssessmentsC31(runID string) (domain.EvidenceBuildResult, error) {
	runID = strings.TrimSpace(runID)
	if runID == "" {
		return domain.EvidenceBuildResult{}, errors.New("runId is required")
	}
	if s.analyticsRuntime == nil {
		return domain.EvidenceBuildResult{}, analyticsenginepkg.ErrRuntimeUnavailable
	}
	chain, err := s.c31RunChain(runID)
	if err != nil {
		return domain.EvidenceBuildResult{}, err
	}
	current := chain[0]

	catalogRows, err := s.ranking.CatalogSnapshots(domain.CatalogSnapshotFilter{})
	if err != nil {
		return domain.EvidenceBuildResult{}, err
	}
	nodes, err := s.universe.CatalogNodes()
	if err != nil {
		return domain.EvidenceBuildResult{}, err
	}
	nodeByID := make(map[string]domain.CatalogNode, len(nodes))
	for _, node := range nodes {
		nodeByID[node.ID] = node
	}

	currentCatalogs := latestC3CatalogSnapshotsForRun(catalogRows, current.Run)
	currentByID := c31CatalogMap(currentCatalogs)
	priorByID := map[string]domain.CatalogSnapshot{}
	olderByID := map[string]domain.CatalogSnapshot{}
	if len(chain) >= 2 {
		priorByID = c31CatalogMap(latestC3CatalogSnapshotsForRun(catalogRows, chain[1].Run))
	}
	if len(chain) >= 3 {
		olderByID = c31CatalogMap(latestC3CatalogSnapshotsForRun(catalogRows, chain[2].Run))
	}

	records := make([]domain.SignalEvidenceAssessmentRecord, 0, len(currentCatalogs)*5+len(nodes)*4)
	odmiByCatalog := make(map[string]domain.SignalEvidenceAssessmentRecord, len(currentCatalogs))

	// Pass 1: peer-independent values only.
	for _, snapshot := range currentCatalogs {
		priorSnapshot, hasPriorSnapshot := priorByID[snapshot.CatalogID]
		olderSnapshot, hasOlderSnapshot := olderByID[snapshot.CatalogID]
		movementFacts := c31MovementFacts(chain, snapshot, priorSnapshot, hasPriorSnapshot)
		movementFacts.ObservedProducts = intpApp(snapshot.ObservedProducts)
		movementFacts.ComparableProducts = intpApp(snapshot.ComparableProducts)

		var momentum *analyticsenginepkg.DirectionalMomentumV02Result
		if snapshot.ComparableProducts > 0 && snapshot.RisingProducts >= 0 && snapshot.NeutralProducts >= 0 && snapshot.FallingProducts >= 0 {
			result, err := analyticsenginepkg.ExecuteDirectionalMomentumV02(context.Background(), s.analyticsRuntime, analyticsenginepkg.DirectionalMomentumV02Input{
				Rising: int64(snapshot.RisingProducts), Neutral: int64(snapshot.NeutralProducts), Falling: int64(snapshot.FallingProducts),
			})
			if err != nil {
				return domain.EvidenceBuildResult{}, fmt.Errorf("catalog %q C3.1 directional momentum: %w", snapshot.CatalogID, err)
			}
			momentum = &result
		}
		odmiRecord, err := s.c31Record(current.Run, snapshot.CatalogID, "catalog", "catalog.odmi.v0.2", evidencepkg.DirectionalMomentumModelV02, c31MomentumValue(momentum, true), movementFacts, c31ProvenanceID("odmi", snapshot.ProvenanceID, current.Run.ID))
		if err != nil {
			return domain.EvidenceBuildResult{}, err
		}
		records = append(records, odmiRecord)
		odmiByCatalog[snapshot.CatalogID] = odmiRecord

		magnitudeRecord, err := s.c31Record(current.Run, snapshot.CatalogID, "catalog", "catalog.momentum_magnitude.v0.2", evidencepkg.DirectionalMomentumModelV02, c31MomentumValue(momentum, false), movementFacts, c31ProvenanceID("magnitude", snapshot.ProvenanceID, current.Run.ID))
		if err != nil {
			return domain.EvidenceBuildResult{}, err
		}
		records = append(records, magnitudeRecord)

		accelFacts := c31AccelerationFacts(chain, snapshot, priorSnapshot, hasPriorSnapshot, olderSnapshot, hasOlderSnapshot)
		var accelerationValue *float64
		var accelerationReasons []domain.ReasonCode
		if hasPriorSnapshot && hasOlderSnapshot && len(chain) >= 3 {
			result, err := analyticsenginepkg.ExecuteCompetitionAccelerationV02(context.Background(), s.analyticsRuntime, analyticsenginepkg.CompetitionAccelerationV02Input{
				OlderCount: int64(olderSnapshot.ObservedProducts), PriorCount: int64(priorSnapshot.ObservedProducts), CurrentCount: int64(snapshot.ObservedProducts),
			})
			if err != nil {
				return domain.EvidenceBuildResult{}, fmt.Errorf("catalog %q C3.1 competition acceleration: %w", snapshot.CatalogID, err)
			}
			accelerationValue = floatpApp(result.Acceleration)
			if result.ZeroBaselineFlags != 0 {
				accelerationReasons = append(accelerationReasons, domain.ReasonZeroBaselineDelta)
			}
		}
		accelFacts.FactualReasonCodes = append(accelFacts.FactualReasonCodes, accelerationReasons...)
		accelRecord, err := s.c31Record(current.Run, snapshot.CatalogID, "catalog", "catalog.competition_acceleration.v0.2", evidencepkg.CompetitionAccelerationModelV02, accelerationValue, accelFacts, c31ProvenanceID("acceleration", snapshot.ProvenanceID, priorSnapshot.ProvenanceID, olderSnapshot.ProvenanceID))
		if err != nil {
			return domain.EvidenceBuildResult{}, err
		}
		records = append(records, accelRecord)

		authorFacts := movementFacts
		stable := hasPriorSnapshot && priorSnapshot.ModelVersion == snapshot.ModelVersion
		authorFacts.StableMeasureDefinition = &stable
		attributionPresent := hasPriorSnapshot && snapshot.ObservedProducts > 0 && priorSnapshot.ObservedProducts > 0 && snapshot.AuthorAttributionCoverage > 0 && priorSnapshot.AuthorAttributionCoverage > 0
		authorFacts.AttributionPresent = &attributionPresent
		authorFacts.AttributionCoverage = floatpApp(snapshot.AuthorAttributionCoverage)
		var authorValue *float64
		if attributionPresent {
			result, err := analyticsenginepkg.ExecuteAuthorConcentrationChangeV02(context.Background(), s.analyticsRuntime, analyticsenginepkg.AuthorConcentrationChangeV02Input{Prior: priorSnapshot.AuthorConcentration, Current: snapshot.AuthorConcentration})
			if err != nil {
				return domain.EvidenceBuildResult{}, fmt.Errorf("catalog %q C3.1 author concentration change: %w", snapshot.CatalogID, err)
			}
			authorValue = floatpApp(result.Change)
		}
		authorRecord, err := s.c31Record(current.Run, snapshot.CatalogID, "catalog", "catalog.author_concentration_change.v0.2", evidencepkg.AuthorConcentrationChangeModelV02, authorValue, authorFacts, c31ProvenanceID("author-concentration", snapshot.ProvenanceID, priorSnapshot.ProvenanceID))
		if err != nil {
			return domain.EvidenceBuildResult{}, err
		}
		records = append(records, authorRecord)
	}

	// Pass 2a: PRR ranks only non-suppressed ODMI values in the same sibling peer universe.
	peerGroups := c31ODMIEligiblePeerGroups(currentCatalogs, odmiByCatalog, nodeByID)
	for _, snapshot := range currentCatalogs {
		node, ok := nodeByID[snapshot.CatalogID]
		if !ok {
			return domain.EvidenceBuildResult{}, fmt.Errorf("catalog node %q required for C3.1 ODMI peer universe", snapshot.CatalogID)
		}
		groupKey := c31PeerKey(node)
		group := peerGroups[groupKey]
		peerCount := len(group)
		underlying := odmiByCatalog[snapshot.CatalogID].Assessment.EvidenceStage
		facts := evidencepkg.EvidenceFacts{PeerGroupSize: &peerCount, UnderlyingStage: &underlying}
		var prrValue *float64
		if odmi := odmiByCatalog[snapshot.CatalogID]; odmi.Assessment.Eligibility != domain.SignalEligibilitySuppressed && odmi.Value != nil && peerCount >= 2 {
			values := make([]float64, len(group))
			subjectIndex := -1
			for i, peer := range group {
				values[i] = *peer.Record.Value
				if peer.CatalogID == snapshot.CatalogID {
					subjectIndex = i
				}
			}
			if subjectIndex >= 0 {
				result, err := analyticsenginepkg.ExecutePeerRelativeRankV02(context.Background(), s.analyticsRuntime, analyticsenginepkg.PeerRelativeRankV02Input{SubjectIndex: uint32(subjectIndex), Values: values})
				if err != nil {
					return domain.EvidenceBuildResult{}, fmt.Errorf("catalog %q C3.1 ODMI PRR: %w", snapshot.CatalogID, err)
				}
				prrValue = floatpApp(result.Percentile)
			}
		}
		prrRecord, err := s.c31Record(current.Run, snapshot.CatalogID, "catalog", "catalog.peer_relative_rank_odmi.v0.2", evidencepkg.PeerRelativeRankModelV02, prrValue, facts, c31ProvenanceID("odmi-prr", snapshot.ProvenanceID, groupKey))
		if err != nil {
			return domain.EvidenceBuildResult{}, err
		}
		records = append(records, prrRecord)
	}

	// Pass 2b: direct-parent movement aggregates consume only non-suppressed ODMI records.
	for _, aggregate := range c31MovementGroups(nodes, currentByID, odmiByCatalog) {
		facts := aggregate.Facts
		var result *analyticsenginepkg.MovementDivergenceV02Result
		if len(aggregate.Children) > 0 {
			computed, err := analyticsenginepkg.ExecuteMovementDivergenceV02(context.Background(), s.analyticsRuntime, analyticsenginepkg.MovementDivergenceV02Input{TotalChildCount: uint32(aggregate.TotalChildCount), Children: aggregate.Children})
			if err != nil {
				return domain.EvidenceBuildResult{}, fmt.Errorf("entity %q C3.1 movement divergence: %w", aggregate.Parent.ID, err)
			}
			result = &computed
			facts.EligibleChildShare = floatpApp(computed.SegmentMovementParticipation)
		}
		values := []struct {
			signal string
			value  *float64
		}{
			{"structural.product_mass_weighted_movement.v0.2", c31MovementValue(result, "weighted", len(aggregate.Children))},
			{"structural.equal_segment_movement.v0.2", c31MovementValue(result, "equal", len(aggregate.Children))},
			{"structural.signed_movement_divergence.v0.2", c31MovementValue(result, "signed", len(aggregate.Children))},
			{"structural.divergence_magnitude.v0.2", c31MovementValue(result, "magnitude", len(aggregate.Children))},
		}
		for _, item := range values {
			record, err := s.c31Record(current.Run, aggregate.Parent.ID, string(aggregate.Parent.Level), item.signal, evidencepkg.MovementDivergenceModelV02, item.value, facts, c31ProvenanceID("movement", current.Run.ID, aggregate.Parent.ID))
			if err != nil {
				return domain.EvidenceBuildResult{}, err
			}
			records = append(records, record)
		}
	}

	sortEvidenceRecords(records)
	if err := s.store.AppendSignalEvidenceAssessments(records); err != nil {
		return domain.EvidenceBuildResult{}, err
	}
	return domain.EvidenceBuildResult{RunID: current.Run.ID, AssessmentCount: len(records), Persisted: true, Assessments: records}, nil
}

func (s *Service) c31RunChain(runID string) ([]c31RunPlan, error) {
	current, ok, err := s.autopilot.MarketMapRunByID(runID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("market map run %q not found", runID)
	}
	if current.Status != domain.MarketMapRunCompleted {
		return nil, fmt.Errorf("market map run %q must be completed before C3.1 evidence assessment", runID)
	}
	plan, ok, err := s.autopilot.MarketMapPlanByID(current.PlanID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, fmt.Errorf("market map plan %q for run %q not found", current.PlanID, runID)
	}
	out := []c31RunPlan{{Run: current, Plan: plan}}
	cursor := current
	for len(out) < 3 {
		prior, priorPlan, found, err := s.evidencePriorRun(cursor)
		if err != nil {
			return nil, err
		}
		if !found {
			break
		}
		out = append(out, c31RunPlan{Run: prior, Plan: priorPlan})
		cursor = prior
	}
	return out, nil
}

func (s *Service) c31Record(run domain.MarketMapRun, entityID, entityType, signalID, model string, value *float64, facts evidencepkg.EvidenceFacts, provenanceID string) (domain.SignalEvidenceAssessmentRecord, error) {
	ctx := evidencepkg.AssessmentContext{
		AssessmentID: evidencepkg.AssessmentID(run.ID, entityType, entityID, signalID, model, evidencepkg.RequirementsVersionC31),
		EntityType:   entityType, EntityID: entityID, RunID: run.ID, ProvenanceID: provenanceID, AssessedAt: firstNonEmpty(run.CompletedAt, run.StartedAt),
	}
	candidate, err := evidencepkg.NewDeterministicSignalV02Candidate(evidencepkg.DeterministicSignalV02Source{
		SignalID: signalID, SignalModelVersion: model, RunID: run.ID, EntityType: entityType, EntityID: entityID, ProvenanceID: provenanceID, Value: value,
	}, ctx, facts)
	if err != nil {
		return domain.SignalEvidenceAssessmentRecord{}, err
	}
	return evaluateEvidenceCandidate(candidate)
}

func c31CatalogMap(rows []domain.CatalogSnapshot) map[string]domain.CatalogSnapshot {
	out := make(map[string]domain.CatalogSnapshot, len(rows))
	for _, row := range rows {
		out[row.CatalogID] = row
	}
	return out
}

func c31MovementFacts(chain []c31RunPlan, current domain.CatalogSnapshot, prior domain.CatalogSnapshot, hasPrior bool) evidencepkg.EvidenceFacts {
	count := 1
	facts := evidencepkg.EvidenceFacts{ComparableWindowCount: &count}
	if !hasPrior || len(chain) < 2 {
		return facts
	}
	count = 2
	facts.ComparableWindowCount = &count
	scope := evidencepkg.CompareScope(
		evidencepkg.ScopeDescriptor{TemporalComparison: true, Run: chain[0].Run, Plan: chain[0].Plan, WindowDuration: rankingWindowDuration(current.Window)},
		evidencepkg.ScopeDescriptor{TemporalComparison: true, Run: chain[1].Run, Plan: chain[1].Plan, WindowDuration: rankingWindowDuration(prior.Window)},
		evidencepkg.ProductionScopeCompatibilityDeclarations(),
	)
	facts.ScopeComparability = &scope
	return facts
}

func c31AccelerationFacts(chain []c31RunPlan, current, prior domain.CatalogSnapshot, hasPrior bool, older domain.CatalogSnapshot, hasOlder bool) evidencepkg.EvidenceFacts {
	facts := c31MovementFacts(chain, current, prior, hasPrior)
	stable := hasPrior && hasOlder && current.ModelVersion == prior.ModelVersion && prior.ModelVersion == older.ModelVersion
	facts.StableMeasureDefinition = &stable
	if !hasPrior || !hasOlder || len(chain) < 3 {
		return facts
	}
	count := 3
	facts.ComparableWindowCount = &count
	first := facts.ScopeComparability
	second := evidencepkg.CompareScope(
		evidencepkg.ScopeDescriptor{TemporalComparison: true, Run: chain[1].Run, Plan: chain[1].Plan, WindowDuration: rankingWindowDuration(prior.Window)},
		evidencepkg.ScopeDescriptor{TemporalComparison: true, Run: chain[2].Run, Plan: chain[2].Plan, WindowDuration: rankingWindowDuration(older.Window)},
		evidencepkg.ProductionScopeCompatibilityDeclarations(),
	)
	combined := c31CombineComparability(first, &second)
	facts.ScopeComparability = &combined
	return facts
}

func c31CombineComparability(a, b *domain.ScopeComparabilityResult) domain.ScopeComparabilityResult {
	if a == nil || b == nil {
		return domain.ScopeComparabilityResult{Status: domain.ScopeComparabilityIncompatible}
	}
	compatibleA := a.Status == domain.ScopeComparabilityExactMatch || a.Status == domain.ScopeComparabilityDeclaredCompatible
	compatibleB := b.Status == domain.ScopeComparabilityExactMatch || b.Status == domain.ScopeComparabilityDeclaredCompatible
	status := domain.ScopeComparabilityExactMatch
	if !compatibleA || !compatibleB {
		status = domain.ScopeComparabilityIncompatible
	} else if a.Status == domain.ScopeComparabilityDeclaredCompatible || b.Status == domain.ScopeComparabilityDeclaredCompatible {
		status = domain.ScopeComparabilityDeclaredCompatible
	}
	window := boolPtrApp(a.WindowDurationComparable != nil && b.WindowDurationComparable != nil && *a.WindowDurationComparable && *b.WindowDurationComparable)
	reasons := append([]domain.ReasonCode(nil), a.ReasonCodes...)
	for _, reason := range b.ReasonCodes {
		found := false
		for _, existing := range reasons {
			if existing == reason {
				found = true
				break
			}
		}
		if !found {
			reasons = append(reasons, reason)
		}
	}
	return domain.ScopeComparabilityResult{Status: status, CurrentRunID: a.CurrentRunID, PriorRunID: b.PriorRunID, WindowDurationComparable: window, ReasonCodes: reasons}
}

type c31PeerRecord struct {
	CatalogID string
	Record    domain.SignalEvidenceAssessmentRecord
}

func c31ODMIEligiblePeerGroups(rows []domain.CatalogSnapshot, records map[string]domain.SignalEvidenceAssessmentRecord, nodes map[string]domain.CatalogNode) map[string][]c31PeerRecord {
	groups := map[string][]c31PeerRecord{}
	for _, row := range rows {
		record, ok := records[row.CatalogID]
		if !ok || record.Assessment.Eligibility == domain.SignalEligibilitySuppressed || record.Value == nil {
			continue
		}
		node, ok := nodes[row.CatalogID]
		if !ok {
			continue
		}
		key := c31PeerKey(node)
		groups[key] = append(groups[key], c31PeerRecord{CatalogID: row.CatalogID, Record: record})
	}
	for key := range groups {
		sort.Slice(groups[key], func(i, j int) bool { return groups[key][i].CatalogID < groups[key][j].CatalogID })
	}
	return groups
}

func c31PeerKey(node domain.CatalogNode) string {
	return node.ParentID + "\x1f" + node.Platform + "\x1f" + node.ContentType + "\x1f" + string(node.Level)
}

type c31MovementGroup struct {
	Parent          domain.CatalogNode
	Children        []analyticsenginepkg.MovementChildV02
	TotalChildCount int
	Facts           evidencepkg.EvidenceFacts
}

func c31MovementGroups(nodes []domain.CatalogNode, current map[string]domain.CatalogSnapshot, odmi map[string]domain.SignalEvidenceAssessmentRecord) []c31MovementGroup {
	nodeByID := make(map[string]domain.CatalogNode, len(nodes))
	childrenByParent := map[string][]domain.CatalogNode{}
	for _, node := range nodes {
		nodeByID[node.ID] = node
		if node.ParentID != "" {
			childrenByParent[node.ParentID] = append(childrenByParent[node.ParentID], node)
		}
	}
	out := make([]c31MovementGroup, 0)
	for parentID, children := range childrenByParent {
		parent, ok := nodeByID[parentID]
		if !ok {
			continue
		}
		available := 0
		eligible := make([]analyticsenginepkg.MovementChildV02, 0, len(children))
		for _, child := range children {
			snapshot, hasSnapshot := current[child.ID]
			if !hasSnapshot {
				continue
			}
			available++
			record, ok := odmi[child.ID]
			if !ok || record.Assessment.Eligibility == domain.SignalEligibilitySuppressed || record.Value == nil || snapshot.ObservedProducts <= 0 {
				continue
			}
			eligible = append(eligible, analyticsenginepkg.MovementChildV02{Value: *record.Value, ProductMass: float64(snapshot.ObservedProducts)})
		}
		if available == 0 {
			continue
		}
		eligibleCount := len(eligible)
		movementStage := domain.EvidenceStageMovementIndication
		stable := true
		windowComparable := true
		scope := domain.ScopeComparabilityResult{Status: domain.ScopeComparabilityExactMatch, WindowDurationComparable: &windowComparable}
		facts := evidencepkg.EvidenceFacts{
			ComparableWindowCount: intpApp(2), EligibleChildCount: &eligibleCount, TotalChildCount: &available,
			UnderlyingStage: &movementStage, StableMeasureDefinition: &stable, ScopeComparability: &scope,
		}
		out = append(out, c31MovementGroup{Parent: parent, Children: eligible, TotalChildCount: available, Facts: facts})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Parent.ID < out[j].Parent.ID })
	return out
}

func c31MomentumValue(result *analyticsenginepkg.DirectionalMomentumV02Result, odmi bool) *float64 {
	if result == nil {
		return nil
	}
	if odmi {
		return floatpApp(result.ODMI)
	}
	return floatpApp(result.MomentumMagnitude)
}

func c31MovementValue(result *analyticsenginepkg.MovementDivergenceV02Result, kind string, eligible int) *float64 {
	if result == nil {
		return nil
	}
	switch kind {
	case "weighted":
		if eligible < 1 {
			return nil
		}
		return floatpApp(result.ProductMassWeighted)
	case "equal":
		if eligible < 1 {
			return nil
		}
		return floatpApp(result.EqualSegment)
	case "signed":
		if eligible < 2 {
			return nil
		}
		return floatpApp(result.SignedDivergence)
	case "magnitude":
		if eligible < 2 {
			return nil
		}
		return floatpApp(result.DivergenceMagnitude)
	default:
		return nil
	}
}

func c31ProvenanceID(parts ...string) string {
	h := sha256.New()
	for i, part := range parts {
		if i > 0 {
			_, _ = h.Write([]byte{0})
		}
		_, _ = h.Write([]byte(part))
	}
	return "c31prov_" + hex.EncodeToString(h.Sum(nil)[:12])
}

func sortEvidenceRecords(records []domain.SignalEvidenceAssessmentRecord) {
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
}

func floatpApp(value float64) *float64 { return &value }
func intpApp(value int) *int           { return &value }
func boolPtrApp(value bool) *bool      { return &value }
