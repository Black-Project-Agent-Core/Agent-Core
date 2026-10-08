package semantics

import "marketsignallab/internal/domain"

type StructuralV2 struct {
	Contract                       Contract `json:"contract"`
	ObservedSegmentComposition     float64  `json:"observedSegmentComposition"`
	CappedCompositionConcentration float64  `json:"cappedCompositionConcentration"`
	MeanEligibleSegmentComposition float64  `json:"meanEligibleSegmentComposition"`
	CompositionWeightingGap        float64  `json:"compositionWeightingGap"`
}

func ProjectStructural(version string, snapshot domain.MarketIndexSnapshot) (StructuralV2, error) {
	c, err := contract(version)
	if err != nil {
		return StructuralV2{}, err
	}
	return StructuralV2{
		Contract:                       c,
		ObservedSegmentComposition:     snapshot.CompositionIndex,
		CappedCompositionConcentration: snapshot.VolumeWeightedValue,
		MeanEligibleSegmentComposition: snapshot.EqualSectorValue,
		CompositionWeightingGap:        snapshot.DivergenceValue,
	}, nil
}
