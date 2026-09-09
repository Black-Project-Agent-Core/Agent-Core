package consensus

import "marketsignallab/internal/domain"

func EvidenceStage(comparableBatches int) domain.TemporalEvidenceStage {
	switch {
	case comparableBatches >= 12:
		return domain.EvidenceSeasonalityCandidate
	case comparableBatches >= 6:
		return domain.EvidenceEstablishedConsensus
	case comparableBatches >= 3:
		return domain.EvidencePreliminaryConsensus
	case comparableBatches >= 2:
		return domain.EvidenceVolatilityIndication
	default:
		return domain.EvidenceCurrentComparison
	}
}

func qualityAtLeastB(g domain.DataQualityGrade) bool {
	return g == domain.DataQualityGradeA || g == domain.DataQualityGradeB
}

func ClassifySignalState(in domain.SignalStateInput) domain.MarketSignalState {
	if in.ConceptConsensus >= 70 && in.ItemConsensus < 45 {
		return domain.MarketSignalConceptConsensusItemDivergence
	}
	if in.OverallConsensus >= 75 && in.Volatility <= 25 && in.ContextTypes >= 2 && in.ComparableSnapshots >= 3 && qualityAtLeastB(in.DataQualityGrade) && in.ContextDominance <= 75 {
		return domain.MarketSignalStableConsensus
	}
	if in.PresenceGrowingContexts >= 2 && in.ComparableBatches >= 3 && in.ContextTypes >= 2 && in.OverallConsensus >= 55 && !in.ContextBreadthDeclining {
		return domain.MarketSignalEmergingCrossContext
	}
	if (in.OverallConsensus >= 45 && in.OverallConsensus < 65) || in.ContextDominance > 75 {
		return domain.MarketSignalContextDependent
	}
	return domain.MarketSignalFragmentedAmbiguous
}
