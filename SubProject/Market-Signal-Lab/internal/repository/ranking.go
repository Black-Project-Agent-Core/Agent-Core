package repository

import "marketsignallab/internal/domain"

type RankingRepository interface {
	AppendCatalogSnapshot(domain.CatalogSnapshot) error
	AppendCatalogSnapshots([]domain.CatalogSnapshot) error
	CatalogSnapshots(domain.CatalogSnapshotFilter) ([]domain.CatalogSnapshot, error)
	LatestCatalogSnapshot(domain.CatalogSnapshotFilter) (domain.CatalogSnapshot, bool, error)

	AppendProductSnapshot(domain.ProductSnapshot) error
	AppendProductSnapshots([]domain.ProductSnapshot) error
	ProductSnapshots(domain.ProductSnapshotFilter) ([]domain.ProductSnapshot, error)
	LatestProductSnapshot(domain.ProductSnapshotFilter) (domain.ProductSnapshot, bool, error)
}
