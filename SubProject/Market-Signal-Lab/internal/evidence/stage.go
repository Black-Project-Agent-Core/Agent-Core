package evidence

import "marketsignallab/internal/domain"

type StageInput struct {
	ClaimType                domain.ClaimType
	ComparableWindowCount    int
	ScopeComparable          bool
	WindowDurationComparable bool
	InheritedStage           *domain.EvidenceStage
}

func MaximumStage(in StageInput) (domain.EvidenceStage, []domain.ReasonCode) {
	if in.ClaimType == domain.ClaimTypePeerRelative && in.InheritedStage != nil {
		return capC30(*in.InheritedStage), nil
	}
	if in.ClaimType == domain.ClaimTypeMovement &&
		in.ComparableWindowCount >= 2 &&
		in.ScopeComparable &&
		in.WindowDurationComparable {
		return domain.EvidenceStageMovementIndication, nil
	}
	if in.ClaimType == domain.ClaimTypeMovement {
		return domain.EvidenceStageCompositionOnly, []domain.ReasonCode{domain.ReasonLimitedTemporalDepth}
	}
	return domain.EvidenceStageCompositionOnly, nil
}

func capC30(stage domain.EvidenceStage) domain.EvidenceStage {
	switch stage {
	case domain.EvidenceStageMovementIndication,
		domain.EvidenceStagePreliminaryTrend,
		domain.EvidenceStageEstablishedTrend,
		domain.EvidenceStageSeasonalityCandidate:
		return domain.EvidenceStageMovementIndication
	default:
		return domain.EvidenceStageCompositionOnly
	}
}
