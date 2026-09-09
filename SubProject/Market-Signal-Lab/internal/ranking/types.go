package ranking

import "marketsignallab/internal/domain"

type Dataset struct {
	Catalogs      []domain.CatalogNode
	Products      []domain.ProductEntity
	Authors       []domain.AuthorEntity
	Queries       []domain.ResearchQuery
	Sessions      []domain.ResearchSession
	Observations  []domain.ProductObservation
	Segmentations []domain.ObservationSegmentation
}

type BuildInput struct {
	Dataset        Dataset
	Window         domain.RankingWindow
	CatalogScopeID string
	MarketMapRunID string
}
