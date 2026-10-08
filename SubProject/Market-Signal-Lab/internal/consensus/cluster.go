package consensus

import (
	"errors"
	"marketsignallab/internal/domain"
	"sort"
	"time"
)

type ClusterConsensusInput struct {
	CaptureBatchID          string
	EntityType              string
	EntityID                string
	Label                   string
	ContextTypes            []string
	EligibleSnapshotIDs     []string
	EligibleSnapshots       int
	ComparableBatchCount    int
	ContextPresenceRate     float64
	ContextBreadth          float64
	CrossTimePersistence    float64
	RankShareStrength       float64
	IndependentItemBreadth  float64
	EvidenceQuality         float64
	UnresolvedTaxonomyShare float64
	ContextDominance        float64
	Coverage                float64
	Confidence              float64
	DataQualityScore        float64
	DataQualityGrade        domain.DataQualityGrade
	GeneratedAt             time.Time
}

func uniqueStrings(xs []string) []string {
	m := map[string]bool{}
	out := []string{}
	for _, x := range xs {
		if x != "" && !m[x] {
			m[x] = true
			out = append(out, x)
		}
	}
	sort.Strings(out)
	return out
}

func BuildClusterConsensus(in ClusterConsensusInput) (domain.MultiContextConsensusSnapshot, domain.ConsensusScoreProvenance, error) {
	if in.EntityType == "" || in.EntityID == "" {
		return domain.MultiContextConsensusSnapshot{}, domain.ConsensusScoreProvenance{}, errors.New("entity type and id are required")
	}
	vals := []weightedValue{{"context_presence_rate", in.ContextPresenceRate, .25, true}, {"context_breadth", in.ContextBreadth, .20, true}, {"cross_time_persistence", in.CrossTimePersistence, .20, true}, {"rank_share_strength", in.RankShareStrength, .15, true}, {"independent_item_breadth", in.IndependentItemBreadth, .10, true}, {"evidence_quality", in.EvidenceQuality, .10, true}}
	score, components, missing := weighted(vals)
	contexts := uniqueStrings(in.ContextTypes)
	reasons := []string{}
	strongGates := len(contexts) >= 2 && in.EligibleSnapshots >= 3 && in.ContextBreadth >= 50 && qualityAtLeastB(in.DataQualityGrade) && in.UnresolvedTaxonomyShare <= 20
	if len(contexts) < 2 {
		reasons = append(reasons, "insufficient_context_types")
	}
	if in.EligibleSnapshots < 3 {
		reasons = append(reasons, "insufficient_snapshots")
	}
	if in.ContextBreadth < 50 {
		reasons = append(reasons, "context_breadth_below_50")
	}
	if !qualityAtLeastB(in.DataQualityGrade) {
		reasons = append(reasons, "data_quality_below_b")
	}
	if in.UnresolvedTaxonomyShare > 20 {
		reasons = append(reasons, "taxonomy_ambiguity_cap")
	}
	label := domain.ConsensusLabelFragmented
	switch {
	case score >= 80 && strongGates:
		label = domain.ConsensusLabelStrong
	case score >= 60:
		label = domain.ConsensusLabelModerate
	case score >= 45:
		label = domain.ConsensusLabelContextDependent
	}
	stage := EvidenceStage(in.ComparableBatchCount)
	state := domain.MarketSignalFragmentedAmbiguous
	if label == domain.ConsensusLabelStrong {
		state = domain.MarketSignalStableConsensus
	} else if label == domain.ConsensusLabelContextDependent {
		state = domain.MarketSignalContextDependent
	}
	if stage == domain.EvidenceCurrentComparison && state == domain.MarketSignalStableConsensus {
		state = domain.MarketSignalContextDependent
		reasons = append(reasons, "insufficient_temporal_evidence")
	}
	generated := in.GeneratedAt
	if generated.IsZero() {
		generated = time.Now().UTC()
	}
	provID := domain.NewID()
	id := domain.NewID()
	snapshot := domain.MultiContextConsensusSnapshot{ID: id, CaptureBatchID: in.CaptureBatchID, EntityType: in.EntityType, EntityID: in.EntityID, Label: string(label), Score: score, ContextPresenceRate: in.ContextPresenceRate, ContextBreadth: in.ContextBreadth, CrossTimePersistence: in.CrossTimePersistence, RankShareStrength: in.RankShareStrength, IndependentItemBreadth: in.IndependentItemBreadth, EvidenceQuality: in.EvidenceQuality, ContextTypes: contexts, EligibleSnapshotIDs: append([]string(nil), in.EligibleSnapshotIDs...), EligibleSnapshots: in.EligibleSnapshots, ComparableBatchCount: in.ComparableBatchCount, UnresolvedTaxonomyShare: in.UnresolvedTaxonomyShare, SignalState: string(state), EvidenceStage: string(stage), Coverage: in.Coverage, Confidence: in.Confidence, DataQualityScore: in.DataQualityScore, DataQualityGrade: in.DataQualityGrade, ProvenanceID: provID, ModelVersion: "cluster-consensus-v0.1", ReasonCodes: reasons, GeneratedAt: generated.Format(time.RFC3339)}
	prov := domain.ConsensusScoreProvenance{ID: provID, ScoreType: "multi_context_consensus", EntityType: in.EntityType, EntityID: in.EntityID, SnapshotIDs: append([]string(nil), in.EligibleSnapshotIDs...), FinalScore: score, Components: components, MissingComponents: missing, ModelVersions: []string{"cluster-consensus-v0.1"}, Coverage: in.Coverage, Confidence: in.Confidence, DataQualityScore: in.DataQualityScore, DataQualityGrade: in.DataQualityGrade, ReasonCodes: reasons, GeneratedAt: generated.Format(time.RFC3339)}
	return snapshot, prov, nil
}

func BuildContextMatrixRow(entityType, entityID, label string, contextStrength map[string]float64, snapshots map[string][]string, consensusScore, ambiguity, volatility, selection float64, state string, grade domain.DataQualityGrade, provenanceID string) domain.ContextMatrixRow {
	keys := make([]string, 0, len(contextStrength)+len(snapshots))
	seen := map[string]bool{}
	for k := range contextStrength {
		seen[k] = true
		keys = append(keys, k)
	}
	for k := range snapshots {
		if !seen[k] {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)
	cells := make([]domain.ContextMatrixCell, 0, len(keys))
	for _, k := range keys {
		v, ok := contextStrength[k]
		cells = append(cells, domain.ContextMatrixCell{ContextType: k, Available: ok, Strength: v, SnapshotIDs: append([]string(nil), snapshots[k]...)})
	}
	return domain.ContextMatrixRow{EntityType: entityType, EntityID: entityID, Label: label, Cells: cells, Consensus: consensusScore, Ambiguity: ambiguity, Volatility: volatility, SelectionProbability: selection, SignalState: state, DataQualityGrade: grade, ProvenanceID: provenanceID}
}
