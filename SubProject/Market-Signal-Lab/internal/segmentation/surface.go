package segmentation

import (
	"fmt"
	"marketsignallab/internal/domain"
)

func ParseMarketSurface(value string) (domain.MarketSurface, error) {
	surface, ok := domain.ParseMarketSurfaceAlias(value)
	if !ok {
		return "", fmt.Errorf("unsupported market surface %q", value)
	}
	return surface, nil
}

func IsReservedSurfaceCatalogName(value string) bool {
	_, ok := domain.ParseMarketSurfaceAlias(value)
	return ok
}
