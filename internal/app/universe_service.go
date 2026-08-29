package app

import (
	"context"
	"errors"
	"fmt"
	"io"
	envatoconn "marketsignallab/internal/connectors/envato"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/ingest"
	"marketsignallab/internal/security"
	"marketsignallab/internal/segmentation"
	"marketsignallab/internal/universe"
	"net/url"
	"strconv"
	"strings"
	"time"
)

func (s *Service) EnsureCatalogPath(in domain.CatalogPathInput) ([]domain.CatalogNode, error) {
	now := time.Now().UTC().Format(time.RFC3339)
	draft, err := universe.BuildCatalogPath(in, now)
	if err != nil {
		return nil, err
	}
	out := make([]domain.CatalogNode, 0, len(draft))
	parentID := ""
	for _, node := range draft {
		node.ParentID = parentID
		previous, ok, err := s.universe.CatalogByCanonicalKey(node.CanonicalKey)
		if err != nil {
			return nil, err
		}
		if ok {
			node.ID = previous.ID
			node.FirstSeenAt = previous.FirstSeenAt
			if previous.Origin != "" {
				node.Origin = previous.Origin
			}
			if previous.AnalyticalStatus != "" {
				node.AnalyticalStatus = previous.AnalyticalStatus
			}
			node.ExcludedFromRanking = previous.ExcludedFromRanking
		}
		node.LastSeenAt = now
		if err := s.universe.SaveCatalogNode(node); err != nil {
			return nil, err
		}
		out = append(out, node)
		parentID = node.ID
	}
	return out, nil
}

func (s *Service) CreateResearchQuery(v domain.ResearchQuery) (domain.ResearchQuery, error) {
	if strings.TrimSpace(v.Name) == "" || strings.TrimSpace(v.Platform) == "" || strings.TrimSpace(v.SourceType) == "" || strings.TrimSpace(v.QueryText) == "" || strings.TrimSpace(v.CatalogScopeID) == "" || strings.TrimSpace(v.Purpose) == "" {
		return v, errors.New("name, platform, sourceType, queryText, catalogScopeId, and purpose are required")
	}
	if _, err := s.policies.Require(v.SourceType); err != nil {
		return v, err
	}
	if _, ok, err := s.universe.CatalogByID(v.CatalogScopeID); err != nil {
		return v, err
	} else if !ok {
		return v, errors.New("catalog scope not found")
	}
	if v.ID == "" {
		v.ID = domain.NewID()
	}
	if v.CreatedAt == "" {
		v.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	} else if _, err := time.Parse(time.RFC3339, v.CreatedAt); err != nil {
		return v, errors.New("createdAt must be RFC3339")
	}
	if err := s.universe.SaveResearchQuery(v); err != nil {
		return v, err
	}
	return v, nil
}

func (s *Service) ListResearchQueries() ([]domain.ResearchQuery, error) {
	return s.universe.ResearchQueries()
}

type StartResearchSessionRequest struct {
	SourceType    string   `json:"sourceType"`
	Scope         string   `json:"scope"`
	QueryIDs      []string `json:"queryIds"`
	RequestBudget int      `json:"requestBudget"`
}

func uniqueIDs(xs []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, value := range xs {
		value = strings.TrimSpace(value)
		if value != "" && !seen[value] {
			seen[value] = true
			out = append(out, value)
		}
	}
	return out
}

func (s *Service) StartResearchSession(req StartResearchSessionRequest) (domain.ResearchSession, error) {
	policy, err := s.policies.Require(req.SourceType)
	if err != nil {
		return domain.ResearchSession{}, err
	}
	if _, ok, err := s.universe.CatalogByID(req.Scope); err != nil {
		return domain.ResearchSession{}, err
	} else if !ok {
		return domain.ResearchSession{}, errors.New("research scope catalog not found")
	}
	ids := uniqueIDs(req.QueryIDs)
	if len(ids) == 0 {
		return domain.ResearchSession{}, errors.New("at least one query is required")
	}
	nodes, err := s.universe.CatalogNodes()
	if err != nil {
		return domain.ResearchSession{}, err
	}
	for _, id := range ids {
		query, ok, err := s.universe.ResearchQueryByID(id)
		if err != nil {
			return domain.ResearchSession{}, err
		}
		if !ok {
			return domain.ResearchSession{}, fmt.Errorf("research query not found: %s", id)
		}
		if !query.Enabled {
			return domain.ResearchSession{}, fmt.Errorf("research query disabled: %s", id)
		}
		if query.SourceType != req.SourceType || !universe.IsCatalogWithin(nodes, req.Scope, query.CatalogScopeID) {
			return domain.ResearchSession{}, fmt.Errorf("query %s does not match session source/scope", id)
		}
	}
	if policy.CollectionMode == "manual_import" {
		if req.RequestBudget != 0 {
			return domain.ResearchSession{}, errors.New("manual/import sessions require requestBudget=0")
		}
	} else if req.RequestBudget < 1 || req.RequestBudget > policy.MaxRequestBudget {
		return domain.ResearchSession{}, fmt.Errorf("requestBudget must be between 1 and %d", policy.MaxRequestBudget)
	}
	now := time.Now().UTC().Format(time.RFC3339)
	session := domain.ResearchSession{
		ID:                domain.NewID(),
		StartedAt:         now,
		SourceType:        req.SourceType,
		Scope:             req.Scope,
		RequestBudget:     req.RequestBudget,
		QueryIDs:          ids,
		CompletedQueryIDs: []string{},
		QueriesPlanned:    len(ids),
		QueriesCompleted:  0,
		Status:            domain.ResearchSessionRunning,
		CoverageEstimate:  0,
	}
	if err := s.universe.AppendResearchSession(session); err != nil {
		return session, err
	}
	return session, nil
}

func (s *Service) ResearchSession(id string) (domain.ResearchSession, bool, error) {
	return s.universe.LatestResearchSession(id)
}

func terminalSessionStatus(v domain.ResearchSessionStatus) bool {
	return v == domain.ResearchSessionCompleted || v == domain.ResearchSessionPartial || v == domain.ResearchSessionFailed || v == domain.ResearchSessionCancelled
}

func containsID(xs []string, value string) bool {
	for _, item := range xs {
		if item == value {
			return true
		}
	}
	return false
}

func sourceSiteForObservation(query domain.ResearchQuery, in domain.ObservedProductInput) string {
	if query.Filters != nil {
		if site := strings.TrimSpace(query.Filters["site"]); site != "" {
			return strings.TrimPrefix(strings.ToLower(site), "www.")
		}
	}
	if parsed, err := url.Parse(strings.TrimSpace(in.SourceURL)); err == nil && parsed.Hostname() != "" {
		return strings.TrimPrefix(strings.ToLower(parsed.Hostname()), "www.")
	}
	if strings.Contains(in.SourceType, "elements") {
		return "elements.envato.com"
	}
	return ""
}

func (s *Service) persistObservationSegmentation(observation domain.ProductObservation, query domain.ResearchQuery, in domain.ObservedProductInput) error {
	site := sourceSiteForObservation(query, in)
	targetCategory := ""
	if query.Filters != nil {
		targetCategory = query.Filters["category"]
	}
	result := segmentation.Classify(segmentation.Input{
		Site: site, SourceCategory: in.CategoryText, TargetCategory: targetCategory,
		Title: in.Title, Surface: observation.SurfaceType,
	})
	if existing, ok, err := s.universe.CatalogByID(observation.CatalogID); err == nil && ok {
		if result.ContentType == "Market" || result.ContentType == "" {
			result.ContentType = existing.ContentType
		}
	}
	platform := "Envato Market"
	origin := domain.CatalogOriginScanner
	sourceSurface := observation.SurfaceType
	if strings.Contains(in.SourceType, "elements") {
		platform = "Envato Elements"
		origin = domain.CatalogOriginManual
		sourceSurface = ""
	}
	path, err := s.EnsureCatalogPath(domain.CatalogPathInput{
		Platform: platform, ContentType: result.ContentType, Catalog: result.Catalog, Subcatalog: result.Subcatalog,
		Origin: origin, SourceSurface: sourceSurface,
	})
	if err != nil {
		return err
	}
	resolvedCatalogID := observation.CatalogID
	if len(path) > 0 {
		resolvedCatalogID = path[len(path)-1].ID
	}
	if resolvedCatalogID != "" && resolvedCatalogID != observation.CatalogID {
		_, err = s.universe.UpsertProduct(domain.ProductEntity{
			ID: observation.ProductID, SourceType: in.SourceType, ExternalItemID: in.ExternalItemID,
			CanonicalCatalogID: resolvedCatalogID, FirstSeenAt: in.ObservedAt, LastSeenAt: in.ObservedAt, Status: "observed",
		})
		if err != nil {
			return err
		}
	}
	return s.universe.AppendObservationSegmentation(domain.ObservationSegmentation{
		ID: domain.NewID(), ObservationID: observation.ID, RunID: observation.MarketMapRunID,
		ProductID: observation.ProductID, Site: site, ContentType: result.ContentType,
		CatalogID: resolvedCatalogID, ProductType: result.ProductType, UseCase: result.UseCase,
		Topic: result.Topic, Style: result.Style, Confidence: result.Confidence,
		Status: result.Status, ReasonCodes: result.ReasonCodes,
		TaxonomyVersion: segmentation.TaxonomyVersion, GeneratedAt: observation.ObservedAt,
	})
}

func (s *Service) recordObservedProduct(in domain.ObservedProductInput) (domain.ProductObservation, error) {
	session, ok, err := s.universe.LatestResearchSession(in.SessionID)
	if err != nil {
		return domain.ProductObservation{}, err
	}
	if !ok {
		return domain.ProductObservation{}, errors.New("research session not found")
	}
	if terminalSessionStatus(session.Status) {
		return domain.ProductObservation{}, errors.New("research session is closed")
	}
	if !containsID(session.QueryIDs, in.QueryID) {
		return domain.ProductObservation{}, errors.New("research query is not part of this session")
	}
	query, ok, err := s.universe.ResearchQueryByID(in.QueryID)
	if err != nil {
		return domain.ProductObservation{}, err
	}
	if !ok {
		return domain.ProductObservation{}, errors.New("research query not found")
	}
	nodes, err := s.universe.CatalogNodes()
	if err != nil {
		return domain.ProductObservation{}, err
	}
	if query.CatalogScopeID != in.CatalogID || query.SourceType != in.SourceType || !universe.IsCatalogWithin(nodes, session.Scope, in.CatalogID) || session.SourceType != in.SourceType {
		return domain.ProductObservation{}, errors.New("observation does not match research session/query scope")
	}
	if strings.TrimSpace(in.ExternalItemID) == "" {
		return domain.ProductObservation{}, errors.New("external item id is required")
	}
	if strings.TrimSpace(in.Title) == "" {
		return domain.ProductObservation{}, errors.New("title is required")
	}
	if in.ObservedAt == "" {
		in.ObservedAt = time.Now().UTC().Format(time.RFC3339)
	}
	if _, err := time.Parse(time.RFC3339, in.ObservedAt); err != nil {
		return domain.ProductObservation{}, errors.New("observedAt must be RFC3339")
	}
	if surface, ok := domain.ParseMarketSurfaceAlias(string(in.SurfaceType)); ok {
		in.SurfaceType = surface
	} else {
		in.SurfaceType = domain.MarketSurfaceCategory
	}
	if in.ObservationReliability < 0 || in.ObservationReliability > 1 {
		return domain.ProductObservation{}, errors.New("observationReliability must be between 0 and 1")
	}
	policy, err := s.policies.Require(in.SourceType)
	if err != nil {
		return domain.ProductObservation{}, err
	}

	authorID := ""
	if strings.TrimSpace(in.ExternalAuthorKey) != "" {
		expiresAt := ""
		if policy.MetadataTTLSeconds > 0 {
			observed, _ := time.Parse(time.RFC3339, in.ObservedAt)
			expiresAt = observed.Add(time.Duration(policy.MetadataTTLSeconds) * time.Second).Format(time.RFC3339)
		}
		author, err := s.universe.UpsertAuthor(domain.AuthorEntity{
			SourceType:        in.SourceType,
			ExternalAuthorKey: in.ExternalAuthorKey,
			DisplayName:       in.AuthorDisplayName,
			FirstSeenAt:       in.ObservedAt,
			LastSeenAt:        in.ObservedAt,
			MetadataExpiresAt: expiresAt,
		})
		if err != nil {
			return domain.ProductObservation{}, err
		}
		authorID = author.ID
	}

	product, err := s.universe.UpsertProduct(domain.ProductEntity{
		SourceType:         in.SourceType,
		ExternalItemID:     in.ExternalItemID,
		CanonicalCatalogID: in.CatalogID,
		FirstSeenAt:        in.ObservedAt,
		LastSeenAt:         in.ObservedAt,
		Status:             "observed",
	})
	if err != nil {
		return domain.ProductObservation{}, err
	}

	if strings.TrimSpace(in.ReleasedAt) != "" || in.ReleasePrecision != "" || strings.TrimSpace(in.ReleaseSourceField) != "" {
		if strings.TrimSpace(in.ReleasedAt) == "" || in.ReleasePrecision == "" || strings.TrimSpace(in.ReleaseSourceField) == "" {
			return domain.ProductObservation{}, errors.New("releasedAt, releasePrecision, and releaseSourceField must be provided together")
		}
		if _, _, err := s.universe.UpsertProductRelease(domain.ProductReleaseRecord{
			ProductID:   product.ID,
			ReleasedAt:  in.ReleasedAt,
			Precision:   in.ReleasePrecision,
			SourceType:  in.SourceType,
			SourceField: in.ReleaseSourceField,
			SourceURL:   in.SourceURL,
			VerifiedAt:  in.ObservedAt,
		}); err != nil {
			return domain.ProductObservation{}, err
		}
	}

	expiresAt := ""
	if policy.MetadataTTLSeconds > 0 {
		observed, _ := time.Parse(time.RFC3339, in.ObservedAt)
		expiresAt = observed.Add(time.Duration(policy.MetadataTTLSeconds) * time.Second).Format(time.RFC3339)
	}
	if err := s.universe.SaveLiveProductMetadata(domain.LiveProductMetadata{
		ProductID:         product.ID,
		AuthorID:          authorID,
		SourceType:        in.SourceType,
		Title:             in.Title,
		AuthorDisplayName: in.AuthorDisplayName,
		SourceURL:         in.SourceURL,
		PreviewRef:        in.PreviewRef,
		CategoryText:      in.CategoryText,
		FetchedAt:         in.ObservedAt,
		ExpiresAt:         expiresAt,
	}); err != nil {
		return domain.ProductObservation{}, err
	}

	previous, err := s.universe.ProductObservations(domain.ObservationFilter{
		SessionID: in.SessionID,
		ProductID: product.ID,
		QueryID:   in.QueryID,
		CatalogID: in.CatalogID,
	})
	if err != nil {
		return domain.ProductObservation{}, err
	}
	for _, old := range previous {
		if old.ObservedAt == in.ObservedAt && old.Position == in.Position && old.Page == in.Page && old.SurfaceType == in.SurfaceType {
			if err := s.persistObservationSegmentation(old, query, in); err != nil {
				return old, err
			}
			return old, nil
		}
	}

	observation := domain.ProductObservation{
		ID:                     domain.NewID(),
		SessionID:              in.SessionID,
		ProductID:              product.ID,
		AuthorID:               authorID,
		QueryID:                in.QueryID,
		CatalogID:              in.CatalogID,
		SurfaceType:            in.SurfaceType,
		Position:               in.Position,
		Page:                   in.Page,
		ObservedAt:             in.ObservedAt,
		SourceType:             in.SourceType,
		ObservationReliability: in.ObservationReliability,
		MarketMapRunID:         in.MarketMapRunID,
	}
	if err := s.universe.AppendProductObservation(observation); err != nil {
		return observation, err
	}
	if err := s.persistObservationSegmentation(observation, query, in); err != nil {
		return observation, err
	}
	return observation, nil
}

type ConnectorError struct {
	Err error
}

func (e ConnectorError) Error() string { return e.Err.Error() }
func (e ConnectorError) Unwrap() error { return e.Err }

type ObserveEnvatoQueryRequest struct {
	SessionID string `json:"sessionId"`
	QueryID   string `json:"queryId"`
}

type ObserveEnvatoQueryResult struct {
	Session      domain.ResearchSession `json:"session"`
	Observations int                    `json:"observations"`
	Products     int                    `json:"products"`
	Authors      int                    `json:"authors"`
}

func intFilter(m map[string]string, key string, fallback int) int {
	if m == nil {
		return fallback
	}
	value, err := strconv.Atoi(strings.TrimSpace(m[key]))
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}

func addUnique(xs []string, value string) []string {
	for _, item := range xs {
		if item == value {
			return xs
		}
	}
	return append(xs, value)
}

func (s *Service) ObserveEnvatoQuery(ctx context.Context, req ObserveEnvatoQueryRequest) (ObserveEnvatoQueryResult, error) {
	session, ok, err := s.universe.LatestResearchSession(req.SessionID)
	if err != nil {
		return ObserveEnvatoQueryResult{}, err
	}
	if !ok {
		return ObserveEnvatoQueryResult{}, errors.New("research session not found")
	}
	if terminalSessionStatus(session.Status) {
		return ObserveEnvatoQueryResult{}, errors.New("research session is closed")
	}
	if !containsID(session.QueryIDs, req.QueryID) {
		return ObserveEnvatoQueryResult{}, errors.New("research query is not part of this session")
	}
	query, ok, err := s.universe.ResearchQueryByID(req.QueryID)
	if err != nil {
		return ObserveEnvatoQueryResult{}, err
	}
	nodes, err := s.universe.CatalogNodes()
	if err != nil {
		return ObserveEnvatoQueryResult{}, err
	}
	if !ok || query.SourceType != "envato_market_api" || query.SourceType != session.SourceType || !universe.IsCatalogWithin(nodes, session.Scope, query.CatalogScopeID) {
		return ObserveEnvatoQueryResult{}, errors.New("query is not valid for this Envato research session")
	}
	remaining := session.RequestBudget - session.RequestsUsed
	if remaining <= 0 {
		return ObserveEnvatoQueryResult{}, errors.New("research request budget exhausted")
	}
	token, err := s.resolvedEnvatoToken()
	if err != nil {
		return ObserveEnvatoQueryResult{}, err
	}
	defer func() { token = "" }()

	maxHTTPRequests := 2
	if remaining < maxHTTPRequests {
		maxHTTPRequests = remaining
	}
	search := envatoconn.SearchRequest{
		Term:     query.QueryText,
		Site:     query.Filters["site"],
		Category: query.Filters["category"],
		Page:     intFilter(query.Filters, "page", 1),
		PageSize: intFilter(query.Filters, "page_size", 20),
		SortBy:   query.Filters["sort_by"],
	}
	page, callErr := s.envato.SearchPage(ctx, token, search, maxHTTPRequests)
	session.RequestsUsed += page.HTTPRequests
	if callErr != nil {
		message := security.RedactSecret(callErr.Error(), token)
		session.Errors = append(session.Errors, message)
		session.Status = universe.ResolveSessionStatus(session.QueriesPlanned, session.QueriesCompleted, session.RequestBudget, session.RequestsUsed, false, false)
		if session.Status == domain.ResearchSessionPartial {
			session.CompletedAt = time.Now().UTC().Format(time.RFC3339)
		}
		_ = s.universe.AppendResearchSession(session)
		return ObserveEnvatoQueryResult{Session: session}, ConnectorError{Err: callErr}
	}

	products := map[string]bool{}
	authors := map[string]bool{}
	for _, item := range page.Items {
		observation, err := s.recordObservedProduct(domain.ObservedProductInput{
			SessionID:              session.ID,
			QueryID:                query.ID,
			CatalogID:              query.CatalogScopeID,
			SourceType:             query.SourceType,
			ExternalItemID:         item.ExternalItemID,
			Title:                  item.Title,
			ExternalAuthorKey:      item.AuthorKey,
			AuthorDisplayName:      item.AuthorDisplayName,
			SourceURL:              item.SourceURL,
			PreviewRef:             item.PreviewRef,
			CategoryText:           item.CategoryText,
			ReleasedAt:             item.ReleasedAt,
			ReleasePrecision:       domain.ReleasePrecision(item.ReleasePrecision),
			ReleaseSourceField:     item.ReleaseField,
			SurfaceType:            "search",
			Position:               item.Position,
			Page:                   search.Page,
			ObservedAt:             page.Aggregate.ObservedAt,
			ObservationReliability: 0.9,
		})
		if err != nil {
			return ObserveEnvatoQueryResult{}, err
		}
		products[observation.ProductID] = true
		if observation.AuthorID != "" {
			authors[observation.AuthorID] = true
		}
	}
	session.CompletedQueryIDs = addUnique(session.CompletedQueryIDs, query.ID)
	session.QueriesCompleted = len(session.CompletedQueryIDs)
	session.CoverageEstimate = universe.CoveragePercent(session.QueriesPlanned, session.CompletedQueryIDs)
	session.Status = universe.ResolveSessionStatus(session.QueriesPlanned, session.QueriesCompleted, session.RequestBudget, session.RequestsUsed, false, false)
	if session.Status == domain.ResearchSessionCompleted || session.Status == domain.ResearchSessionPartial {
		session.CompletedAt = time.Now().UTC().Format(time.RFC3339)
	}
	if err := s.universe.AppendResearchSession(session); err != nil {
		return ObserveEnvatoQueryResult{}, err
	}
	return ObserveEnvatoQueryResult{
		Session:      session,
		Observations: len(page.Items),
		Products:     len(products),
		Authors:      len(authors),
	}, nil
}

func (s *Service) ImportObservedProductsCSV(r io.Reader) (int, error) {
	items, err := ingest.ParseObservedProductsCSV(r)
	if err != nil {
		return 0, err
	}
	completed := map[string]map[string]bool{}
	for i, item := range items {
		if _, err := s.recordObservedProduct(item); err != nil {
			return i, err
		}
		if completed[item.SessionID] == nil {
			completed[item.SessionID] = map[string]bool{}
		}
		completed[item.SessionID][item.QueryID] = true
	}
	for sessionID, querySet := range completed {
		session, ok, err := s.universe.LatestResearchSession(sessionID)
		if err != nil {
			return 0, err
		}
		if !ok {
			return 0, fmt.Errorf("research session not found after import: %s", sessionID)
		}
		for queryID := range querySet {
			session.CompletedQueryIDs = addUnique(session.CompletedQueryIDs, queryID)
		}
		session.QueriesCompleted = len(session.CompletedQueryIDs)
		session.CoverageEstimate = universe.CoveragePercent(session.QueriesPlanned, session.CompletedQueryIDs)
		session.Status = universe.ResolveSessionStatus(session.QueriesPlanned, session.QueriesCompleted, session.RequestBudget, session.RequestsUsed, false, false)
		if session.Status == domain.ResearchSessionCompleted {
			session.CompletedAt = time.Now().UTC().Format(time.RFC3339)
		}
		if err := s.universe.AppendResearchSession(session); err != nil {
			return 0, err
		}
	}
	return len(items), nil
}
