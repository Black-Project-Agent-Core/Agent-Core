package app

import (
	"marketsignallab/internal/domain"
	"marketsignallab/internal/universe"
	"sort"
	"time"
)

type CatalogRankingRow struct {
	Rank     int                    `json:"rank"`
	Catalog  domain.CatalogNode     `json:"catalog"`
	Snapshot domain.CatalogSnapshot `json:"snapshot"`
}

type ProductRankingRow struct {
	Rank              int                         `json:"rank"`
	Product           domain.ProductEntity        `json:"product"`
	Metadata          *domain.LiveProductMetadata `json:"metadata,omitempty"`
	MetadataFreshness string                      `json:"metadataFreshness"`
	Author            *domain.AuthorEntity        `json:"author,omitempty"`
	Snapshot          domain.ProductSnapshot      `json:"snapshot"`
}

func snapshotModelPriority(version string) int {
	switch version {
	case "catalog-snapshot-v0.2", "product-snapshot-v0.2":
		return 2
	case "catalog-snapshot-v0.1", "product-snapshot-v0.1":
		return 1
	default:
		return 0
	}
}

func newestCatalogAsOf(rows []domain.CatalogSnapshot) string {
	latest := ""
	for _, row := range rows {
		if row.Window.CurrentEnd > latest {
			latest = row.Window.CurrentEnd
		}
	}
	return latest
}

func newestProductAsOf(rows []domain.ProductSnapshot) string {
	latest := ""
	for _, row := range rows {
		if row.Window.CurrentEnd > latest {
			latest = row.Window.CurrentEnd
		}
	}
	return latest
}

func (s *Service) CatalogRankings(filter domain.CatalogSnapshotFilter) ([]CatalogRankingRow, error) {
	if filter.WindowDays == 0 {
		filter.WindowDays = 30
	}
	snapshots, err := s.ranking.CatalogSnapshots(filter)
	if err != nil {
		return nil, err
	}
	if filter.AsOf == "" {
		latest := newestCatalogAsOf(snapshots)
		filtered := snapshots[:0]
		for _, snapshot := range snapshots {
			if snapshot.Window.CurrentEnd == latest {
				filtered = append(filtered, snapshot)
			}
		}
		snapshots = filtered
	}
	bestCatalog := map[string]domain.CatalogSnapshot{}
	for _, snapshot := range snapshots {
		current, ok := bestCatalog[snapshot.CatalogID]
		if !ok || snapshotModelPriority(snapshot.ModelVersion) > snapshotModelPriority(current.ModelVersion) || (snapshotModelPriority(snapshot.ModelVersion) == snapshotModelPriority(current.ModelVersion) && snapshot.ObservedAt > current.ObservedAt) {
			bestCatalog[snapshot.CatalogID] = snapshot
		}
	}
	snapshots = snapshots[:0]
	for _, row := range bestCatalog {
		snapshots = append(snapshots, row)
	}
	catalogs, err := s.universe.CatalogNodes()
	if err != nil {
		return nil, err
	}
	catalogByID := map[string]domain.CatalogNode{}
	for _, catalog := range catalogs {
		catalogByID[catalog.ID] = catalog
	}
	rows := make([]CatalogRankingRow, 0, len(snapshots))
	for _, snapshot := range snapshots {
		catalog, ok := catalogByID[snapshot.CatalogID]
		if !ok {
			continue
		}
		rows = append(rows, CatalogRankingRow{Catalog: catalog, Snapshot: snapshot})
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].Snapshot.TrendScore != rows[j].Snapshot.TrendScore {
			return rows[i].Snapshot.TrendScore > rows[j].Snapshot.TrendScore
		}
		if rows[i].Snapshot.OpportunityScore != rows[j].Snapshot.OpportunityScore {
			return rows[i].Snapshot.OpportunityScore > rows[j].Snapshot.OpportunityScore
		}
		if rows[i].Snapshot.Confidence != rows[j].Snapshot.Confidence {
			return rows[i].Snapshot.Confidence > rows[j].Snapshot.Confidence
		}
		return rows[i].Catalog.CanonicalKey < rows[j].Catalog.CanonicalKey
	})
	for i := range rows {
		rows[i].Rank = i + 1
	}
	return rows, nil
}

func (s *Service) ProductRankings(filter domain.ProductSnapshotFilter) ([]ProductRankingRow, error) {
	if filter.WindowDays == 0 {
		filter.WindowDays = 30
	}
	snapshots, err := s.ranking.ProductSnapshots(filter)
	if err != nil {
		return nil, err
	}
	if filter.AsOf == "" {
		latest := newestProductAsOf(snapshots)
		filtered := snapshots[:0]
		for _, snapshot := range snapshots {
			if snapshot.Window.CurrentEnd == latest {
				filtered = append(filtered, snapshot)
			}
		}
		snapshots = filtered
	}
	bestProduct := map[string]domain.ProductSnapshot{}
	for _, snapshot := range snapshots {
		current, ok := bestProduct[snapshot.ProductID]
		if !ok || snapshotModelPriority(snapshot.ModelVersion) > snapshotModelPriority(current.ModelVersion) || (snapshotModelPriority(snapshot.ModelVersion) == snapshotModelPriority(current.ModelVersion) && snapshot.ObservedAt > current.ObservedAt) {
			bestProduct[snapshot.ProductID] = snapshot
		}
	}
	snapshots = snapshots[:0]
	for _, row := range bestProduct {
		snapshots = append(snapshots, row)
	}
	products, err := s.universe.Products()
	if err != nil {
		return nil, err
	}
	authors, err := s.universe.Authors()
	if err != nil {
		return nil, err
	}
	productByID := map[string]domain.ProductEntity{}
	for _, product := range products {
		productByID[product.ID] = product
	}
	authorByID := map[string]domain.AuthorEntity{}
	for _, author := range authors {
		authorByID[author.ID] = author
	}
	rows := make([]ProductRankingRow, 0, len(snapshots))
	now := time.Now().UTC()
	for _, snapshot := range snapshots {
		product, ok := productByID[snapshot.ProductID]
		if !ok {
			continue
		}
		row := ProductRankingRow{Product: product, Snapshot: snapshot, MetadataFreshness: "MISSING METADATA"}
		authorID := ""
		metadata, found, err := s.universe.LatestLiveProductMetadata(product.ID)
		if err != nil {
			return nil, err
		}
		if found {
			copyMetadata := metadata
			row.Metadata = &copyMetadata
			row.MetadataFreshness = universe.MetadataFreshness(now, metadata)
			authorID = metadata.AuthorID
		}
		if authorID == "" {
			observations, err := s.universe.ProductObservations(domain.ObservationFilter{ProductID: product.ID})
			if err != nil {
				return nil, err
			}
			sort.Slice(observations, func(i, j int) bool { return observations[i].ObservedAt < observations[j].ObservedAt })
			for _, observation := range observations {
				if observation.AuthorID != "" {
					authorID = observation.AuthorID
				}
			}
		}
		if author, ok := authorByID[authorID]; ok {
			copyAuthor := author
			row.Author = &copyAuthor
		}
		rows = append(rows, row)
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].Snapshot.ExposureScore != rows[j].Snapshot.ExposureScore {
			return rows[i].Snapshot.ExposureScore > rows[j].Snapshot.ExposureScore
		}
		if rows[i].Snapshot.OpportunityScore != rows[j].Snapshot.OpportunityScore {
			return rows[i].Snapshot.OpportunityScore > rows[j].Snapshot.OpportunityScore
		}
		if rows[i].Snapshot.RelativeStrength != rows[j].Snapshot.RelativeStrength {
			return rows[i].Snapshot.RelativeStrength > rows[j].Snapshot.RelativeStrength
		}
		return rows[i].Product.ID < rows[j].Product.ID
	})
	for i := range rows {
		rows[i].Rank = i + 1
	}
	return rows, nil
}
