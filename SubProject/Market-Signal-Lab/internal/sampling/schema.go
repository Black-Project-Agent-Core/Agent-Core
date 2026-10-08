package sampling

import (
	"errors"
	"marketsignallab/internal/domain"
	"sort"
	"strings"
)

const SchemaVersion = "sampling-schema-v0.1"
const IndexWeightingVersion = "index-weighting-v0.1"

type ModeConfig struct {
	RequestBudget               int
	CategoryDepth               int
	CategoryBootstrapPerSiteMax int
	TargetSample                int
	Surfaces                    []domain.MarketSurface
	RequestAllowanceBySurface   map[domain.MarketSurface]int
}

func ConfigForMode(mode domain.MarketMapMode) (ModeConfig, error) {
	switch mode {
	case domain.MarketMapModeQuick:
		return ModeConfig{
			RequestBudget: 28, CategoryDepth: 0, CategoryBootstrapPerSiteMax: 0, TargetSample: 20,
			Surfaces:                  []domain.MarketSurface{domain.MarketSurfacePopular, domain.MarketSurfaceRandomNew},
			RequestAllowanceBySurface: map[domain.MarketSurface]int{domain.MarketSurfacePopular: 2, domain.MarketSurfaceRandomNew: 2},
		}, nil
	case domain.MarketMapModeStandard:
		return ModeConfig{
			RequestBudget: 48, CategoryDepth: 1, CategoryBootstrapPerSiteMax: 2, TargetSample: 20,
			Surfaces:                  []domain.MarketSurface{domain.MarketSurfacePopular, domain.MarketSurfaceRandomNew, domain.MarketSurfaceNew},
			RequestAllowanceBySurface: map[domain.MarketSurface]int{domain.MarketSurfacePopular: 2, domain.MarketSurfaceRandomNew: 1, domain.MarketSurfaceNew: 1},
		}, nil
	case domain.MarketMapModeDeep:
		return ModeConfig{
			RequestBudget: 60, CategoryDepth: 3, CategoryBootstrapPerSiteMax: 2, TargetSample: 40,
			Surfaces:                  []domain.MarketSurface{domain.MarketSurfacePopular, domain.MarketSurfaceRandomNew, domain.MarketSurfaceFeatured, domain.MarketSurfaceNew},
			RequestAllowanceBySurface: map[domain.MarketSurface]int{domain.MarketSurfacePopular: 2, domain.MarketSurfaceRandomNew: 1, domain.MarketSurfaceFeatured: 1, domain.MarketSurfaceNew: 1},
		}, nil
	default:
		return ModeConfig{}, errors.New("unsupported market map mode")
	}
}

func StratumKey(site, contentType, catalogLevelKey string, surface domain.MarketSurface) string {
	return strings.Join([]string{strings.ToLower(site), strings.ToLower(contentType), strings.ToLower(catalogLevelKey), string(surface)}, "|")
}

func RoundRobinTargets(candidates map[string][]domain.MarketMapSurfaceTarget, requestBudget int) []domain.MarketMapSurfaceTarget {
	sites := make([]string, 0, len(candidates))
	for site := range candidates {
		sites = append(sites, site)
	}
	sort.Strings(sites)
	out := []domain.MarketMapSurfaceTarget{}
	used := 0
	for round := 0; ; round++ {
		progressed := false
		for _, site := range sites {
			if round >= len(candidates[site]) {
				continue
			}
			row := candidates[site][round]
			if row.RequestAllowance < 1 {
				row.RequestAllowance = 1
			}
			if used+row.RequestAllowance > requestBudget {
				continue
			}
			row.Site = site
			out = append(out, row)
			used += row.RequestAllowance
			progressed = true
		}
		if !progressed {
			break
		}
	}
	return out
}
