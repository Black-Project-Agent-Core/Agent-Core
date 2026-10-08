package app

import (
	"context"
	"errors"
	analyticsenginepkg "marketsignallab/internal/analyticsengine"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/ranking"
	"sort"
	"time"
)

func (s *Service) BuildRankings(req domain.RankingBuildRequest) (domain.RankingBuildResult, error) {
	return s.buildRankings(req, true)
}

func (s *Service) buildRankings(req domain.RankingBuildRequest, persist bool) (domain.RankingBuildResult, error) {
	if req.WindowDays == 0 {
		req.WindowDays = 30
	}
	asOf := time.Now().UTC()
	if req.AsOf != "" {
		parsed, err := time.Parse(time.RFC3339, req.AsOf)
		if err != nil {
			return domain.RankingBuildResult{}, errors.New("asOf must be RFC3339")
		}
		asOf = parsed.UTC()
	}
	window, err := ranking.NewWindow(asOf, req.WindowDays)
	if err != nil {
		return domain.RankingBuildResult{}, err
	}
	if req.CatalogScopeID != "" {
		if _, ok, err := s.universe.CatalogByID(req.CatalogScopeID); err != nil {
			return domain.RankingBuildResult{}, err
		} else if !ok {
			return domain.RankingBuildResult{}, errors.New("catalog scope not found")
		}
	}
	catalogs, err := s.universe.CatalogNodes()
	if err != nil {
		return domain.RankingBuildResult{}, err
	}
	products, err := s.universe.Products()
	if err != nil {
		return domain.RankingBuildResult{}, err
	}
	authors, err := s.universe.Authors()
	if err != nil {
		return domain.RankingBuildResult{}, err
	}
	queries, err := s.universe.ResearchQueries()
	if err != nil {
		return domain.RankingBuildResult{}, err
	}
	sessions, err := s.universe.ResearchSessions()
	if err != nil {
		return domain.RankingBuildResult{}, err
	}
	observations, err := s.universe.ProductObservations(domain.ObservationFilter{})
	if err != nil {
		return domain.RankingBuildResult{}, err
	}
	segmentations, err := s.integrity.ObservationSegmentations(domain.ObservationSegmentationFilter{})
	if err != nil {
		return domain.RankingBuildResult{}, err
	}
	input := ranking.BuildInput{
		Dataset: ranking.Dataset{
			Catalogs: catalogs, Products: products, Authors: authors,
			Queries: queries, Sessions: sessions, Observations: observations, Segmentations: segmentations,
		},
		Window: window, CatalogScopeID: req.CatalogScopeID, MarketMapRunID: req.MarketMapRunID,
	}
	ctx := context.Background()
	if err := s.RequireAnalyticsRuntime(ctx); err != nil {
		return domain.RankingBuildResult{}, err
	}
	normalized, err := ranking.NormalizeProductRankingV01(input)
	if err != nil {
		return domain.RankingBuildResult{}, err
	}
	productResult, err := analyticsenginepkg.ExecuteProductRankingV01(ctx, s.analyticsRuntime, normalized.ProductInput)
	if err != nil {
		return domain.RankingBuildResult{}, err
	}
	productSnapshots, err := ranking.AssembleProductSnapshotsV01(input, normalized, productResult)
	if err != nil {
		return domain.RankingBuildResult{}, err
	}
	if len(productSnapshots) == 0 {
		return domain.RankingBuildResult{}, errors.New("no observations available for ranking window")
	}
	catalogInput, err := ranking.NormalizeCatalogRankingV01(input, normalized, productResult.Rows)
	if err != nil {
		return domain.RankingBuildResult{}, err
	}
	catalogResult, err := analyticsenginepkg.ExecuteCatalogRankingV01(ctx, s.analyticsRuntime, catalogInput)
	if err != nil {
		return domain.RankingBuildResult{}, err
	}
	catalogSnapshots, err := ranking.AssembleCatalogSnapshotsV01(input, normalized, catalogResult)
	if err != nil {
		return domain.RankingBuildResult{}, err
	}
	if persist {
		for _, snapshot := range productSnapshots {
			if err := s.ranking.AppendProductSnapshot(snapshot); err != nil {
				return domain.RankingBuildResult{}, err
			}
		}
		for _, snapshot := range catalogSnapshots {
			if err := s.ranking.AppendCatalogSnapshot(snapshot); err != nil {
				return domain.RankingBuildResult{}, err
			}
		}
	}
	sort.Slice(productSnapshots, func(i, j int) bool { return productSnapshots[i].ProductID < productSnapshots[j].ProductID })
	sort.Slice(catalogSnapshots, func(i, j int) bool { return catalogSnapshots[i].CatalogID < catalogSnapshots[j].CatalogID })
	return domain.RankingBuildResult{
		Window: window, CatalogSnapshots: catalogSnapshots, ProductSnapshots: productSnapshots,
		CatalogsPersisted: func() int {
			if persist {
				return len(catalogSnapshots)
			}
			return 0
		}(), ProductsPersisted: func() int {
			if persist {
				return len(productSnapshots)
			}
			return 0
		}(),
	}, nil
}

func (s *Service) RankingModels() []domain.ModelDefinition {
	return ranking.ModelRegistry()
}
