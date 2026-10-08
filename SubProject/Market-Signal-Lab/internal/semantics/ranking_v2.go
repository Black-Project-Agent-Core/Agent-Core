package semantics

import "marketsignallab/internal/domain"

type ProductV2 struct {
	Contract            Contract `json:"contract"`
	PeerRelativeRank    float64  `json:"peerRelativeRank"`
	ProductInsightScore float64  `json:"productInsightScore"`
}

type CatalogV2 struct {
	Contract                       Contract `json:"contract"`
	DirectionalBreadth             float64  `json:"directionalBreadth"`
	ObservedNewSupplyGrowthPercent float64  `json:"observedNewSupplyGrowthPercent"`
	ObservedNewSupplyMomentumIndex float64  `json:"observedNewSupplyMomentumIndex"`
	CompetitionMomentumPercent     float64  `json:"competitionMomentumPercent"`
	PeerRelativeRank               float64  `json:"peerRelativeRank"`
	CatalogInsightScore            float64  `json:"catalogInsightScore"`
}

func ProjectProduct(version string, snapshot domain.ProductSnapshot) (ProductV2, error) {
	c, err := contract(version)
	if err != nil {
		return ProductV2{}, err
	}
	return ProductV2{
		Contract:            c,
		PeerRelativeRank:    snapshot.RelativeStrength,
		ProductInsightScore: snapshot.OpportunityScore,
	}, nil
}

func ProjectCatalog(version string, snapshot domain.CatalogSnapshot) (CatalogV2, error) {
	c, err := contract(version)
	if err != nil {
		return CatalogV2{}, err
	}
	return CatalogV2{
		Contract:                       c,
		DirectionalBreadth:             snapshot.ExposureBreadth,
		ObservedNewSupplyGrowthPercent: snapshot.NewSupplyVelocityPercent,
		ObservedNewSupplyMomentumIndex: snapshot.NewSupplyVelocityIndex,
		CompetitionMomentumPercent:     snapshot.CompetitionAcceleration,
		PeerRelativeRank:               snapshot.RelativeStrength,
		CatalogInsightScore:            snapshot.OpportunityScore,
	}, nil
}
