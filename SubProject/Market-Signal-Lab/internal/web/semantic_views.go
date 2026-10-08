package web

import (
	"marketsignallab/internal/app"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/semantics"
)

type catalogRankingSemanticRow struct {
	app.CatalogRankingRow
	Semantics semantics.CatalogV2 `json:"semantics"`
}

type productRankingSemanticRow struct {
	app.ProductRankingRow
	Semantics semantics.ProductV2 `json:"semantics"`
}

type integrityIndexSemanticRow struct {
	domain.MarketIndexSnapshot
	Semantics semantics.StructuralV2 `json:"semantics"`
}

func projectCatalogRankingRows(rows []app.CatalogRankingRow) ([]catalogRankingSemanticRow, error) {
	projected := make([]catalogRankingSemanticRow, 0, len(rows))
	for _, row := range rows {
		view, err := semantics.ProjectCatalog(semantics.ContractVersionV2, row.Snapshot)
		if err != nil {
			return nil, err
		}
		projected = append(projected, catalogRankingSemanticRow{CatalogRankingRow: row, Semantics: view})
	}
	return projected, nil
}

func projectProductRankingRows(rows []app.ProductRankingRow) ([]productRankingSemanticRow, error) {
	projected := make([]productRankingSemanticRow, 0, len(rows))
	for _, row := range rows {
		view, err := semantics.ProjectProduct(semantics.ContractVersionV2, row.Snapshot)
		if err != nil {
			return nil, err
		}
		projected = append(projected, productRankingSemanticRow{ProductRankingRow: row, Semantics: view})
	}
	return projected, nil
}

func projectIntegrityIndexRows(rows []domain.MarketIndexSnapshot) ([]integrityIndexSemanticRow, error) {
	projected := make([]integrityIndexSemanticRow, 0, len(rows))
	for _, row := range rows {
		view, err := semantics.ProjectStructural(semantics.ContractVersionV2, row)
		if err != nil {
			return nil, err
		}
		projected = append(projected, integrityIndexSemanticRow{MarketIndexSnapshot: row, Semantics: view})
	}
	return projected, nil
}

type catalogExplorerSemanticRow struct {
	domain.CatalogExplorerRow
	Semantics *semantics.CatalogV2 `json:"semantics,omitempty"`
}

type productExplorerSemanticRow struct {
	domain.ProductExplorerRow
	Semantics *semantics.ProductV2 `json:"semantics,omitempty"`
}

type watchlistSemanticRow struct {
	domain.WatchlistResolvedRow
	Semantics any `json:"semantics,omitempty"`
}

type pagedCatalogExplorerSemanticRows struct {
	Items  []catalogExplorerSemanticRow `json:"items"`
	Total  int                          `json:"total"`
	Limit  int                          `json:"limit"`
	Offset int                          `json:"offset"`
}

type pagedProductExplorerSemanticRows struct {
	Items  []productExplorerSemanticRow `json:"items"`
	Total  int                          `json:"total"`
	Limit  int                          `json:"limit"`
	Offset int                          `json:"offset"`
}

func projectCatalogExplorerRows(paged domain.PagedCatalogExplorerRows) (pagedCatalogExplorerSemanticRows, error) {
	projected := pagedCatalogExplorerSemanticRows{
		Items:  make([]catalogExplorerSemanticRow, 0, len(paged.Items)),
		Total:  paged.Total,
		Limit:  paged.Limit,
		Offset: paged.Offset,
	}
	for _, row := range paged.Items {
		var view *semantics.CatalogV2
		if row.Snapshot != nil {
			projectedView, err := semantics.ProjectCatalog(semantics.ContractVersionV2, *row.Snapshot)
			if err != nil {
				return pagedCatalogExplorerSemanticRows{}, err
			}
			view = &projectedView
		}
		projected.Items = append(projected.Items, catalogExplorerSemanticRow{CatalogExplorerRow: row, Semantics: view})
	}
	return projected, nil
}

func projectProductExplorerRows(paged domain.PagedProductExplorerRows) (pagedProductExplorerSemanticRows, error) {
	projected := pagedProductExplorerSemanticRows{
		Items:  make([]productExplorerSemanticRow, 0, len(paged.Items)),
		Total:  paged.Total,
		Limit:  paged.Limit,
		Offset: paged.Offset,
	}
	for _, row := range paged.Items {
		var view *semantics.ProductV2
		if row.Snapshot != nil {
			projectedView, err := semantics.ProjectProduct(semantics.ContractVersionV2, *row.Snapshot)
			if err != nil {
				return pagedProductExplorerSemanticRows{}, err
			}
			view = &projectedView
		}
		projected.Items = append(projected.Items, productExplorerSemanticRow{ProductExplorerRow: row, Semantics: view})
	}
	return projected, nil
}

func projectCatalogCompareRows(rows []domain.CatalogExplorerRow) ([]catalogExplorerSemanticRow, error) {
	projected := make([]catalogExplorerSemanticRow, 0, len(rows))
	for _, row := range rows {
		var view *semantics.CatalogV2
		if row.Snapshot != nil {
			projectedView, err := semantics.ProjectCatalog(semantics.ContractVersionV2, *row.Snapshot)
			if err != nil {
				return nil, err
			}
			view = &projectedView
		}
		projected = append(projected, catalogExplorerSemanticRow{CatalogExplorerRow: row, Semantics: view})
	}
	return projected, nil
}

func projectProductCompareRows(rows []domain.ProductExplorerRow) ([]productExplorerSemanticRow, error) {
	projected := make([]productExplorerSemanticRow, 0, len(rows))
	for _, row := range rows {
		var view *semantics.ProductV2
		if row.Snapshot != nil {
			projectedView, err := semantics.ProjectProduct(semantics.ContractVersionV2, *row.Snapshot)
			if err != nil {
				return nil, err
			}
			view = &projectedView
		}
		projected = append(projected, productExplorerSemanticRow{ProductExplorerRow: row, Semantics: view})
	}
	return projected, nil
}

func projectWatchlistRows(rows []domain.WatchlistResolvedRow) ([]watchlistSemanticRow, error) {
	projected := make([]watchlistSemanticRow, 0, len(rows))
	for _, row := range rows {
		var view any
		switch {
		case row.CatalogSnapshot != nil:
			projectedView, err := semantics.ProjectCatalog(semantics.ContractVersionV2, *row.CatalogSnapshot)
			if err != nil {
				return nil, err
			}
			view = projectedView
		case row.ProductSnapshot != nil:
			projectedView, err := semantics.ProjectProduct(semantics.ContractVersionV2, *row.ProductSnapshot)
			if err != nil {
				return nil, err
			}
			view = projectedView
		}
		projected = append(projected, watchlistSemanticRow{WatchlistResolvedRow: row, Semantics: view})
	}
	return projected, nil
}
