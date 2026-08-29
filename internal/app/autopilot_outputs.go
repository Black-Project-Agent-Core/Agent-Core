package app

import (
	"errors"
	"sort"
	"strings"
	"time"

	"marketsignallab/internal/autopilot"
	"marketsignallab/internal/domain"
)

func siteForContentType(contentType string) string {
	switch strings.ToLower(strings.TrimSpace(contentType)) {
	case "graphics":
		return "graphicriver.net"
	case "web templates":
		return "themeforest.net"
	case "code":
		return "codecanyon.net"
	case "video":
		return "videohive.net"
	case "audio":
		return "audiojungle.net"
	case "photos":
		return "photodune.net"
	case "3d":
		return "3docean.net"
	default:
		return "graphicriver.net"
	}
}

func catalogPathFromNodes(nodes []domain.CatalogNode, catalogID string) domain.CatalogPathInput {
	byID := map[string]domain.CatalogNode{}
	for _, node := range nodes {
		byID[node.ID] = node
	}
	chain := []domain.CatalogNode{}
	current, ok := byID[catalogID]
	for ok {
		chain = append(chain, current)
		if current.ParentID == "" {
			break
		}
		current, ok = byID[current.ParentID]
	}
	sort.SliceStable(chain, func(i, j int) bool { return len(chain)-i < len(chain)-j })
	out := domain.CatalogPathInput{}
	for i := len(chain) - 1; i >= 0; i-- {
		node := chain[i]
		if out.Platform == "" {
			out.Platform = node.Platform
		}
		if out.ContentType == "" {
			out.ContentType = node.ContentType
		}
		switch node.Level {
		case domain.CatalogLevelContentType:
			out.ContentType = node.Name
		case domain.CatalogLevelCatalog:
			out.Catalog = node.Name
		case domain.CatalogLevelSubcatalog:
			out.Subcatalog = node.Name
		case domain.CatalogLevelTheme:
			out.Theme = node.Name
		case domain.CatalogLevelNiche:
			out.Niche = node.Name
		case domain.CatalogLevelUseCase:
			out.UseCase = node.Name
		case domain.CatalogLevelStyleCluster:
			out.StyleCluster = node.Name
		}
	}
	if out.Platform == "" {
		out.Platform = "Envato Market"
	}
	return out
}

func uniqueKeywords(values ...string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, value := range values {
		value = strings.TrimSpace(strings.ReplaceAll(value, "_", " "))
		if value == "" {
			continue
		}
		key := strings.ToLower(value)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, value)
	}
	return out
}

func (s *Service) CreateAdvancedResearchSeed(sourceType, sourceID string) (domain.AdvancedResearchSeed, error) {
	sourceType = strings.TrimSpace(strings.ToLower(sourceType))
	sourceID = strings.TrimSpace(sourceID)
	if sourceID == "" {
		return domain.AdvancedResearchSeed{}, errors.New("sourceId is required")
	}
	nodes, err := s.universe.CatalogNodes()
	if err != nil {
		return domain.AdvancedResearchSeed{}, err
	}
	seed := domain.AdvancedResearchSeed{ID: domain.NewID(), SourceType: sourceType, SourceID: sourceID, CreatedAt: time.Now().UTC().Format(time.RFC3339), MaxPages: 3, PageSize: 20, RequestBudget: 12, WindowDays: 30}
	switch sourceType {
	case "product_direction", "cluster":
		clusters, err := s.autopilot.ProductDirectionClusters("")
		if err != nil {
			return seed, err
		}
		var found *domain.ProductDirectionCluster
		for i := range clusters {
			if clusters[i].ID == sourceID {
				row := clusters[i]
				found = &row
				break
			}
		}
		if found == nil {
			return seed, errors.New("product direction not found")
		}
		seed.RunID = found.RunID
		seed.Catalog = catalogPathFromNodes(nodes, found.CatalogID)
		seed.Site = siteForContentType(seed.Catalog.ContentType)
		values := []string{found.Label}
		values = append(values, found.Keywords...)
		values = append(values, found.ProductType, found.UseCase, seed.Catalog.Catalog, seed.Catalog.Subcatalog)
		seed.Keywords = uniqueKeywords(values...)
	case "catalog":
		node, ok, err := s.universe.CatalogByID(sourceID)
		if err != nil {
			return seed, err
		}
		if !ok {
			return seed, errors.New("catalog not found")
		}
		seed.Catalog = catalogPathFromNodes(nodes, node.ID)
		seed.Site = siteForContentType(seed.Catalog.ContentType)
		seed.Keywords = uniqueKeywords(node.Name, seed.Catalog.Catalog, seed.Catalog.Subcatalog, seed.Catalog.Niche, seed.Catalog.UseCase)
		runs, _ := s.autopilot.MarketMapRuns()
		if len(runs) > 0 {
			seed.RunID = runs[len(runs)-1].ID
		}
	default:
		return seed, errors.New("unsupported investigation source type")
	}
	if len(seed.Keywords) == 0 {
		return seed, errors.New("no research keywords available")
	}
	if err := s.autopilot.AppendAdvancedResearchSeed(seed); err != nil {
		return seed, err
	}
	return seed, nil
}

func (s *Service) clusterProductsForRun(run domain.MarketMapRun) ([]autopilot.ClusterProduct, error) {
	observations, err := s.universe.ProductObservations(domain.ObservationFilter{})
	if err != nil {
		return nil, err
	}
	products, err := s.universe.Products()
	if err != nil {
		return nil, err
	}
	productByID := map[string]domain.ProductEntity{}
	for _, p := range products {
		productByID[p.ID] = p
	}
	latest := map[string]autopilot.ClusterProduct{}
	for _, obs := range observations {
		if obs.MarketMapRunID != run.ID {
			continue
		}
		entity, ok := productByID[obs.ProductID]
		if !ok {
			continue
		}
		meta, has, err := s.universe.LatestLiveProductMetadata(entity.ID)
		if err != nil {
			return nil, err
		}
		if !has || strings.TrimSpace(meta.Title) == "" {
			continue
		}
		row := autopilot.ClusterProduct{ProductID: entity.ID, CatalogID: obs.CatalogID, Title: meta.Title, AuthorID: obs.AuthorID, ObservedAt: obs.ObservedAt}
		existing, exists := latest[entity.ID]
		if !exists || row.ObservedAt > existing.ObservedAt {
			latest[entity.ID] = row
		}
	}
	out := make([]autopilot.ClusterProduct, 0, len(latest))
	for _, row := range latest {
		out = append(out, row)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ProductID < out[j].ProductID })
	return out, nil
}

func (s *Service) enrichProductDirectionLinks(clusters []domain.ProductDirectionCluster) ([]domain.ProductDirectionCluster, error) {
	for i := range clusters {
		resolved, err := s.ProductDirectionSourceProducts(clusters[i].ID)
		if err != nil {
			return nil, err
		}
		clusters[i].SourceProducts = resolved.Products
		clusters[i].PrimaryProduct = nil
		if len(resolved.Products) == 1 && resolved.Products[0].LinkAvailable {
			primary := resolved.Products[0]
			clusters[i].PrimaryProduct = &primary
		}
	}
	return clusters, nil
}

func (s *Service) finalizeAutopilotOutputs(run *domain.MarketMapRun, prior domain.MarketMapRun, priorOK bool) error {
	rankingsByWindow := map[int]domain.RankingBuildResult{}
	for _, windowDays := range []int{7, 30, 90} {
		result, err := s.BuildRankings(domain.RankingBuildRequest{AsOf: run.CompletedAt, WindowDays: windowDays})
		if err != nil {
			if windowDays == 30 {
				return err
			}
			continue
		}
		rankingsByWindow[windowDays] = result
	}
	rankings, ok := rankingsByWindow[30]
	if !ok {
		return errors.New("30-day ranking output is unavailable")
	}
	run.RankingAsOf = rankings.Window.CurrentEnd

	clusterProducts, err := s.clusterProductsForRun(*run)
	if err != nil {
		return err
	}
	clustered := autopilot.BuildProductDirections(autopilot.ClusterInput{RunID: run.ID, Coverage: run.Coverage, AsOf: run.CompletedAt, Products: clusterProducts})
	for _, row := range clustered.Clusters {
		if err := s.autopilot.AppendProductDirectionCluster(row); err != nil {
			return err
		}
	}
	for _, row := range clustered.Reviews {
		if err := s.autopilot.AppendClassificationReview(row); err != nil {
			return err
		}
	}

	var priorPtr *domain.MarketMapRun
	priorRunID := ""
	priorCatalogs := []domain.CatalogSnapshot{}
	if priorOK && prior.ID != "" && prior.ID != run.ID {
		priorPtr = &prior
		priorRunID = prior.ID
		priorAsOf := prior.RankingAsOf
		if priorAsOf == "" {
			priorAsOf = prior.CompletedAt
		}
		priorCatalogs, _ = s.ranking.CatalogSnapshots(domain.CatalogSnapshotFilter{AsOf: priorAsOf, WindowDays: 30})
	}
	productSnapshotsByWindow := map[int][]domain.ProductSnapshot{}
	for days, result := range rankingsByWindow {
		productSnapshotsByWindow[days] = result.ProductSnapshots
	}
	if err := s.persistTrendLifecycle(*run, priorRunID, productSnapshotsByWindow); err != nil {
		return err
	}
	direction := autopilot.BuildMarketDirection(autopilot.DirectionInput{Run: *run, PriorRun: priorPtr, CurrentCatalogs: rankings.CatalogSnapshots, PriorCatalogs: priorCatalogs})
	if err := s.autopilot.AppendMarketDirectionSnapshot(direction); err != nil {
		return err
	}
	run.DirectionAvailable = !direction.CompositionOnly

	insights := autopilot.BuildProductionInsights(autopilot.ProductionInsightInput{RunID: run.ID, Coverage: run.Coverage, Confidence: run.Confidence, Catalogs: rankings.CatalogSnapshots, Clusters: clustered.Clusters})
	for _, row := range insights {
		if err := s.autopilot.AppendProductionInsight(row); err != nil {
			return err
		}
	}
	alerts := autopilot.BuildSaturationAlerts(autopilot.SaturationInput{RunID: run.ID, Catalogs: rankings.CatalogSnapshots})
	for _, row := range alerts {
		if err := s.autopilot.AppendSaturationAlert(row); err != nil {
			return err
		}
	}
	return s.autopilot.AppendMarketMapRun(*run)
}
