package app

import (
	"context"
	"errors"
	"fmt"
	envatoconn "marketsignallab/internal/connectors/envato"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/insights"
	"marketsignallab/internal/security"
	"marketsignallab/internal/universe"
	"sort"
	"strings"
	"time"
)

const marketScannerVersion = "real-market-scanner-v0.1"

var allowedEnvatoSites = map[string]bool{
	"themeforest.net":  true,
	"codecanyon.net":   true,
	"videohive.net":    true,
	"audiojungle.net":  true,
	"graphicriver.net": true,
	"photodune.net":    true,
	"3docean.net":      true,
}

func normalizeKeywords(values []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		key := strings.ToLower(value)
		if value == "" || seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, value)
	}
	return out
}

func validateMarketScanRequest(req *domain.MarketScanRequest) error {
	req.Site = strings.ToLower(strings.TrimSpace(req.Site))
	req.Category = strings.TrimSpace(req.Category)
	req.SortBy = strings.TrimSpace(req.SortBy)
	req.Keywords = normalizeKeywords(req.Keywords)
	if req.Catalog.Platform == "" {
		req.Catalog.Platform = "Envato Market"
	}
	if strings.TrimSpace(req.Catalog.ContentType) == "" {
		return errors.New("catalog contentType is required")
	}
	if len(req.Keywords) == 0 {
		return errors.New("at least one keyword is required")
	}
	if len(req.Keywords) > 20 {
		return errors.New("a scan supports at most 20 keywords")
	}
	if !allowedEnvatoSites[req.Site] {
		return errors.New("unsupported Envato Market site")
	}
	if req.MaxPages == 0 {
		req.MaxPages = 3
	}
	if req.MaxPages < 1 || req.MaxPages > 10 {
		return errors.New("maxPages must be between 1 and 10")
	}
	if req.PageSize == 0 {
		req.PageSize = 20
	}
	if req.PageSize < 1 || req.PageSize > 100 {
		return errors.New("pageSize must be between 1 and 100")
	}
	if req.RequestBudget == 0 {
		req.RequestBudget = len(req.Keywords) * req.MaxPages
		if req.RequestBudget > 60 {
			req.RequestBudget = 60
		}
	}
	if req.RequestBudget < 1 || req.RequestBudget > 60 {
		return errors.New("requestBudget must be between 1 and 60")
	}
	return nil
}

func scannerCoverage(session domain.ResearchSession) float64 {
	if session.PagesPlanned > 0 {
		value := float64(session.PagesCompleted) * 100 / float64(session.PagesPlanned)
		if value > 100 {
			return 100
		}
		return float64(int(value*10+0.5)) / 10
	}
	return universe.CoveragePercent(session.QueriesPlanned, session.CompletedQueryIDs)
}

func scannerSummary(session domain.ResearchSession) string {
	switch session.Status {
	case domain.ResearchSessionCompleted:
		return "SCAN_COMPLETE"
	case domain.ResearchSessionCancelled:
		return "SCAN_CANCELLED"
	case domain.ResearchSessionFailed:
		return "SCAN_FAILED"
	case domain.ResearchSessionPartial:
		if session.RequestsUsed >= session.RequestBudget {
			return "SCAN_PARTIAL_BUDGET"
		}
		return "SCAN_PARTIAL_ERROR"
	default:
		return "SCAN_RUNNING"
	}
}

func (s *Service) persistScannerProgress(session *domain.ResearchSession) error {
	session.QueriesCompleted = len(session.CompletedQueryIDs)
	session.CoverageEstimate = scannerCoverage(*session)
	session.LastProgressAt = time.Now().UTC().Format(time.RFC3339)
	return s.universe.AppendResearchSession(*session)
}

func (s *Service) scannerResult(session domain.ResearchSession, catalog domain.CatalogNode, queryResults []domain.MarketScanQueryResult, products, authors map[string]bool, rankingBuilt bool, rankingMessage string) domain.MarketScanResult {
	insight := insights.EvaluateScan(session, rankingBuilt)
	return domain.MarketScanResult{
		Session: session, Catalog: catalog, QueryResults: queryResults,
		Observations: session.ObservationsCollected, Products: len(products), Authors: len(authors),
		SummaryCode: scannerSummary(session), InsightCode: insight.Code, InsightSeverity: insight.Severity,
		RankingBuilt: rankingBuilt, RankingMessage: rankingMessage,
	}
}

func (s *Service) RunEnvatoMarketScan(ctx context.Context, req domain.MarketScanRequest) (domain.MarketScanResult, error) {
	if err := validateMarketScanRequest(&req); err != nil {
		return domain.MarketScanResult{}, err
	}
	token, err := s.resolvedEnvatoToken()
	if err != nil {
		return domain.MarketScanResult{}, err
	}
	defer func() { token = "" }()

	path, err := s.EnsureCatalogPath(req.Catalog)
	if err != nil {
		return domain.MarketScanResult{}, err
	}
	catalog := path[len(path)-1]
	queryIDs := make([]string, 0, len(req.Keywords))
	queries := make([]domain.ResearchQuery, 0, len(req.Keywords))
	for _, keyword := range req.Keywords {
		query, createErr := s.CreateResearchQuery(domain.ResearchQuery{
			Name: "Real Scan · " + keyword, Platform: "Envato Market", SourceType: "envato_market_api",
			QueryText: keyword, CatalogScopeID: catalog.ID, Purpose: "bounded_real_market_scan", Enabled: true,
			Filters: map[string]string{
				"site": req.Site, "category": req.Category, "page_size": fmt.Sprintf("%d", req.PageSize),
				"max_pages": fmt.Sprintf("%d", req.MaxPages), "sort_by": req.SortBy,
			},
		})
		if createErr != nil {
			return domain.MarketScanResult{}, createErr
		}
		queryIDs = append(queryIDs, query.ID)
		queries = append(queries, query)
	}
	session, err := s.StartResearchSession(StartResearchSessionRequest{
		SourceType: "envato_market_api", Scope: catalog.ID, QueryIDs: queryIDs, RequestBudget: req.RequestBudget,
	})
	if err != nil {
		return domain.MarketScanResult{}, err
	}
	session.PagesPlanned = len(queries) * req.MaxPages
	session.ScannerVersion = marketScannerVersion
	if err := s.persistScannerProgress(&session); err != nil {
		return domain.MarketScanResult{}, err
	}

	products := map[string]bool{}
	authors := map[string]bool{}
	queryResults := make([]domain.MarketScanQueryResult, 0, len(queries))

	cancel := func(cancelErr error) (domain.MarketScanResult, error) {
		session.Status = domain.ResearchSessionCancelled
		session.CompletedAt = time.Now().UTC().Format(time.RFC3339)
		_ = s.persistScannerProgress(&session)
		return s.scannerResult(session, catalog, queryResults, products, authors, false, ""), cancelErr
	}
	if err := ctx.Err(); err != nil {
		return cancel(err)
	}

	budgetExhausted := false
	for queryIndex, query := range queries {
		if err := ctx.Err(); err != nil {
			return cancel(err)
		}
		qr := domain.MarketScanQueryResult{QueryID: query.ID, QueryText: query.QueryText}
		queryProducts := map[string]bool{}
		queryAuthors := map[string]bool{}
		queryCompleted := false

		for pageNumber := 1; pageNumber <= req.MaxPages; pageNumber++ {
			if err := ctx.Err(); err != nil {
				queryResults = append(queryResults, qr)
				return cancel(err)
			}
			remaining := session.RequestBudget - session.RequestsUsed
			if remaining <= 0 {
				budgetExhausted = true
				qr.StoppedReason = "request_budget"
				break
			}
			maxHTTPRequests := 2
			if remaining < maxHTTPRequests {
				maxHTTPRequests = remaining
			}
			pageResult, callErr := s.envato.SearchPage(ctx, token, envatoconn.SearchRequest{
				Term: query.QueryText, Site: req.Site, Category: req.Category, Page: pageNumber,
				PageSize: req.PageSize, SortBy: req.SortBy,
			}, maxHTTPRequests)
			session.RequestsUsed += pageResult.HTTPRequests
			if callErr != nil {
				message := security.RedactSecret(callErr.Error(), token)
				session.Errors = append(session.Errors, message)
				if session.PagesCompleted == 0 {
					session.Status = domain.ResearchSessionFailed
				} else {
					session.Status = domain.ResearchSessionPartial
				}
				session.CompletedAt = time.Now().UTC().Format(time.RFC3339)
				qr.StoppedReason = "connector_error"
				queryResults = append(queryResults, qr)
				_ = s.persistScannerProgress(&session)
				return s.scannerResult(session, catalog, queryResults, products, authors, false, ""), ConnectorError{Err: callErr}
			}
			if pageNumber == 1 {
				qr.TotalHits = pageResult.Aggregate.TotalHits
				qr.TotalHitsExact = pageResult.Aggregate.TotalHitsExact
			}
			for _, item := range pageResult.Items {
				position := (pageNumber-1)*req.PageSize + item.Position
				observation, recordErr := s.recordObservedProduct(domain.ObservedProductInput{
					SessionID: session.ID, QueryID: query.ID, CatalogID: catalog.ID, SourceType: "envato_market_api",
					ExternalItemID: item.ExternalItemID, Title: item.Title, ExternalAuthorKey: item.AuthorKey,
					AuthorDisplayName: item.AuthorDisplayName, SourceURL: item.SourceURL, PreviewRef: item.PreviewRef,
					CategoryText: item.CategoryText, ReleasedAt: item.ReleasedAt, ReleasePrecision: domain.ReleasePrecision(item.ReleasePrecision), ReleaseSourceField: item.ReleaseField, SurfaceType: "search", Position: position, Page: pageNumber,
					ObservedAt: pageResult.Aggregate.ObservedAt, ObservationReliability: 0.9,
				})
				if recordErr != nil {
					return s.scannerResult(session, catalog, queryResults, products, authors, false, ""), recordErr
				}
				products[observation.ProductID] = true
				queryProducts[observation.ProductID] = true
				if observation.AuthorID != "" {
					authors[observation.AuthorID] = true
					queryAuthors[observation.AuthorID] = true
				}
				qr.ItemsObserved++
				session.ObservationsCollected++
			}
			qr.PagesCompleted++
			session.PagesCompleted++
			session.ProductsObserved = len(products)
			session.AuthorsObserved = len(authors)
			if len(pageResult.Items) < req.PageSize {
				unused := req.MaxPages - pageNumber
				if unused > 0 {
					session.PagesPlanned -= unused
				}
				qr.StoppedReason = "last_page"
				queryCompleted = true
			} else if pageNumber == req.MaxPages {
				qr.StoppedReason = "max_pages"
				queryCompleted = true
			}
			if err := s.persistScannerProgress(&session); err != nil {
				return domain.MarketScanResult{}, err
			}
			if queryCompleted {
				break
			}
		}
		qr.UniqueProducts = len(queryProducts)
		qr.UniqueAuthors = len(queryAuthors)
		if queryCompleted {
			session.CompletedQueryIDs = addUnique(session.CompletedQueryIDs, query.ID)
		}
		queryResults = append(queryResults, qr)
		if err := s.persistScannerProgress(&session); err != nil {
			return domain.MarketScanResult{}, err
		}
		if budgetExhausted {
			// Remove the unattempted pages from neither the plan nor coverage: they remain missing scope.
			_ = queryIndex
			break
		}
	}

	session.ProductsObserved = len(products)
	session.AuthorsObserved = len(authors)
	session.QueriesCompleted = len(session.CompletedQueryIDs)
	if session.QueriesCompleted == session.QueriesPlanned {
		session.Status = domain.ResearchSessionCompleted
	} else if session.PagesCompleted > 0 || session.RequestsUsed > 0 {
		session.Status = domain.ResearchSessionPartial
	} else {
		session.Status = domain.ResearchSessionFailed
	}
	session.CompletedAt = time.Now().UTC().Format(time.RFC3339)
	if err := s.persistScannerProgress(&session); err != nil {
		return domain.MarketScanResult{}, err
	}

	rankingBuilt := false
	rankingMessage := ""
	if req.AutoBuildRanking && session.ObservationsCollected > 0 {
		_, rankErr := s.BuildRankings(domain.RankingBuildRequest{WindowDays: 30, AsOf: time.Now().UTC().Format(time.RFC3339), CatalogScopeID: catalog.ID})
		if rankErr != nil {
			rankingMessage = rankErr.Error()
		} else {
			rankingBuilt = true
		}
	}
	result := s.scannerResult(session, catalog, queryResults, products, authors, rankingBuilt, rankingMessage)
	// Keep deterministic order even when repository implementations evolve.
	sort.Slice(result.QueryResults, func(i, j int) bool { return result.QueryResults[i].QueryText < result.QueryResults[j].QueryText })
	return result, nil
}

func (s *Service) VerifyEnvatoConnection(ctx context.Context, token string) (envatoconn.ConnectionStatus, error) {
	status, err := s.envato.VerifyConnection(ctx, token)
	if err != nil {
		return status, ConnectorError{Err: err}
	}
	return status, nil
}

func (s *Service) ListScannerSessions() ([]domain.ResearchSession, error) {
	rows, err := s.universe.ResearchSessions()
	if err != nil {
		return nil, err
	}
	latest := map[string]domain.ResearchSession{}
	for _, row := range rows {
		if row.SourceType != "envato_market_api" || row.ScannerVersion == "" {
			continue
		}
		previous, ok := latest[row.ID]
		if !ok || row.LastProgressAt > previous.LastProgressAt || (row.LastProgressAt == previous.LastProgressAt && row.CompletedAt > previous.CompletedAt) {
			latest[row.ID] = row
		}
	}
	out := make([]domain.ResearchSession, 0, len(latest))
	for _, row := range latest {
		out = append(out, row)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].StartedAt > out[j].StartedAt })
	return out, nil
}
