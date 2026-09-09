package app

import (
	"context"
	"errors"
	"fmt"
	"marketsignallab/internal/autopilot"
	envatoconn "marketsignallab/internal/connectors/envato"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/security"
	"sort"
	"strings"
	"time"
)

type AutopilotRunError struct{ Err error }

func (e AutopilotRunError) Error() string { return e.Err.Error() }
func (e AutopilotRunError) Unwrap() error { return e.Err }

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func (s *Service) mapCategories(ctx context.Context, token string, budget int) (map[string][]envatoconn.CategoryNode, int, []string) {
	categories := map[string][]envatoconn.CategoryNode{}
	used := 0
	errs := []string{}
	for _, site := range autopilot.SupportedSites() {
		remaining := budget - used
		if remaining <= 0 {
			errs = append(errs, "request_budget_exhausted")
			break
		}
		got, err := s.envato.Categories(ctx, token, site, minInt(2, remaining))
		used += got.HTTPRequests
		if err != nil {
			errs = append(errs, site+": "+security.RedactSecret(err.Error(), token))
			categories[site] = []envatoconn.CategoryNode{}
			continue
		}
		categories[site] = got.Categories
	}
	return categories, used, errs
}

func surfaceCatalogInput(target domain.MarketMapSurfaceTarget) domain.CatalogPathInput {
	return domain.CatalogPathInput{
		Platform: "Envato Market", ContentType: target.ContentType, Catalog: target.CategoryName,
		Origin: domain.CatalogOriginScanner, SourceSurface: target.Surface,
	}
}

func (s *Service) runSurface(ctx context.Context, token string, run domain.MarketMapRun, target domain.MarketMapSurfaceTarget, allowance int) (envatoconn.SurfaceResult, domain.CatalogNode, error) {
	var result envatoconn.SurfaceResult
	var err error
	request := envatoconn.SurfaceRequest{Site: target.Site, Category: target.Category, PageSize: target.PageSize}
	switch target.Surface {
	case "popular":
		result, err = s.envato.PopularItems(ctx, token, request, allowance)
	case "featured":
		result, err = s.envato.FeaturedItems(ctx, token, request, allowance)
	case "random_new":
		result, err = s.envato.RandomNewItems(ctx, token, request, allowance)
	case domain.MarketSurfaceNew:
		result, err = s.envato.NewItems(ctx, token, request, allowance)
	default:
		return result, domain.CatalogNode{}, fmt.Errorf("unsupported surface %s", target.Surface)
	}
	if err != nil {
		return result, domain.CatalogNode{}, err
	}
	path, pathErr := s.EnsureCatalogPath(surfaceCatalogInput(target))
	if pathErr != nil {
		return result, domain.CatalogNode{}, pathErr
	}
	return result, path[len(path)-1], nil
}

func (s *Service) persistSurfaceItems(run *domain.MarketMapRun, target domain.MarketMapSurfaceTarget, result envatoconn.SurfaceResult, catalog domain.CatalogNode) error {
	query, err := s.CreateResearchQuery(domain.ResearchQuery{Name: "Autopilot · " + target.Site + " · " + string(target.Surface), Platform: "Envato Market", SourceType: "envato_market_api", QueryText: "surface:" + string(target.Surface) + ":" + target.Site + ":" + target.Category, CatalogScopeID: catalog.ID, Purpose: "market_autopilot_surface", Enabled: true, Filters: map[string]string{"site": target.Site, "surface": string(target.Surface), "category": target.Category}})
	if err != nil {
		return err
	}
	session, err := s.StartResearchSession(StartResearchSessionRequest{SourceType: "envato_market_api", Scope: catalog.ID, QueryIDs: []string{query.ID}, RequestBudget: maxInt(1, target.RequestAllowance)})
	if err != nil {
		return err
	}
	session.MarketMapRunID = run.ID
	session.ScannerVersion = "market-autopilot-v0.1"
	session.PagesPlanned = 1
	if err := s.universe.AppendResearchSession(session); err != nil {
		return err
	}
	productSet := map[string]bool{}
	authorSet := map[string]bool{}
	for _, item := range result.Items {
		obs, err := s.recordObservedProduct(domain.ObservedProductInput{SessionID: session.ID, QueryID: query.ID, CatalogID: catalog.ID, SourceType: "envato_market_api", ExternalItemID: item.ExternalItemID, Title: item.Title, ExternalAuthorKey: item.AuthorKey, AuthorDisplayName: item.AuthorDisplayName, SourceURL: item.SourceURL, PreviewRef: item.PreviewRef, CategoryText: item.CategoryText, ReleasedAt: item.ReleasedAt, ReleasePrecision: domain.ReleasePrecision(item.ReleasePrecision), ReleaseSourceField: item.ReleaseField, SurfaceType: target.Surface, Position: item.Position, Page: 1, ObservedAt: result.ObservedAt, ObservationReliability: .9, MarketMapRunID: run.ID})
		if err != nil {
			return err
		}
		productSet[obs.ProductID] = true
		if obs.AuthorID != "" {
			authorSet[obs.AuthorID] = true
		}
		if err := s.autopilot.AppendMarketSurfaceObservation(domain.MarketSurfaceObservation{ID: domain.NewID(), RunID: run.ID, TargetID: target.ID, Site: target.Site, Surface: target.Surface, Category: target.Category, ExternalItemID: item.ExternalItemID, ProductID: obs.ProductID, AuthorID: obs.AuthorID, Position: item.Position, ObservedAt: result.ObservedAt, Reliability: .9}); err != nil {
			return err
		}
	}
	session.CompletedAt = time.Now().UTC().Format(time.RFC3339)
	session.Status = domain.ResearchSessionCompleted
	session.RequestsUsed = result.HTTPRequests
	session.PagesCompleted = 1
	session.CompletedQueryIDs = []string{query.ID}
	session.QueriesCompleted = 1
	session.CoverageEstimate = 100
	session.ObservationsCollected = len(result.Items)
	session.ProductsObserved = len(productSet)
	session.AuthorsObserved = len(authorSet)
	session.LastProgressAt = session.CompletedAt
	return s.universe.AppendResearchSession(session)
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func (s *Service) RunMarketAutopilot(ctx context.Context, mode domain.MarketMapMode) (domain.MarketAutopilotView, error) {
	if err := s.RequireAnalyticsRuntime(ctx); err != nil {
		return domain.MarketAutopilotView{}, err
	}
	token, err := s.resolvedEnvatoToken()
	if err != nil {
		return domain.MarketAutopilotView{}, err
	}
	defer func() { token = "" }()
	return s.runMarketAutopilotWithID(ctx, token, mode, "")
}

func (s *Service) runMarketAutopilotWithID(ctx context.Context, token string, mode domain.MarketMapMode, forcedRunID string) (domain.MarketAutopilotView, error) {
	if err := s.RequireAnalyticsRuntime(ctx); err != nil {
		return domain.MarketAutopilotView{}, err
	}
	token = strings.TrimSpace(token)
	if token == "" {
		return domain.MarketAutopilotView{}, errors.New("Envato personal token is required")
	}
	runID := strings.TrimSpace(forcedRunID)
	if runID == "" {
		runID = domain.NewID()
	}
	startedAt := time.Now().UTC()
	if _, ok := s.telemetry.Snapshot(runID); !ok {
		_ = s.telemetry.Begin(domain.MarketMapRun{ID: runID, Status: domain.MarketMapRunRunning, StartedAt: startedAt.Format(time.RFC3339)}, domain.RuntimeCompatibility{}, 0)
	}
	_ = s.telemetry.StartStage(runID, domain.StagePreparingScanPlan)
	_ = s.telemetry.CompleteStage(runID, domain.StagePreparingScanPlan)
	_ = s.telemetry.StartStage(runID, domain.StageValidatingSources)
	if _, err := s.envato.VerifyConnection(ctx, token); err != nil {
		_ = s.telemetry.Fail(runID, domain.StageValidatingSources, "source_validation_failed", security.RedactSecret(err.Error(), token))
		s.telemetry.SetRunStatus(runID, domain.MarketMapRunFailed)
		_, _ = s.telemetry.Finalize(runID, domain.MarketMapRunFailed)
		return domain.MarketAutopilotView{}, fmt.Errorf("Envato connection verification failed: %w", err)
	}
	_ = s.telemetry.Emit(runID, domain.ScanTelemetryEvent{Stage: domain.StageValidatingSources, Severity: domain.TelemetryInfo, Code: "token_verified", MessageKey: "telemetry.token_verified"})
	_ = s.telemetry.CompleteStage(runID, domain.StageValidatingSources)

	budget := 28
	if mode == domain.MarketMapModeStandard {
		budget = 48
	} else if mode == domain.MarketMapModeDeep {
		budget = 60
	} else if mode != domain.MarketMapModeQuick {
		_, _ = s.telemetry.Finalize(runID, domain.MarketMapRunFailed)
		return domain.MarketAutopilotView{}, errors.New("unsupported market map mode")
	}

	_ = s.telemetry.StartStage(runID, domain.StageLoadingCatalogStructure)
	categories := map[string][]envatoconn.CategoryNode{}
	used := 0
	categoryErrors := []string{}
	if mode != domain.MarketMapModeQuick {
		categories, used, categoryErrors = s.mapCategories(ctx, token, budget)
	}
	_ = s.telemetry.CompleteStage(runID, domain.StageLoadingCatalogStructure)

	plan, err := autopilot.BuildPlan(autopilot.PlanInput{Mode: mode, Categories: categories, CreatedAt: time.Now().UTC().Format(time.RFC3339), BootstrapRequestsUsed: used})
	if err != nil {
		_ = s.telemetry.Fail(runID, domain.StagePreparingScanPlan, "plan_build_failed", err.Error())
		_, _ = s.telemetry.Finalize(runID, domain.MarketMapRunFailed)
		return domain.MarketAutopilotView{}, err
	}
	if err := s.autopilot.SaveMarketMapPlan(plan); err != nil {
		_, _ = s.telemetry.Finalize(runID, domain.MarketMapRunFailed)
		return domain.MarketAutopilotView{}, err
	}
	surfaces := []string{}
	seenSurface := map[string]bool{}
	for _, target := range plan.Targets {
		v := string(target.Surface)
		if !seenSurface[v] {
			seenSurface[v] = true
			surfaces = append(surfaces, v)
		}
	}
	compat := domain.RuntimeCompatibility{PlannerVersion: plan.PlannerVersion, SamplingSchemaVersion: plan.SamplingSchemaVersion, TaxonomyVersion: plan.TaxonomyVersion, IndexWeightingVersion: plan.IndexWeightingVersion, Sites: append([]string(nil), plan.Sites...), Surfaces: surfaces, PlannedWorkUnits: len(plan.Targets) + 7}
	_ = s.telemetry.Configure(runID, compat, len(plan.Targets)+7, plan.RequestBudget)

	run := domain.MarketMapRun{ID: runID, PlanID: plan.ID, Mode: mode, CompatibilityKey: plan.CompatibilityKey, SamplingSchemaVersion: plan.SamplingSchemaVersion, TaxonomyVersion: plan.TaxonomyVersion, IndexWeightingVersion: plan.IndexWeightingVersion, StartedAt: startedAt.Format(time.RFC3339), Status: domain.MarketMapRunRunning, RequestsUsed: used, TargetsPlanned: len(plan.Targets), DirectionStage: domain.DirectionStageComposition, IntegrityStatus: domain.IntegrityStatusNativeAlpha65, Errors: append([]string{}, categoryErrors...)}
	if err := s.autopilot.AppendMarketMapRun(run); err != nil {
		_, _ = s.telemetry.Finalize(runID, domain.MarketMapRunFailed)
		return domain.MarketAutopilotView{}, err
	}
	s.telemetry.Advance(runID, 0, 0, used, 0)
	products := map[string]bool{}
	authors := map[string]bool{}
	deniedSurfaces := 0

	persistProgress := func() error {
		run.Coverage = roundOne(float64(run.TargetsCompleted) * 100 / float64(maxInt(1, run.TargetsPlanned)))
		run.Confidence = minFloat(90, maxFloat(0, run.Coverage*.8-float64(len(run.Errors))*2))
		return s.autopilot.AppendMarketMapRun(run)
	}
	finishWithoutOutputs := func(status domain.MarketMapRunStatus, cause error) (domain.MarketAutopilotView, error) {
		run.Status = status
		run.CompletedAt = time.Now().UTC().Format(time.RFC3339)
		if cause != nil {
			run.Errors = append(run.Errors, security.RedactSecret(cause.Error(), token))
		}
		_ = persistProgress()
		s.telemetry.SetRunStatus(runID, status)
		if cause != nil {
			_ = s.telemetry.Fail(runID, domain.StageFinalizingMarketMap, "scan_terminal_error", security.RedactSecret(cause.Error(), token))
		}
		_, _ = s.telemetry.Finalize(runID, status)
		view, _ := s.AutopilotView(run.ID)
		if cause == nil {
			cause = errors.New("market map did not collect usable observations")
		}
		return view, AutopilotRunError{Err: cause}
	}

	_ = s.telemetry.StartStage(runID, domain.StageMappingMarketSurfaces)
	for targetIndex, target := range plan.Targets {
		if err := ctx.Err(); err != nil {
			return finishWithoutOutputs(domain.MarketMapRunCancelled, err)
		}
		remaining := plan.RequestBudget - run.RequestsUsed
		if remaining <= 0 {
			run.Errors = append(run.Errors, "market map request budget exhausted")
			_ = s.telemetry.Warn(runID, domain.StageMappingMarketSurfaces, "request_budget_exhausted", "market map request budget exhausted")
			completedAt := time.Now().UTC().Format(time.RFC3339)
			for _, skipped := range plan.Targets[targetIndex:] {
				_ = s.integrity.AppendMarketMapTargetResult(domain.MarketMapTargetResult{ID: domain.NewID(), RunID: run.ID, TargetID: skipped.ID, StratumKey: skipped.StratumKey, Status: domain.MarketMapTargetSkipped, FailureCode: "request_budget_exhausted", CompletedAt: completedAt})
			}
			break
		}
		targetStarted := time.Now()
		telemetryCtx := envatoconn.WithRequestTelemetry(ctx, target.Site, string(target.Surface), func(rt envatoconn.RequestTelemetry) {
			s.telemetry.RecordRequest(runID, rt.Latency, rt.RetryCount, rt.RetryDelay)
			if rt.HTTPStatus == 429 {
				_ = s.telemetry.Emit(runID, domain.ScanTelemetryEvent{Stage: domain.StageMappingMarketSurfaces, Severity: domain.TelemetryWarning, Code: "rate_limit_retry", MessageKey: "telemetry.rate_limit_retry", Site: rt.Site, Surface: rt.Surface, HTTPStatus: rt.HTTPStatus, LatencyMs: rt.Latency.Milliseconds(), RetryCount: rt.RetryCount, RetryDelayMs: rt.RetryDelay.Milliseconds()})
			}
		})
		result, catalog, callErr := s.runSurface(telemetryCtx, token, run, target, minInt(maxInt(1, target.RequestAllowance), remaining))
		run.RequestsUsed += result.HTTPRequests
		if callErr != nil {
			_ = s.integrity.AppendMarketMapTargetResult(domain.MarketMapTargetResult{ID: domain.NewID(), RunID: run.ID, TargetID: target.ID, StratumKey: target.StratumKey, Status: domain.MarketMapTargetFailed, RequestsUsed: result.HTTPRequests, FailureCode: "source_request_failed", CompletedAt: time.Now().UTC().Format(time.RFC3339)})
			safe := security.RedactSecret(callErr.Error(), token)
			run.Errors = append(run.Errors, fmt.Sprintf("%s/%s: %s", target.Site, target.Surface, safe))
			_ = s.telemetry.Warn(runID, domain.StageMappingMarketSurfaces, "source_request_failed", fmt.Sprintf("%s/%s: %s", target.Site, target.Surface, safe))
			s.telemetry.Advance(runID, 1, len(products), run.RequestsUsed, time.Since(targetStarted))
			if err := persistProgress(); err != nil {
				return finishWithoutOutputs(domain.MarketMapRunPartial, err)
			}
			var statusErr *envatoconn.HTTPStatusError
			if errors.As(callErr, &statusErr) {
				if statusErr.StatusCode == 401 {
					return finishWithoutOutputs(domain.MarketMapRunFailed, callErr)
				}
				if statusErr.StatusCode == 403 {
					deniedSurfaces++
				}
			}
			continue
		}
		if err := s.persistSurfaceItems(&run, target, result, catalog); err != nil {
			_ = s.integrity.AppendMarketMapTargetResult(domain.MarketMapTargetResult{ID: domain.NewID(), RunID: run.ID, TargetID: target.ID, StratumKey: target.StratumKey, Status: domain.MarketMapTargetPartial, RequestsUsed: result.HTTPRequests, ObservedItems: len(result.Items), FailureCode: "persistence_failed", CompletedAt: time.Now().UTC().Format(time.RFC3339)})
			status := domain.MarketMapRunPartial
			if run.ObservationsCollected == 0 {
				status = domain.MarketMapRunFailed
			}
			return finishWithoutOutputs(status, err)
		}
		uniqueTargetProducts := map[string]struct{}{}
		for _, item := range result.Items {
			product, ok, _ := s.universe.ProductBySource("envato_market_api", item.ExternalItemID)
			if ok {
				products[product.ID] = true
				uniqueTargetProducts[product.ID] = struct{}{}
				meta, has, _ := s.universe.LatestLiveProductMetadata(product.ID)
				if has && meta.AuthorID != "" {
					authors[meta.AuthorID] = true
				}
			}
		}
		_ = s.integrity.AppendMarketMapTargetResult(domain.MarketMapTargetResult{ID: domain.NewID(), RunID: run.ID, TargetID: target.ID, StratumKey: target.StratumKey, Status: domain.MarketMapTargetCompleted, RequestsUsed: result.HTTPRequests, ObservedItems: len(result.Items), UniqueProducts: len(uniqueTargetProducts), CompletedAt: time.Now().UTC().Format(time.RFC3339)})
		run.TargetsCompleted++
		run.ObservationsCollected += len(result.Items)
		run.ProductsObserved = len(products)
		run.AuthorsObserved = len(authors)
		s.telemetry.Advance(runID, 1, len(products), run.RequestsUsed, time.Since(targetStarted))
		_ = s.telemetry.Emit(runID, domain.ScanTelemetryEvent{Stage: domain.StageMappingMarketSurfaces, Severity: domain.TelemetryInfo, Code: "surface_completed", MessageKey: "telemetry.surface_completed", Site: target.Site, Surface: string(target.Surface), Catalog: target.CategoryName, ItemsReceived: len(result.Items), UniqueProducts: len(uniqueTargetProducts)})
		if err := persistProgress(); err != nil {
			return domain.MarketAutopilotView{}, err
		}
	}
	_ = s.telemetry.CompleteStage(runID, domain.StageMappingMarketSurfaces)

	if run.ObservationsCollected == 0 {
		if deniedSurfaces > 0 {
			return finishWithoutOutputs(domain.MarketMapRunFailed, errors.New("Envato accepted the personal token, but the tested catalog surfaces returned HTTP 403; review the saved surface diagnostics or try Quick mode"))
		}
		return finishWithoutOutputs(domain.MarketMapRunFailed, errors.New("no market surface observations were collected"))
	}
	run.Status = domain.MarketMapRunCompleted
	if len(run.Errors) > 0 || run.TargetsCompleted < run.TargetsPlanned {
		run.Status = domain.MarketMapRunPartial
	}
	run.CompletedAt = time.Now().UTC().Format(time.RFC3339)

	for _, stage := range []domain.ScanStage{domain.StageNormalizingProducts, domain.StageDeduplicating} {
		_ = s.telemetry.StartStage(runID, stage)
		s.telemetry.Advance(runID, 1, len(products), run.RequestsUsed, time.Millisecond)
		_ = s.telemetry.CompleteStage(runID, stage)
	}
	remainingForDetails := plan.RequestBudget - run.RequestsUsed
	if remainingForDetails > 0 {
		productIDs := make([]string, 0, len(products))
		for productID := range products {
			productIDs = append(productIDs, productID)
		}
		run.RequestsUsed += s.enrichOfficialReleases(ctx, token, productIDs, remainingForDetails)
		s.telemetry.Advance(runID, 0, len(products), run.RequestsUsed, 0)
	}
	if err := persistProgress(); err != nil {
		return domain.MarketAutopilotView{}, err
	}

	for _, stage := range []domain.ScanStage{domain.StageTaxonomySegmentation, domain.StageSignalQualityAudit, domain.StageRankingConsensus} {
		_ = s.telemetry.StartStage(runID, stage)
	}
	if err := s.RequireAnalyticsRuntime(ctx); err != nil {
		run.Errors = append(run.Errors, err.Error())
		run.Status = domain.MarketMapRunPartial
		_ = persistProgress()
		return finishWithoutOutputs(domain.MarketMapRunPartial, err)
	}
	if _, err := s.finalizeAlpha65Outputs(run.ID); err != nil {
		run.Errors = append(run.Errors, err.Error())
		run.Status = domain.MarketMapRunPartial
		_ = persistProgress()
		return finishWithoutOutputs(domain.MarketMapRunPartial, err)
	}
	for _, stage := range []domain.ScanStage{domain.StageTaxonomySegmentation, domain.StageSignalQualityAudit, domain.StageRankingConsensus} {
		s.telemetry.Advance(runID, 1, len(products), run.RequestsUsed, time.Millisecond)
		_ = s.telemetry.CompleteStage(runID, stage)
	}
	_ = s.telemetry.StartStage(runID, domain.StagePersistingHistory)
	s.telemetry.Advance(runID, 1, len(products), run.RequestsUsed, time.Millisecond)
	_ = s.telemetry.CompleteStage(runID, domain.StagePersistingHistory)
	_ = s.telemetry.StartStage(runID, domain.StageFinalizingMarketMap)
	s.telemetry.Advance(runID, 1, len(products), run.RequestsUsed, time.Millisecond)
	_ = s.telemetry.CompleteStage(runID, domain.StageFinalizingMarketMap)
	s.telemetry.SetRunStatus(runID, run.Status)
	_, _ = s.telemetry.Finalize(runID, run.Status)
	return s.AutopilotView(run.ID)
}

func roundOne(v float64) float64 { return float64(int(v*10+.5)) / 10 }
func minFloat(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}
func maxFloat(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

func (s *Service) AutopilotView(runID string) (domain.MarketAutopilotView, error) {
	run, ok, err := s.autopilot.MarketMapRunByID(runID)
	if err != nil || !ok {
		if err == nil {
			err = errors.New("market map run not found")
		}
		return domain.MarketAutopilotView{}, err
	}
	plan, _, err := s.autopilot.MarketMapPlanByID(run.PlanID)
	if err != nil {
		return domain.MarketAutopilotView{}, err
	}
	directions, _ := s.autopilot.MarketDirectionSnapshots(run.ID)
	clusters, err := s.autopilot.ProductDirectionClusters(run.ID)
	if err != nil {
		return domain.MarketAutopilotView{}, err
	}
	clusters, err = s.enrichProductDirectionLinks(clusters)
	if err != nil {
		return domain.MarketAutopilotView{}, err
	}
	directionLinks, err := s.ProductDirectionLinkSummaries(run.ID)
	if err != nil {
		return domain.MarketAutopilotView{}, err
	}
	insights, _ := s.autopilot.ProductionInsights(run.ID)
	alerts, _ := s.autopilot.SaturationAlerts(run.ID)
	reviews, _ := s.autopilot.ClassificationReviews(run.ID)
	catalogs, _ := s.ranking.CatalogSnapshots(domain.CatalogSnapshotFilter{AsOf: run.RankingAsOf, WindowDays: 30})
	products, _ := s.ranking.ProductSnapshots(domain.ProductSnapshotFilter{AsOf: run.RankingAsOf, WindowDays: 30})
	var direction *domain.MarketDirectionSnapshot
	if len(directions) > 0 {
		last := directions[len(directions)-1]
		direction = &last
	}
	sort.Slice(clusters, func(i, j int) bool { return clusters[i].Opportunity > clusters[j].Opportunity })
	sort.Slice(insights, func(i, j int) bool { return insights[i].Priority > insights[j].Priority })
	integritySummary, err := s.loadIntegritySummary(run.ID)
	if err != nil {
		return domain.MarketAutopilotView{}, err
	}
	return domain.MarketAutopilotView{Plan: plan, Run: run, Direction: direction, Catalogs: catalogs, Products: products, Directions: clusters, DirectionLinks: directionLinks, Insights: insights, Alerts: alerts, Reviews: reviews, Integrity: integritySummary}, nil
}

func (s *Service) LatestAutopilotView() (domain.MarketAutopilotView, bool, error) {
	runs, err := s.autopilot.MarketMapRuns()
	if err != nil {
		return domain.MarketAutopilotView{}, false, err
	}
	if len(runs) == 0 {
		return domain.MarketAutopilotView{}, false, nil
	}
	sort.Slice(runs, func(i, j int) bool { return runs[i].StartedAt > runs[j].StartedAt })
	view, err := s.AutopilotView(runs[0].ID)
	return view, err == nil, err
}
func (s *Service) AutopilotRuns() ([]domain.MarketMapRun, error) {
	rows, err := s.autopilot.MarketMapRuns()
	sort.Slice(rows, func(i, j int) bool { return rows[i].StartedAt > rows[j].StartedAt })
	return rows, err
}
