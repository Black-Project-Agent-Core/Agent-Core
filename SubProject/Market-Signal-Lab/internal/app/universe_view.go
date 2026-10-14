package app

import (
	"errors"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/universe"
	"math"
	"sort"
	"time"
)

type CatalogUniverseRow struct {
	Catalog          domain.CatalogNode `json:"catalog"`
	ObservedProducts int                `json:"observedProducts"`
	ObservedAuthors  int                `json:"observedAuthors"`
	ResearchQueries  int                `json:"researchQueries"`
	ResearchSessions int                `json:"researchSessions"`
	Coverage         float64            `json:"coverage"`
	FirstObservedAt  string             `json:"firstObservedAt,omitempty"`
	LastObservedAt   string             `json:"lastObservedAt,omitempty"`
}

type ProductUniverseRow struct {
	Product           domain.ProductEntity        `json:"product"`
	Metadata          *domain.LiveProductMetadata `json:"metadata,omitempty"`
	MetadataFreshness string                      `json:"metadataFreshness"`
	Author            *domain.AuthorEntity        `json:"author,omitempty"`
	ObservationCount  int                         `json:"observationCount"`
	QueryAppearances  int                         `json:"queryAppearances"`
	FirstObservedAt   string                      `json:"firstObservedAt"`
	LastObservedAt    string                      `json:"lastObservedAt"`
}

type AuthorUniverseRow struct {
	Author           domain.AuthorEntity `json:"author"`
	ObservedProducts int                 `json:"observedProducts"`
	CatalogCount     int                 `json:"catalogCount"`
	ObservationCount int                 `json:"observationCount"`
}

type ResearchSessionAudit struct {
	Session          domain.ResearchSession `json:"session"`
	ObservedProducts int                    `json:"observedProducts"`
	ObservedAuthors  int                    `json:"observedAuthors"`
	ObservationRows  int                    `json:"observationRows"`
}

func catalogScopeIDs(hierarchy universe.CatalogHierarchy, catalogID string) (map[string]bool, error) {
	set, ok := hierarchy.ScopeIDs(catalogID)
	if !ok {
		return nil, errors.New("catalog not found")
	}
	return set, nil
}

func minMaxObserved(first, last, value string) (string, string) {
	if value == "" {
		return first, last
	}
	if first == "" || value < first {
		first = value
	}
	if last == "" || value > last {
		last = value
	}
	return first, last
}

func (s *Service) CatalogUniverse(parentID string) ([]CatalogUniverseRow, error) {
	nodes, err := s.universe.CatalogNodes()
	if err != nil {
		return nil, err
	}
	hierarchy := universe.NewCatalogHierarchy(nodes)
	observations, err := s.universe.ProductObservations(domain.ObservationFilter{})
	if err != nil {
		return nil, err
	}
	queries, err := s.universe.ResearchQueries()
	if err != nil {
		return nil, err
	}
	sessions, err := s.universe.ResearchSessions()
	if err != nil {
		return nil, err
	}

	rows := []CatalogUniverseRow{}
	for _, node := range nodes {
		if parentID != "" && node.ParentID != parentID {
			continue
		}
		scope, err := catalogScopeIDs(hierarchy, node.ID)
		if err != nil {
			return nil, err
		}
		products := map[string]bool{}
		authors := map[string]bool{}
		first, last := "", ""
		for _, observation := range observations {
			if !scope[observation.CatalogID] {
				continue
			}
			products[observation.ProductID] = true
			if observation.AuthorID != "" {
				authors[observation.AuthorID] = true
			}
			first, last = minMaxObserved(first, last, observation.ObservedAt)
		}
		queryCount := 0
		for _, query := range queries {
			if scope[query.CatalogScopeID] {
				queryCount++
			}
		}
		sessionCount := 0
		coverageSum := 0.0
		for _, session := range sessions {
			if scope[session.Scope] {
				sessionCount++
				coverageSum += session.CoverageEstimate
			}
		}
		coverage := 0.0
		if sessionCount > 0 {
			coverage = math.Round((coverageSum/float64(sessionCount))*10) / 10
		}
		rows = append(rows, CatalogUniverseRow{
			Catalog:          node,
			ObservedProducts: len(products),
			ObservedAuthors:  len(authors),
			ResearchQueries:  queryCount,
			ResearchSessions: sessionCount,
			Coverage:         coverage,
			FirstObservedAt:  first,
			LastObservedAt:   last,
		})
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].Catalog.CanonicalKey < rows[j].Catalog.CanonicalKey })
	return rows, nil
}

func (s *Service) ProductUniverse(catalogID string) ([]ProductUniverseRow, error) {
	nodes, err := s.universe.CatalogNodes()
	if err != nil {
		return nil, err
	}
	hierarchy := universe.NewCatalogHierarchy(nodes)
	scope, err := catalogScopeIDs(hierarchy, catalogID)
	if err != nil {
		return nil, err
	}
	observations, err := s.universe.ProductObservations(domain.ObservationFilter{})
	if err != nil {
		return nil, err
	}
	products, err := s.universe.Products()
	if err != nil {
		return nil, err
	}
	authors, err := s.universe.Authors()
	if err != nil {
		return nil, err
	}
	productByID := map[string]domain.ProductEntity{}
	for _, product := range products {
		productByID[product.ID] = product
	}
	authorByID := map[string]domain.AuthorEntity{}
	for _, author := range authors {
		authorByID[author.ID] = author
	}

	type accumulator struct {
		count    int
		queries  map[string]bool
		first    string
		last     string
		authorID string
	}
	grouped := map[string]*accumulator{}
	for _, observation := range observations {
		if !scope[observation.CatalogID] {
			continue
		}
		acc := grouped[observation.ProductID]
		if acc == nil {
			acc = &accumulator{queries: map[string]bool{}}
			grouped[observation.ProductID] = acc
		}
		acc.count++
		acc.queries[observation.QueryID] = true
		acc.first, acc.last = minMaxObserved(acc.first, acc.last, observation.ObservedAt)
		if observation.AuthorID != "" {
			acc.authorID = observation.AuthorID
		}
	}

	rows := make([]ProductUniverseRow, 0, len(grouped))
	now := time.Now().UTC()
	for productID, acc := range grouped {
		product, ok := productByID[productID]
		if !ok {
			continue
		}
		row := ProductUniverseRow{
			Product:           product,
			MetadataFreshness: "MISSING METADATA",
			ObservationCount:  acc.count,
			QueryAppearances:  len(acc.queries),
			FirstObservedAt:   acc.first,
			LastObservedAt:    acc.last,
		}
		metadata, ok, err := s.universe.LatestLiveProductMetadata(productID)
		if err != nil {
			return nil, err
		}
		if ok {
			metadataCopy := metadata
			row.Metadata = &metadataCopy
			row.MetadataFreshness = universe.MetadataFreshness(now, metadata)
			if metadata.AuthorID != "" {
				acc.authorID = metadata.AuthorID
			}
		}
		if author, ok := authorByID[acc.authorID]; ok {
			authorCopy := author
			row.Author = &authorCopy
		}
		rows = append(rows, row)
	}
	sort.Slice(rows, func(i, j int) bool {
		left, right := rows[i].Product.ExternalItemID, rows[j].Product.ExternalItemID
		if rows[i].Metadata != nil {
			left = rows[i].Metadata.Title
		}
		if rows[j].Metadata != nil {
			right = rows[j].Metadata.Title
		}
		if left == right {
			return rows[i].Product.ID < rows[j].Product.ID
		}
		return left < right
	})
	return rows, nil
}

func (s *Service) AuthorUniverse(catalogID string) ([]AuthorUniverseRow, error) {
	nodes, err := s.universe.CatalogNodes()
	if err != nil {
		return nil, err
	}
	hierarchy := universe.NewCatalogHierarchy(nodes)
	scope, err := catalogScopeIDs(hierarchy, catalogID)
	if err != nil {
		return nil, err
	}
	observations, err := s.universe.ProductObservations(domain.ObservationFilter{})
	if err != nil {
		return nil, err
	}
	authors, err := s.universe.Authors()
	if err != nil {
		return nil, err
	}
	authorByID := map[string]domain.AuthorEntity{}
	for _, author := range authors {
		authorByID[author.ID] = author
	}
	type accumulator struct {
		products map[string]bool
		catalogs map[string]bool
		count    int
	}
	grouped := map[string]*accumulator{}
	for _, observation := range observations {
		if !scope[observation.CatalogID] || observation.AuthorID == "" {
			continue
		}
		acc := grouped[observation.AuthorID]
		if acc == nil {
			acc = &accumulator{products: map[string]bool{}, catalogs: map[string]bool{}}
			grouped[observation.AuthorID] = acc
		}
		acc.products[observation.ProductID] = true
		acc.catalogs[observation.CatalogID] = true
		acc.count++
	}
	rows := []AuthorUniverseRow{}
	for authorID, acc := range grouped {
		author, ok := authorByID[authorID]
		if !ok {
			continue
		}
		rows = append(rows, AuthorUniverseRow{
			Author:           author,
			ObservedProducts: len(acc.products),
			CatalogCount:     len(acc.catalogs),
			ObservationCount: acc.count,
		})
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].Author.DisplayName == rows[j].Author.DisplayName {
			return rows[i].Author.ID < rows[j].Author.ID
		}
		return rows[i].Author.DisplayName < rows[j].Author.DisplayName
	})
	return rows, nil
}

func (s *Service) ResearchSessionAudit(sessionID string) (ResearchSessionAudit, error) {
	session, ok, err := s.universe.LatestResearchSession(sessionID)
	if err != nil {
		return ResearchSessionAudit{}, err
	}
	if !ok {
		return ResearchSessionAudit{}, errors.New("research session not found")
	}
	observations, err := s.universe.ProductObservations(domain.ObservationFilter{SessionID: sessionID})
	if err != nil {
		return ResearchSessionAudit{}, err
	}
	products := map[string]bool{}
	authors := map[string]bool{}
	for _, observation := range observations {
		products[observation.ProductID] = true
		if observation.AuthorID != "" {
			authors[observation.AuthorID] = true
		}
	}
	return ResearchSessionAudit{
		Session:          session,
		ObservedProducts: len(products),
		ObservedAuthors:  len(authors),
		ObservationRows:  len(observations),
	}, nil
}
