package app

import (
	"errors"
	"marketsignallab/internal/domain"
	"strings"
)

type MigrationSummary struct {
	ExcludedSurfaceCatalogs int `json:"excludedSurfaceCatalogs"`
	QuarantinedCatalogs     int `json:"quarantinedCatalogs"`
	PreservedObservations   int `json:"preservedObservations"`
}

func (s *Service) RunAlpha65IntegrityMigration(migratedAt string) (MigrationSummary, error) {
	if strings.TrimSpace(migratedAt) == "" {
		return MigrationSummary{}, errors.New("migration timestamp is required")
	}
	nodes, err := s.universe.CatalogNodes()
	if err != nil {
		return MigrationSummary{}, err
	}
	queries, err := s.universe.ResearchQueries()
	if err != nil {
		return MigrationSummary{}, err
	}
	observations, err := s.universe.ProductObservations(domain.ObservationFilter{})
	if err != nil {
		return MigrationSummary{}, err
	}
	existingReviews, err := s.integrity.LegacyClassificationReviews(domain.LegacyClassificationReviewFilter{})
	if err != nil {
		return MigrationSummary{}, err
	}
	reviewed := map[string]bool{}
	for _, r := range existingReviews {
		if r.Action == "migrated_surface_catalog" || r.Action == "manual_review_required" {
			reviewed[r.CatalogID] = true
		}
	}
	queriesByCatalog := map[string][]domain.ResearchQuery{}
	for _, q := range queries {
		queriesByCatalog[q.CatalogScopeID] = append(queriesByCatalog[q.CatalogScopeID], q)
	}
	obsByCatalog := map[string][]domain.ProductObservation{}
	for _, o := range observations {
		obsByCatalog[o.CatalogID] = append(obsByCatalog[o.CatalogID], o)
	}
	summary := MigrationSummary{PreservedObservations: len(observations)}
	for _, node := range nodes {
		if node.Origin == domain.CatalogOriginManual || node.Level == domain.CatalogLevelContentType || node.ExcludedFromRanking || reviewed[node.ID] {
			continue
		}
		surface, alias := domain.ParseMarketSurfaceAlias(node.Name)
		if !alias {
			continue
		}
		evidence := false
		linkedIDs := []string{}
		for _, q := range queriesByCatalog[node.ID] {
			qSurface, ok := domain.ParseMarketSurfaceAlias(q.Filters["surface"])
			if q.Purpose == "market_autopilot_surface" && ok && qSurface == surface {
				evidence = true
			}
		}
		rows := obsByCatalog[node.ID]
		if len(rows) > 0 {
			allMatch := true
			for _, o := range rows {
				linkedIDs = append(linkedIDs, o.ID)
				if o.SurfaceType != surface {
					allMatch = false
				}
			}
			if allMatch {
				evidence = true
			}
		}
		updated := node
		updated.Origin = domain.CatalogOriginMigration
		updated.ExcludedFromRanking = true
		review := domain.LegacyClassificationReview{ID: domain.NewID(), CatalogID: node.ID, CatalogName: node.Name, CanonicalKey: node.CanonicalKey, DetectedSurface: surface, SourceObservationIDs: linkedIDs, CreatedAt: migratedAt}
		if evidence {
			updated.AnalyticalStatus = domain.IntegrityStatusExcluded
			review.Action = "migrated_surface_catalog"
			review.Status = "resolved"
			review.ResolvedAt = migratedAt
			review.ReasonCodes = []string{"reserved_surface_alias", "linked_surface_evidence"}
			summary.ExcludedSurfaceCatalogs++
		} else {
			updated.AnalyticalStatus = domain.IntegrityStatusNeedsReview
			review.Action = "manual_review_required"
			review.Status = "open"
			review.ReasonCodes = []string{"reserved_surface_alias", "insufficient_linked_surface_evidence"}
			summary.QuarantinedCatalogs++
		}
		if err := s.universe.SaveCatalogNode(updated); err != nil {
			return summary, err
		}
		if err := s.integrity.AppendLegacyClassificationReview(review); err != nil {
			return summary, err
		}
	}
	return summary, nil
}
