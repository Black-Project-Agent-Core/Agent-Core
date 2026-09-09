package app

import (
	"errors"
	"fmt"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/universe"
	"sort"
	"strings"
	"time"
)

func explorerPage(limit, offset int) (int, int, error) {
	if limit == 0 {
		limit = 50
	}
	if limit < 1 || limit > 200 {
		return 0, 0, errors.New("limit must be between 1 and 200")
	}
	if offset < 0 {
		return 0, 0, errors.New("offset must be zero or greater")
	}
	return limit, offset, nil
}

func pageBounds(total, limit, offset int) (int, int) {
	if offset > total {
		offset = total
	}
	end := offset + limit
	if end > total {
		end = total
	}
	return offset, end
}

func containsFold(value, query string) bool {
	query = strings.ToLower(strings.TrimSpace(query))
	if query == "" {
		return true
	}
	return strings.Contains(strings.ToLower(value), query)
}

func directionMatches(actual, requested domain.MarketDirection) bool {
	if requested == "" {
		return true
	}
	if actual == requested {
		return true
	}
	if requested == domain.DirectionRising {
		return actual == domain.DirectionStrongRising
	}
	if requested == domain.DirectionFalling {
		return actual == domain.DirectionStrongFalling
	}
	return false
}

func numberMatches(value float64, min, max *float64) bool {
	if min != nil && value < *min {
		return false
	}
	if max != nil && value > *max {
		return false
	}
	return true
}

func boolLess(desc bool, less bool) bool {
	if desc {
		return !less
	}
	return less
}

func (s *Service) latestCatalogSnapshotMap(windowDays int) (map[string]domain.CatalogSnapshot, error) {
	if windowDays == 0 {
		windowDays = 30
	}
	rows, err := s.CatalogRankings(domain.CatalogSnapshotFilter{WindowDays: windowDays})
	if err != nil {
		return nil, err
	}
	out := map[string]domain.CatalogSnapshot{}
	for _, row := range rows {
		out[row.Catalog.ID] = row.Snapshot
	}
	return out, nil
}

func (s *Service) latestProductSnapshotMap(windowDays int) (map[string]domain.ProductSnapshot, error) {
	if windowDays == 0 {
		windowDays = 30
	}
	rows, err := s.ProductRankings(domain.ProductSnapshotFilter{WindowDays: windowDays})
	if err != nil {
		return nil, err
	}
	out := map[string]domain.ProductSnapshot{}
	for _, row := range rows {
		out[row.Product.ID] = row.Snapshot
	}
	return out, nil
}

func (s *Service) ExploreCatalogs(filter domain.CatalogExplorerFilter) (domain.PagedCatalogExplorerRows, error) {
	limit, offset, err := explorerPage(filter.Limit, filter.Offset)
	if err != nil {
		return domain.PagedCatalogExplorerRows{}, err
	}
	base, err := s.CatalogUniverse(filter.ParentID)
	if err != nil {
		return domain.PagedCatalogExplorerRows{}, err
	}
	snapshots, err := s.latestCatalogSnapshotMap(filter.WindowDays)
	if err != nil {
		return domain.PagedCatalogExplorerRows{}, err
	}
	rows := make([]domain.CatalogExplorerRow, 0, len(base))
	for _, row := range base {
		c := row.Catalog
		if filter.Platform != "" && !strings.EqualFold(c.Platform, filter.Platform) {
			continue
		}
		if filter.ContentType != "" && !strings.EqualFold(c.ContentType, filter.ContentType) {
			continue
		}
		if filter.Level != "" && c.Level != filter.Level {
			continue
		}
		if filter.Text != "" && !(containsFold(c.Name, filter.Text) || containsFold(c.CanonicalKey, filter.Text) || containsFold(c.Platform, filter.Text) || containsFold(c.ContentType, filter.Text)) {
			continue
		}
		if row.ObservedProducts < filter.MinObservedProducts {
			continue
		}
		out := domain.CatalogExplorerRow{
			Catalog: c, ObservedProducts: row.ObservedProducts, ObservedAuthors: row.ObservedAuthors,
			ResearchQueries: row.ResearchQueries, ResearchSessions: row.ResearchSessions,
			Coverage: row.Coverage, FirstObservedAt: row.FirstObservedAt, LastObservedAt: row.LastObservedAt,
		}
		if snap, ok := snapshots[c.ID]; ok {
			copySnap := snap
			out.Snapshot = &copySnap
		}
		if filter.Direction != "" {
			if out.Snapshot == nil || !directionMatches(out.Snapshot.Direction, filter.Direction) {
				continue
			}
		}
		if filter.MinTrend != nil || filter.MaxTrend != nil {
			if out.Snapshot == nil || !numberMatches(out.Snapshot.TrendScore, filter.MinTrend, filter.MaxTrend) {
				continue
			}
		}
		if filter.MinOpportunity != nil || filter.MaxOpportunity != nil {
			if out.Snapshot == nil || !numberMatches(out.Snapshot.OpportunityScore, filter.MinOpportunity, filter.MaxOpportunity) {
				continue
			}
		}
		if filter.MinConfidence != nil {
			if out.Snapshot == nil || out.Snapshot.Confidence < *filter.MinConfidence {
				continue
			}
		}
		effectiveCoverage := out.Coverage
		if out.Snapshot != nil {
			effectiveCoverage = out.Snapshot.Coverage
		}
		if filter.MinCoverage != nil && effectiveCoverage < *filter.MinCoverage {
			continue
		}
		rows = append(rows, out)
	}
	sortBy := strings.ToLower(strings.TrimSpace(filter.SortBy))
	sort.SliceStable(rows, func(i, j int) bool {
		var less bool
		switch sortBy {
		case "trend":
			li, lj := -1.0, -1.0
			if rows[i].Snapshot != nil {
				li = rows[i].Snapshot.TrendScore
			}
			if rows[j].Snapshot != nil {
				lj = rows[j].Snapshot.TrendScore
			}
			less = li < lj
		case "opportunity":
			li, lj := -1.0, -1.0
			if rows[i].Snapshot != nil {
				li = rows[i].Snapshot.OpportunityScore
			}
			if rows[j].Snapshot != nil {
				lj = rows[j].Snapshot.OpportunityScore
			}
			less = li < lj
		case "confidence":
			li, lj := -1.0, -1.0
			if rows[i].Snapshot != nil {
				li = rows[i].Snapshot.Confidence
			}
			if rows[j].Snapshot != nil {
				lj = rows[j].Snapshot.Confidence
			}
			less = li < lj
		case "coverage":
			li, lj := rows[i].Coverage, rows[j].Coverage
			if rows[i].Snapshot != nil {
				li = rows[i].Snapshot.Coverage
			}
			if rows[j].Snapshot != nil {
				lj = rows[j].Snapshot.Coverage
			}
			less = li < lj
		case "products":
			less = rows[i].ObservedProducts < rows[j].ObservedProducts
		case "authors":
			less = rows[i].ObservedAuthors < rows[j].ObservedAuthors
		default:
			less = rows[i].Catalog.CanonicalKey < rows[j].Catalog.CanonicalKey
		}
		if rows[i].Catalog.ID == rows[j].Catalog.ID {
			return false
		}
		return boolLess(filter.Desc, less)
	})
	total := len(rows)
	start, end := pageBounds(total, limit, offset)
	return domain.PagedCatalogExplorerRows{Items: rows[start:end], Total: total, Limit: limit, Offset: offset}, nil
}

func (s *Service) ExploreProducts(filter domain.ProductExplorerFilter) (domain.PagedProductExplorerRows, error) {
	limit, offset, err := explorerPage(filter.Limit, filter.Offset)
	if err != nil {
		return domain.PagedProductExplorerRows{}, err
	}
	base, err := s.ProductUniverse(filter.CatalogID)
	if err != nil {
		return domain.PagedProductExplorerRows{}, err
	}
	snapshots, err := s.latestProductSnapshotMap(filter.WindowDays)
	if err != nil {
		return domain.PagedProductExplorerRows{}, err
	}
	rows := make([]domain.ProductExplorerRow, 0, len(base))
	for _, row := range base {
		out := domain.ProductExplorerRow{
			Product: row.Product, Metadata: row.Metadata, MetadataFreshness: row.MetadataFreshness,
			Author: row.Author, ObservationCount: row.ObservationCount, QueryAppearances: row.QueryAppearances,
			FirstObservedAt: row.FirstObservedAt, LastObservedAt: row.LastObservedAt,
		}
		if snap, ok := snapshots[row.Product.ID]; ok {
			copySnap := snap
			out.Snapshot = &copySnap
		}
		title, authorName, category := row.Product.ExternalItemID, "", ""
		if row.Metadata != nil {
			title = row.Metadata.Title
			category = row.Metadata.CategoryText
			authorName = row.Metadata.AuthorDisplayName
		}
		if row.Author != nil {
			authorName = row.Author.DisplayName
		}
		if filter.Text != "" && !(containsFold(title, filter.Text) || containsFold(row.Product.ExternalItemID, filter.Text) || containsFold(authorName, filter.Text) || containsFold(category, filter.Text)) {
			continue
		}
		if filter.AuthorID != "" && (row.Author == nil || row.Author.ID != filter.AuthorID) {
			continue
		}
		if filter.Freshness != "" && !strings.EqualFold(row.MetadataFreshness, filter.Freshness) {
			continue
		}
		if row.ObservationCount < filter.MinObservations || row.QueryAppearances < filter.MinQueryAppearances {
			continue
		}
		if filter.Direction != "" && (out.Snapshot == nil || !directionMatches(out.Snapshot.Direction, filter.Direction)) {
			continue
		}
		if filter.MinExposure != nil || filter.MaxExposure != nil {
			if out.Snapshot == nil || !numberMatches(out.Snapshot.ExposureScore, filter.MinExposure, filter.MaxExposure) {
				continue
			}
		}
		if filter.MinOpportunity != nil || filter.MaxOpportunity != nil {
			if out.Snapshot == nil || !numberMatches(out.Snapshot.OpportunityScore, filter.MinOpportunity, filter.MaxOpportunity) {
				continue
			}
		}
		if filter.MinConfidence != nil && (out.Snapshot == nil || out.Snapshot.Confidence < *filter.MinConfidence) {
			continue
		}
		if filter.MinCoverage != nil && (out.Snapshot == nil || out.Snapshot.Coverage < *filter.MinCoverage) {
			continue
		}
		rows = append(rows, out)
	}
	sortBy := strings.ToLower(strings.TrimSpace(filter.SortBy))
	sort.SliceStable(rows, func(i, j int) bool {
		var less bool
		switch sortBy {
		case "exposure":
			li, lj := -1.0, -1.0
			if rows[i].Snapshot != nil {
				li = rows[i].Snapshot.ExposureScore
			}
			if rows[j].Snapshot != nil {
				lj = rows[j].Snapshot.ExposureScore
			}
			less = li < lj
		case "opportunity":
			li, lj := -1.0, -1.0
			if rows[i].Snapshot != nil {
				li = rows[i].Snapshot.OpportunityScore
			}
			if rows[j].Snapshot != nil {
				lj = rows[j].Snapshot.OpportunityScore
			}
			less = li < lj
		case "confidence":
			li, lj := -1.0, -1.0
			if rows[i].Snapshot != nil {
				li = rows[i].Snapshot.Confidence
			}
			if rows[j].Snapshot != nil {
				lj = rows[j].Snapshot.Confidence
			}
			less = li < lj
		case "observations":
			less = rows[i].ObservationCount < rows[j].ObservationCount
		case "queries":
			less = rows[i].QueryAppearances < rows[j].QueryAppearances
		case "freshness":
			less = rows[i].FirstObservedAt < rows[j].FirstObservedAt
		default:
			left, right := rows[i].Product.ExternalItemID, rows[j].Product.ExternalItemID
			if rows[i].Metadata != nil {
				left = rows[i].Metadata.Title
			}
			if rows[j].Metadata != nil {
				right = rows[j].Metadata.Title
			}
			less = strings.ToLower(left) < strings.ToLower(right)
		}
		if rows[i].Product.ID == rows[j].Product.ID {
			return false
		}
		return boolLess(filter.Desc, less)
	})
	total := len(rows)
	start, end := pageBounds(total, limit, offset)
	return domain.PagedProductExplorerRows{Items: rows[start:end], Total: total, Limit: limit, Offset: offset}, nil
}

func (s *Service) ExploreAuthors(filter domain.AuthorExplorerFilter) (domain.PagedAuthorExplorerRows, error) {
	limit, offset, err := explorerPage(filter.Limit, filter.Offset)
	if err != nil {
		return domain.PagedAuthorExplorerRows{}, err
	}
	base, err := s.AuthorUniverse(filter.CatalogID)
	if err != nil {
		return domain.PagedAuthorExplorerRows{}, err
	}
	rows := make([]domain.AuthorExplorerRow, 0, len(base))
	for _, row := range base {
		if filter.Text != "" && !(containsFold(row.Author.DisplayName, filter.Text) || containsFold(row.Author.ExternalAuthorKey, filter.Text)) {
			continue
		}
		if row.ObservedProducts < filter.MinObservedProducts || row.CatalogCount < filter.MinCatalogCount || row.ObservationCount < filter.MinObservationCount {
			continue
		}
		rows = append(rows, domain.AuthorExplorerRow{Author: row.Author, ObservedProducts: row.ObservedProducts, CatalogCount: row.CatalogCount, ObservationCount: row.ObservationCount})
	}
	sortBy := strings.ToLower(strings.TrimSpace(filter.SortBy))
	sort.SliceStable(rows, func(i, j int) bool {
		var less bool
		switch sortBy {
		case "products":
			less = rows[i].ObservedProducts < rows[j].ObservedProducts
		case "catalogs":
			less = rows[i].CatalogCount < rows[j].CatalogCount
		case "observations":
			less = rows[i].ObservationCount < rows[j].ObservationCount
		default:
			less = strings.ToLower(rows[i].Author.DisplayName) < strings.ToLower(rows[j].Author.DisplayName)
		}
		if rows[i].Author.ID == rows[j].Author.ID {
			return false
		}
		return boolLess(filter.Desc, less)
	})
	total := len(rows)
	start, end := pageBounds(total, limit, offset)
	return domain.PagedAuthorExplorerRows{Items: rows[start:end], Total: total, Limit: limit, Offset: offset}, nil
}

func parseOptionalRFC3339(raw string) (*time.Time, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, nil
	}
	value, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return nil, errors.New("date filters must be RFC3339")
	}
	value = value.UTC()
	return &value, nil
}

func (s *Service) ExploreSessions(filter domain.SessionExplorerFilter) (domain.PagedSessionExplorerRows, error) {
	limit, offset, err := explorerPage(filter.Limit, filter.Offset)
	if err != nil {
		return domain.PagedSessionExplorerRows{}, err
	}
	from, err := parseOptionalRFC3339(filter.StartedFrom)
	if err != nil {
		return domain.PagedSessionExplorerRows{}, err
	}
	to, err := parseOptionalRFC3339(filter.StartedTo)
	if err != nil {
		return domain.PagedSessionExplorerRows{}, err
	}
	sessions, err := s.universe.ResearchSessions()
	if err != nil {
		return domain.PagedSessionExplorerRows{}, err
	}
	observations, err := s.universe.ProductObservations(domain.ObservationFilter{})
	if err != nil {
		return domain.PagedSessionExplorerRows{}, err
	}
	nodes, err := s.universe.CatalogNodes()
	if err != nil {
		return domain.PagedSessionExplorerRows{}, err
	}
	hierarchy := universe.NewCatalogHierarchy(nodes)
	scope, err := catalogScopeIDs(hierarchy, filter.CatalogID)
	if err != nil {
		return domain.PagedSessionExplorerRows{}, err
	}
	groupedProducts := map[string]map[string]bool{}
	groupedAuthors := map[string]map[string]bool{}
	groupedRows := map[string]int{}
	for _, observation := range observations {
		if groupedProducts[observation.SessionID] == nil {
			groupedProducts[observation.SessionID] = map[string]bool{}
			groupedAuthors[observation.SessionID] = map[string]bool{}
		}
		groupedProducts[observation.SessionID][observation.ProductID] = true
		if observation.AuthorID != "" {
			groupedAuthors[observation.SessionID][observation.AuthorID] = true
		}
		groupedRows[observation.SessionID]++
	}
	rows := []domain.SessionExplorerRow{}
	for _, session := range sessions {
		if filter.CatalogID != "" && !scope[session.Scope] {
			continue
		}
		if filter.Status != "" && session.Status != filter.Status {
			continue
		}
		if filter.SourceType != "" && !strings.EqualFold(session.SourceType, filter.SourceType) {
			continue
		}
		started, parseErr := time.Parse(time.RFC3339, session.StartedAt)
		if parseErr != nil {
			continue
		}
		if from != nil && started.Before(*from) {
			continue
		}
		if to != nil && started.After(*to) {
			continue
		}
		if filter.MinCoverage != nil && session.CoverageEstimate < *filter.MinCoverage {
			continue
		}
		errorText := strings.Join(session.Errors, " ")
		if filter.Text != "" && !(containsFold(session.Scope, filter.Text) || containsFold(session.SourceType, filter.Text) || containsFold(session.ScannerVersion, filter.Text) || containsFold(errorText, filter.Text)) {
			continue
		}
		rows = append(rows, domain.SessionExplorerRow{Session: session, ObservedProducts: len(groupedProducts[session.ID]), ObservedAuthors: len(groupedAuthors[session.ID]), ObservationRows: groupedRows[session.ID]})
	}
	sortBy := strings.ToLower(strings.TrimSpace(filter.SortBy))
	sort.SliceStable(rows, func(i, j int) bool {
		var less bool
		switch sortBy {
		case "coverage":
			less = rows[i].Session.CoverageEstimate < rows[j].Session.CoverageEstimate
		case "requests":
			less = rows[i].Session.RequestsUsed < rows[j].Session.RequestsUsed
		case "products":
			less = rows[i].ObservedProducts < rows[j].ObservedProducts
		default:
			less = rows[i].Session.StartedAt < rows[j].Session.StartedAt
		}
		if rows[i].Session.ID == rows[j].Session.ID {
			return false
		}
		return boolLess(filter.Desc, less)
	})
	total := len(rows)
	start, end := pageBounds(total, limit, offset)
	return domain.PagedSessionExplorerRows{Items: rows[start:end], Total: total, Limit: limit, Offset: offset}, nil
}

func validExplorerTarget(target domain.ExplorerTarget) bool {
	return target == domain.ExplorerTargetCatalogs || target == domain.ExplorerTargetProducts || target == domain.ExplorerTargetAuthors || target == domain.ExplorerTargetSessions
}

func validWatchEntity(entity domain.WatchEntityType) bool {
	return entity == domain.WatchEntityCatalog || entity == domain.WatchEntityProduct || entity == domain.WatchEntityAuthor
}

func cloneFilters(in map[string]string) map[string]string {
	out := map[string]string{}
	for key, value := range in {
		key = strings.TrimSpace(key)
		if key != "" {
			out[key] = strings.TrimSpace(value)
		}
	}
	return out
}

func (s *Service) SaveView(v domain.SavedView) (domain.SavedView, error) {
	v.Name = strings.TrimSpace(v.Name)
	if v.Name == "" {
		return v, errors.New("name is required")
	}
	if !validExplorerTarget(v.Target) {
		return v, errors.New("invalid saved view target")
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if v.ID == "" {
		v.ID = domain.NewID()
		v.CreatedAt = now
	} else if previous, ok, err := s.explorer.SavedViewByID(v.ID); err != nil {
		return v, err
	} else if ok {
		v.CreatedAt = previous.CreatedAt
	}
	if v.CreatedAt == "" {
		v.CreatedAt = now
	}
	v.UpdatedAt = now
	v.Filters = cloneFilters(v.Filters)
	v.Deleted = false
	return v, s.explorer.AppendSavedView(v)
}
func (s *Service) SavedViews() ([]domain.SavedView, error) { return s.explorer.SavedViews() }
func (s *Service) DeleteSavedView(id string) error {
	v, ok, err := s.explorer.SavedViewByID(strings.TrimSpace(id))
	if err != nil {
		return err
	}
	if !ok {
		return errors.New("saved view not found")
	}
	v.Deleted = true
	v.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	return s.explorer.AppendSavedView(v)
}

func (s *Service) findProduct(id string) (domain.ProductEntity, bool, error) {
	rows, err := s.universe.Products()
	if err != nil {
		return domain.ProductEntity{}, false, err
	}
	for _, v := range rows {
		if v.ID == id {
			return v, true, nil
		}
	}
	return domain.ProductEntity{}, false, nil
}
func (s *Service) findAuthor(id string) (domain.AuthorEntity, bool, error) {
	rows, err := s.universe.Authors()
	if err != nil {
		return domain.AuthorEntity{}, false, err
	}
	for _, v := range rows {
		if v.ID == id {
			return v, true, nil
		}
	}
	return domain.AuthorEntity{}, false, nil
}

func (s *Service) AddWatchlist(v domain.WatchlistEntry) (domain.WatchlistEntry, error) {
	if !validWatchEntity(v.EntityType) {
		return v, errors.New("invalid watchlist entity type")
	}
	v.EntityID = strings.TrimSpace(v.EntityID)
	if v.EntityID == "" {
		return v, errors.New("entityId is required")
	}
	switch v.EntityType {
	case domain.WatchEntityCatalog:
		if _, ok, err := s.universe.CatalogByID(v.EntityID); err != nil {
			return v, err
		} else if !ok {
			return v, errors.New("catalog not found")
		}
	case domain.WatchEntityProduct:
		if _, ok, err := s.findProduct(v.EntityID); err != nil {
			return v, err
		} else if !ok {
			return v, errors.New("product not found")
		}
	case domain.WatchEntityAuthor:
		if _, ok, err := s.findAuthor(v.EntityID); err != nil {
			return v, err
		} else if !ok {
			return v, errors.New("author not found")
		}
	}
	active, err := s.explorer.WatchlistEntries()
	if err != nil {
		return v, err
	}
	for _, row := range active {
		if row.EntityType == v.EntityType && row.EntityID == v.EntityID && row.ID != v.ID {
			return v, errors.New("entity is already on the watchlist")
		}
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if v.ID == "" {
		v.ID = domain.NewID()
		v.CreatedAt = now
	} else if previous, ok, err := s.explorer.WatchlistEntryByID(v.ID); err != nil {
		return v, err
	} else if ok {
		v.CreatedAt = previous.CreatedAt
	}
	if v.CreatedAt == "" {
		v.CreatedAt = now
	}
	v.UpdatedAt = now
	v.Deleted = false
	v.Label = strings.TrimSpace(v.Label)
	v.Notes = strings.TrimSpace(v.Notes)
	return v, s.explorer.AppendWatchlistEntry(v)
}

func (s *Service) DeleteWatchlist(id string) error {
	v, ok, err := s.explorer.WatchlistEntryByID(strings.TrimSpace(id))
	if err != nil {
		return err
	}
	if !ok {
		return errors.New("watchlist entry not found")
	}
	v.Deleted = true
	v.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
	return s.explorer.AppendWatchlistEntry(v)
}

func (s *Service) Watchlist(windowDays int) ([]domain.WatchlistResolvedRow, error) {
	entries, err := s.explorer.WatchlistEntries()
	if err != nil {
		return nil, err
	}
	catalogSnapshots, err := s.latestCatalogSnapshotMap(windowDays)
	if err != nil {
		return nil, err
	}
	productSnapshots, err := s.latestProductSnapshotMap(windowDays)
	if err != nil {
		return nil, err
	}
	rows := make([]domain.WatchlistResolvedRow, 0, len(entries))
	for _, entry := range entries {
		row := domain.WatchlistResolvedRow{Entry: entry, Label: entry.Label}
		switch entry.EntityType {
		case domain.WatchEntityCatalog:
			if value, ok, err := s.universe.CatalogByID(entry.EntityID); err != nil {
				return nil, err
			} else if ok {
				copyValue := value
				row.Catalog = &copyValue
				if row.Label == "" {
					row.Label = value.Name
				}
			}
			if value, ok := catalogSnapshots[entry.EntityID]; ok {
				copyValue := value
				row.CatalogSnapshot = &copyValue
			}
		case domain.WatchEntityProduct:
			if value, ok, err := s.findProduct(entry.EntityID); err != nil {
				return nil, err
			} else if ok {
				copyValue := value
				row.Product = &copyValue
				if row.Label == "" {
					row.Label = value.ExternalItemID
				}
			}
			if value, ok, err := s.universe.LatestLiveProductMetadata(entry.EntityID); err != nil {
				return nil, err
			} else if ok {
				copyValue := value
				row.Metadata = &copyValue
				if entry.Label == "" && value.Title != "" {
					row.Label = value.Title
				}
			}
			if value, ok := productSnapshots[entry.EntityID]; ok {
				copyValue := value
				row.ProductSnapshot = &copyValue
			}
		case domain.WatchEntityAuthor:
			if value, ok, err := s.findAuthor(entry.EntityID); err != nil {
				return nil, err
			} else if ok {
				copyValue := value
				row.Author = &copyValue
				if row.Label == "" {
					row.Label = value.DisplayName
				}
			}
		}
		if row.Label == "" {
			row.Label = entry.EntityID
		}
		rows = append(rows, row)
	}
	return rows, nil
}

func validateCompareIDs(ids []string) ([]string, error) {
	if len(ids) < 2 || len(ids) > 4 {
		return nil, errors.New("comparison requires 2 to 4 IDs")
	}
	seen := map[string]bool{}
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" {
			return nil, errors.New("comparison IDs may not be empty")
		}
		if seen[id] {
			return nil, errors.New("comparison IDs must be unique")
		}
		seen[id] = true
		out = append(out, id)
	}
	return out, nil
}

func (s *Service) CompareCatalogs(ids []string, windowDays int) ([]domain.CatalogExplorerRow, error) {
	ids, err := validateCompareIDs(ids)
	if err != nil {
		return nil, err
	}
	universeRows, err := s.CatalogUniverse("")
	if err != nil {
		return nil, err
	}
	byID := map[string]CatalogUniverseRow{}
	for _, row := range universeRows {
		byID[row.Catalog.ID] = row
	}
	snapshots, err := s.latestCatalogSnapshotMap(windowDays)
	if err != nil {
		return nil, err
	}
	out := make([]domain.CatalogExplorerRow, 0, len(ids))
	for _, id := range ids {
		row, ok := byID[id]
		if !ok {
			return nil, fmt.Errorf("catalog not found: %s", id)
		}
		resolved := domain.CatalogExplorerRow{Catalog: row.Catalog, ObservedProducts: row.ObservedProducts, ObservedAuthors: row.ObservedAuthors, ResearchQueries: row.ResearchQueries, ResearchSessions: row.ResearchSessions, Coverage: row.Coverage, FirstObservedAt: row.FirstObservedAt, LastObservedAt: row.LastObservedAt}
		if snap, ok := snapshots[id]; ok {
			copySnap := snap
			resolved.Snapshot = &copySnap
		}
		out = append(out, resolved)
	}
	return out, nil
}

func (s *Service) CompareProducts(ids []string, windowDays int) ([]domain.ProductExplorerRow, error) {
	ids, err := validateCompareIDs(ids)
	if err != nil {
		return nil, err
	}
	universeRows, err := s.ProductUniverse("")
	if err != nil {
		return nil, err
	}
	byID := map[string]ProductUniverseRow{}
	for _, row := range universeRows {
		byID[row.Product.ID] = row
	}
	snapshots, err := s.latestProductSnapshotMap(windowDays)
	if err != nil {
		return nil, err
	}
	out := make([]domain.ProductExplorerRow, 0, len(ids))
	for _, id := range ids {
		row, ok := byID[id]
		if !ok {
			return nil, fmt.Errorf("product not found: %s", id)
		}
		resolved := domain.ProductExplorerRow{Product: row.Product, Metadata: row.Metadata, MetadataFreshness: row.MetadataFreshness, Author: row.Author, ObservationCount: row.ObservationCount, QueryAppearances: row.QueryAppearances, FirstObservedAt: row.FirstObservedAt, LastObservedAt: row.LastObservedAt}
		if snap, ok := snapshots[id]; ok {
			copySnap := snap
			resolved.Snapshot = &copySnap
		}
		out = append(out, resolved)
	}
	return out, nil
}
