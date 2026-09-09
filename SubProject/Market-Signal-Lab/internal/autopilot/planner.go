package autopilot

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	envatoconn "marketsignallab/internal/connectors/envato"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/sampling"
	"marketsignallab/internal/segmentation"
	"sort"
	"strings"
	"time"
)

const PlannerVersion = "market-map-planner-v0.2"

type PlanInput struct {
	Mode                  domain.MarketMapMode
	Categories            map[string][]envatoconn.CategoryNode
	BootstrapRequestsUsed int
	CreatedAt             string
}

var supportedSites = []string{
	"3docean.net", "audiojungle.net", "codecanyon.net", "graphicriver.net", "photodune.net", "themeforest.net", "videohive.net",
}

func SupportedSites() []string { return append([]string(nil), supportedSites...) }

func flattenCategories(nodes []envatoconn.CategoryNode) []envatoconn.CategoryNode {
	out := []envatoconn.CategoryNode{}
	var walk func([]envatoconn.CategoryNode)
	walk = func(xs []envatoconn.CategoryNode) {
		for _, node := range xs {
			if strings.TrimSpace(node.Path) != "" {
				out = append(out, node)
			}
			walk(node.Children)
		}
	}
	walk(nodes)
	sort.Slice(out, func(i, j int) bool {
		if out[i].Path == out[j].Path {
			return out[i].Name < out[j].Name
		}
		return out[i].Path < out[j].Path
	})
	return out
}

func siteContentType(site string) string {
	switch site {
	case "graphicriver.net":
		return "Graphics"
	case "themeforest.net":
		return "Web Templates"
	case "codecanyon.net":
		return "Code"
	case "videohive.net":
		return "Video"
	case "audiojungle.net":
		return "Audio"
	case "photodune.net":
		return "Photos"
	case "3docean.net":
		return "3D"
	default:
		return "Market"
	}
}

func targetID(site string, surface domain.MarketSurface, category string) string {
	raw := site + "|" + string(surface) + "|" + category
	sum := sha256.Sum256([]byte(raw))
	return "target-" + hex.EncodeToString(sum[:6])
}

func targetPriority(surface domain.MarketSurface) int {
	if surface == domain.MarketSurfacePopular || surface == domain.MarketSurfaceNew {
		return 1
	}
	return 2
}

func BuildPlan(in PlanInput) (domain.MarketMapPlan, error) {
	config, err := sampling.ConfigForMode(in.Mode)
	if err != nil {
		return domain.MarketMapPlan{}, err
	}
	if in.BootstrapRequestsUsed < 0 || in.BootstrapRequestsUsed > config.RequestBudget {
		return domain.MarketMapPlan{}, errors.New("bootstrap requests exceed market-map budget")
	}
	if in.CreatedAt == "" {
		in.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	}
	targetBudget := config.RequestBudget - in.BootstrapRequestsUsed
	candidates := map[string][]domain.MarketMapSurfaceTarget{}
	for _, site := range supportedSites {
		contentType := siteContentType(site)
		for _, surface := range config.Surfaces {
			allowance := config.RequestAllowanceBySurface[surface]
			if surface == domain.MarketSurfaceNew {
				cats := flattenCategories(in.Categories[site])
				depth := config.CategoryDepth
				if depth > len(cats) {
					depth = len(cats)
				}
				for _, cat := range cats[:depth] {
					row := domain.MarketMapSurfaceTarget{
						ID: targetID(site, surface, cat.Path), Site: site, Surface: surface,
						Category: cat.Path, CategoryName: cat.Name, ContentType: contentType,
						PageSize: 20, Priority: targetPriority(surface), RequestAllowance: allowance,
						TargetSample: config.TargetSample, HighPriority: true, CatalogLevelKey: cat.Path,
					}
					row.StratumKey = sampling.StratumKey(site, contentType, cat.Path, surface)
					candidates[site] = append(candidates[site], row)
				}
				continue
			}
			row := domain.MarketMapSurfaceTarget{
				ID: targetID(site, surface, ""), Site: site, Surface: surface, ContentType: contentType,
				PageSize: 20, Priority: targetPriority(surface), RequestAllowance: allowance,
				TargetSample: config.TargetSample, HighPriority: surface == domain.MarketSurfacePopular,
				CatalogLevelKey: "site-root",
			}
			row.StratumKey = sampling.StratumKey(site, contentType, row.CatalogLevelKey, surface)
			candidates[site] = append(candidates[site], row)
		}
		sort.SliceStable(candidates[site], func(i, j int) bool {
			if candidates[site][i].Priority != candidates[site][j].Priority {
				return candidates[site][i].Priority < candidates[site][j].Priority
			}
			if candidates[site][i].Surface != candidates[site][j].Surface {
				return candidates[site][i].Surface < candidates[site][j].Surface
			}
			return candidates[site][i].Category < candidates[site][j].Category
		})
	}
	targets := sampling.RoundRobinTargets(candidates, targetBudget)
	sort.SliceStable(targets, func(i, j int) bool {
		if targets[i].Site != targets[j].Site {
			return targets[i].Site < targets[j].Site
		}
		if targets[i].Priority != targets[j].Priority {
			return targets[i].Priority < targets[j].Priority
		}
		if targets[i].Surface != targets[j].Surface {
			return targets[i].Surface < targets[j].Surface
		}
		return targets[i].Category < targets[j].Category
	})

	parts := []string{
		PlannerVersion, string(in.Mode), sampling.SchemaVersion, segmentation.TaxonomyVersion,
		sampling.IndexWeightingVersion, fmt.Sprintf("category-depth:%d", config.CategoryDepth),
		fmt.Sprintf("bootstrap-per-site:%d", config.CategoryBootstrapPerSiteMax),
	}
	parts = append(parts, supportedSites...)
	for _, target := range targets {
		parts = append(parts, fmt.Sprintf("%s:%s:%s:%d:%d:%t", target.Site, target.Surface, target.CatalogLevelKey, target.TargetSample, target.RequestAllowance, target.HighPriority))
	}
	sum := sha256.Sum256([]byte(strings.Join(parts, "|")))
	key := hex.EncodeToString(sum[:12])
	return domain.MarketMapPlan{
		ID: "plan-" + key, CreatedAt: in.CreatedAt, Mode: in.Mode, ScanMode: in.Mode,
		PlannerVersion: PlannerVersion, CompatibilityKey: key, ScopeLabel: "entire_observed_market",
		Sites: SupportedSites(), RequestBudget: config.RequestBudget, Targets: targets,
		SamplingSchemaVersion: sampling.SchemaVersion, TaxonomyVersion: segmentation.TaxonomyVersion,
		IndexWeightingVersion: sampling.IndexWeightingVersion,
	}, nil
}
