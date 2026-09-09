package app

import (
	"errors"
	"sort"
	"strings"

	"marketsignallab/internal/domain"
	"marketsignallab/internal/security"
)

func clusterEvidenceProductIDs(row domain.ProductDirectionCluster) []string {
	values := row.EvidenceProductIDs
	if len(values) == 0 {
		values = row.ProductIDs
	}
	seen := map[string]bool{}
	out := make([]string, 0, len(values))
	for _, id := range values {
		id = strings.TrimSpace(id)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	return out
}

func (s *Service) productDirectionByID(directionID string) (domain.ProductDirectionCluster, bool, error) {
	directionID = strings.TrimSpace(directionID)
	rows, err := s.autopilot.ProductDirectionClusters("")
	if err != nil {
		return domain.ProductDirectionCluster{}, false, err
	}
	for _, row := range rows {
		if row.ID == directionID {
			return row, true, nil
		}
	}
	return domain.ProductDirectionCluster{}, false, nil
}

// ProductDirectionSourceProducts resolves normalized public source links for
// the observed products supporting a product-direction cluster. It never
// guesses a URL and never mutates persisted analytics or history.
func (s *Service) ProductDirectionSourceProducts(directionID string) (domain.ProductDirectionSourceProducts, error) {
	row, ok, err := s.productDirectionByID(directionID)
	if err != nil {
		return domain.ProductDirectionSourceProducts{}, err
	}
	if !ok {
		return domain.ProductDirectionSourceProducts{}, errors.New("product direction not found")
	}
	products, err := s.universe.Products()
	if err != nil {
		return domain.ProductDirectionSourceProducts{}, err
	}
	byID := make(map[string]domain.ProductEntity, len(products))
	for _, product := range products {
		byID[product.ID] = product
	}

	out := domain.ProductDirectionSourceProducts{DirectionID: row.ID, Label: row.Label, Products: []domain.ProductSourceLink{}}
	for _, productID := range clusterEvidenceProductIDs(row) {
		entity, exists := byID[productID]
		if !exists {
			continue
		}
		meta, hasMeta, err := s.universe.LatestLiveProductMetadata(productID)
		if err != nil {
			return domain.ProductDirectionSourceProducts{}, err
		}
		title := strings.TrimSpace(meta.Title)
		if title == "" {
			title = strings.TrimSpace(entity.ExternalItemID)
		}
		if title == "" {
			title = productID
		}
		link := domain.ProductSourceLink{
			ProductID:      productID,
			ExternalItemID: entity.ExternalItemID,
			Title:          title,
		}
		if hasMeta {
			link.AuthorDisplayName = strings.TrimSpace(meta.AuthorDisplayName)
			if normalized, valid := security.SanitizeEnvatoProductURL(meta.SourceURL); valid {
				link.SourceURL = normalized
				link.LinkAvailable = true
				out.AvailableCount++
			}
		}
		if snapshot, found, err := s.ranking.LatestProductSnapshot(domain.ProductSnapshotFilter{ProductID: productID}); err != nil {
			return domain.ProductDirectionSourceProducts{}, err
		} else if found {
			link.OpportunityScore = snapshot.OpportunityScore
			link.Confidence = snapshot.Confidence
			link.ExposureScore = snapshot.ExposureScore
			link.FreshnessScore = snapshot.FreshnessScore
			link.Direction = snapshot.Direction
		}
		temporalSummary, err := s.ProductTemporalSummary(productID)
		if err != nil {
			return domain.ProductDirectionSourceProducts{}, err
		}
		link.Temporal = temporalSummary
		out.Products = append(out.Products, link)
	}
	sort.SliceStable(out.Products, func(i, j int) bool {
		a, b := strings.ToLower(out.Products[i].Title), strings.ToLower(out.Products[j].Title)
		if a == b {
			return out.Products[i].ProductID < out.Products[j].ProductID
		}
		return a < b
	})
	out.ProductCount = len(out.Products)
	return out, nil
}

func (s *Service) ProductDirectionLinkSummaries(runID string) ([]domain.ProductDirectionLinkSummary, error) {
	clusters, err := s.autopilot.ProductDirectionClusters(strings.TrimSpace(runID))
	if err != nil {
		return nil, err
	}
	out := make([]domain.ProductDirectionLinkSummary, 0, len(clusters))
	for _, cluster := range clusters {
		products, err := s.ProductDirectionSourceProducts(cluster.ID)
		if err != nil {
			return nil, err
		}
		summary := domain.ProductDirectionLinkSummary{
			DirectionID:    cluster.ID,
			ProductCount:   products.ProductCount,
			AvailableCount: products.AvailableCount,
			Mode:           "unavailable",
		}
		if products.ProductCount > 1 {
			summary.Mode = "multiple"
		} else if products.ProductCount == 1 && products.Products[0].LinkAvailable {
			summary.Mode = "single"
			representative := products.Products[0]
			summary.Representative = &representative
		}
		out = append(out, summary)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].DirectionID < out[j].DirectionID })
	return out, nil
}
