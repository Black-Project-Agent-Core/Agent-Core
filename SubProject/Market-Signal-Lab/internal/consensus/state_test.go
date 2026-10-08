package consensus

import (
	"marketsignallab/internal/domain"
	"testing"
)

func TestEvidenceStages(t *testing.T) {
	cases := map[int]domain.TemporalEvidenceStage{1: "current_comparison", 2: "volatility_indication", 3: "preliminary_consensus", 5: "preliminary_consensus", 6: "established_consensus", 12: "seasonality_candidate"}
	for count, want := range cases {
		if got := EvidenceStage(count); got != want {
			t.Fatalf("count=%d got=%s", count, got)
		}
	}
}

func TestConceptConsensusItemDivergenceState(t *testing.T) {
	got := ClassifySignalState(domain.SignalStateInput{OverallConsensus: 62, ConceptConsensus: 78, ItemConsensus: 32, Volatility: 20, ContextTypes: 2, ComparableSnapshots: 4, DataQualityGrade: domain.DataQualityGradeB})
	if got != domain.MarketSignalConceptConsensusItemDivergence {
		t.Fatalf("got %s", got)
	}
}
