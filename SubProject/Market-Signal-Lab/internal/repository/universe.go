package repository

import "marketsignallab/internal/domain"

type UniverseRepository interface {
	SaveCatalogNode(domain.CatalogNode) error
	CatalogNodes() ([]domain.CatalogNode, error)
	CatalogByID(string) (domain.CatalogNode, bool, error)
	CatalogByCanonicalKey(string) (domain.CatalogNode, bool, error)

	UpsertProduct(domain.ProductEntity) (domain.ProductEntity, error)
	Products() ([]domain.ProductEntity, error)
	ProductBySource(sourceType, externalItemID string) (domain.ProductEntity, bool, error)

	UpsertProductRelease(domain.ProductReleaseRecord) (domain.ProductReleaseRecord, *domain.ProductReleaseConflict, error)
	ProductRelease(productID string) (domain.ProductReleaseRecord, bool, error)
	ProductReleases() ([]domain.ProductReleaseRecord, error)
	ProductReleaseConflicts(productID string) ([]domain.ProductReleaseConflict, error)
	AppendProductTrendEvent(domain.ProductTrendEvent) error
	AppendProductTrendEvents([]domain.ProductTrendEvent) error
	ProductTrendEvents(domain.ProductTrendEventFilter) ([]domain.ProductTrendEvent, error)

	SaveLiveProductMetadata(domain.LiveProductMetadata) error
	LatestLiveProductMetadata(productID string) (domain.LiveProductMetadata, bool, error)

	UpsertAuthor(domain.AuthorEntity) (domain.AuthorEntity, error)
	Authors() ([]domain.AuthorEntity, error)
	AuthorBySource(sourceType, externalAuthorKey string) (domain.AuthorEntity, bool, error)

	SaveResearchQuery(domain.ResearchQuery) error
	ResearchQueries() ([]domain.ResearchQuery, error)
	ResearchQueryByID(string) (domain.ResearchQuery, bool, error)

	AppendResearchSession(domain.ResearchSession) error
	ResearchSessions() ([]domain.ResearchSession, error)
	LatestResearchSession(id string) (domain.ResearchSession, bool, error)

	AppendProductObservation(domain.ProductObservation) error
	ProductObservations(domain.ObservationFilter) ([]domain.ProductObservation, error)

	AppendObservationSegmentation(domain.ObservationSegmentation) error
	ObservationSegmentations(domain.ObservationSegmentationFilter) ([]domain.ObservationSegmentation, error)
}
