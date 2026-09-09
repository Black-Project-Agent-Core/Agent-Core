package storage

import (
	"bufio"
	"encoding/json"
	"errors"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/repository"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

func (s *Store) SaveCatalogNode(v domain.CatalogNode) error {
	return s.appendJSONL("catalog_nodes.jsonl", v)
}

func (s *Store) CatalogNodes() ([]domain.CatalogNode, error) {
	latest := map[string]domain.CatalogNode{}
	err := s.readJSONL("catalog_nodes.jsonl", func(b []byte) error {
		var v domain.CatalogNode
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		latest[v.ID] = v
		return nil
	})
	out := make([]domain.CatalogNode, 0, len(latest))
	for _, v := range latest {
		out = append(out, v)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CanonicalKey < out[j].CanonicalKey })
	return out, err
}

func (s *Store) CatalogByID(id string) (domain.CatalogNode, bool, error) {
	xs, err := s.CatalogNodes()
	if err != nil {
		return domain.CatalogNode{}, false, err
	}
	for _, v := range xs {
		if v.ID == id {
			return v, true, nil
		}
	}
	return domain.CatalogNode{}, false, nil
}

func (s *Store) CatalogByCanonicalKey(key string) (domain.CatalogNode, bool, error) {
	xs, err := s.CatalogNodes()
	if err != nil {
		return domain.CatalogNode{}, false, err
	}
	for _, v := range xs {
		if v.CanonicalKey == key {
			return v, true, nil
		}
	}
	return domain.CatalogNode{}, false, nil
}

func earliestObserved(existing, incoming string) string {
	if existing == "" {
		return incoming
	}
	if incoming == "" || existing <= incoming {
		return existing
	}
	return incoming
}

func latestObserved(existing, incoming string) string {
	if existing == "" {
		return incoming
	}
	if incoming == "" || existing >= incoming {
		return existing
	}
	return incoming
}

func (s *Store) UpsertProduct(v domain.ProductEntity) (domain.ProductEntity, error) {
	prev, ok, err := s.ProductBySource(v.SourceType, v.ExternalItemID)
	if err != nil {
		return v, err
	}
	if ok {
		v.ID = prev.ID
		v.FirstSeenAt = earliestObserved(prev.FirstSeenAt, v.FirstSeenAt)
		v.LastSeenAt = latestObserved(prev.LastSeenAt, v.LastSeenAt)
		if v.CanonicalCatalogID == "" {
			v.CanonicalCatalogID = prev.CanonicalCatalogID
		}
		if v.Status == "" {
			v.Status = prev.Status
		}
	} else if v.ID == "" {
		v.ID = domain.NewID()
	}
	if err := s.appendJSONL("product_entities.jsonl", v); err != nil {
		return v, err
	}
	return v, nil
}

func (s *Store) Products() ([]domain.ProductEntity, error) {
	return s.productEntityRowsIndexed()
}

func (s *Store) ProductBySource(sourceType, externalItemID string) (domain.ProductEntity, bool, error) {
	xs, err := s.Products()
	if err != nil {
		return domain.ProductEntity{}, false, err
	}
	for _, v := range xs {
		if v.SourceType == sourceType && v.ExternalItemID == externalItemID {
			return v, true, nil
		}
	}
	return domain.ProductEntity{}, false, nil
}

func (s *Store) SaveLiveProductMetadata(v domain.LiveProductMetadata) error {
	if strings.TrimSpace(v.ProductID) == "" {
		return errors.New("productId is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	path := filepath.Join(s.root, "cache", "live_product_metadata.jsonl")
	latest := map[string]domain.LiveProductMetadata{}
	if f, err := os.Open(path); err == nil {
		sc := bufio.NewScanner(f)
		sc.Buffer(make([]byte, 1024), 10*1024*1024)
		for sc.Scan() {
			if strings.TrimSpace(sc.Text()) == "" {
				continue
			}
			var row domain.LiveProductMetadata
			if err := json.Unmarshal(sc.Bytes(), &row); err != nil {
				_ = f.Close()
				return err
			}
			latest[row.ProductID] = row
		}
		if err := sc.Err(); err != nil {
			_ = f.Close()
			return err
		}
		_ = f.Close()
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	latest[v.ProductID] = v

	tmp := path + ".tmp"
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	ids := make([]string, 0, len(latest))
	for id := range latest {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	enc := json.NewEncoder(f)
	for _, id := range ids {
		if err := enc.Encode(latest[id]); err != nil {
			_ = f.Close()
			_ = os.Remove(tmp)
			return err
		}
	}
	if err := f.Close(); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		return err
	}
	s.liveMetadataIndex = nil
	return nil
}

func (s *Store) LatestLiveProductMetadata(productID string) (domain.LiveProductMetadata, bool, error) {
	rows, err := s.liveMetadataRowsIndexed()
	if err != nil {
		return domain.LiveProductMetadata{}, false, err
	}
	for _, row := range rows {
		if row.ProductID == productID {
			return row, true, nil
		}
	}
	return domain.LiveProductMetadata{}, false, nil
}

func (s *Store) UpsertAuthor(v domain.AuthorEntity) (domain.AuthorEntity, error) {
	prev, ok, err := s.AuthorBySource(v.SourceType, v.ExternalAuthorKey)
	if err != nil {
		return v, err
	}
	if ok {
		v.ID = prev.ID
		v.FirstSeenAt = earliestObserved(prev.FirstSeenAt, v.FirstSeenAt)
		v.LastSeenAt = latestObserved(prev.LastSeenAt, v.LastSeenAt)
		if v.DisplayName == "" {
			v.DisplayName = prev.DisplayName
		}
		if v.MetadataExpiresAt == "" {
			v.MetadataExpiresAt = prev.MetadataExpiresAt
		}
	} else if v.ID == "" {
		v.ID = domain.NewID()
	}
	if err := s.appendJSONL("author_entities.jsonl", v); err != nil {
		return v, err
	}
	return v, nil
}

func (s *Store) Authors() ([]domain.AuthorEntity, error) {
	latest := map[string]domain.AuthorEntity{}
	err := s.readJSONL("author_entities.jsonl", func(b []byte) error {
		var v domain.AuthorEntity
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		latest[v.ID] = v
		return nil
	})
	out := make([]domain.AuthorEntity, 0, len(latest))
	for _, v := range latest {
		out = append(out, v)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].SourceType == out[j].SourceType {
			return out[i].ExternalAuthorKey < out[j].ExternalAuthorKey
		}
		return out[i].SourceType < out[j].SourceType
	})
	return out, err
}

func (s *Store) AuthorBySource(sourceType, externalAuthorKey string) (domain.AuthorEntity, bool, error) {
	xs, err := s.Authors()
	if err != nil {
		return domain.AuthorEntity{}, false, err
	}
	for _, v := range xs {
		if v.SourceType == sourceType && v.ExternalAuthorKey == externalAuthorKey {
			return v, true, nil
		}
	}
	return domain.AuthorEntity{}, false, nil
}

func (s *Store) SaveResearchQuery(v domain.ResearchQuery) error {
	return s.appendJSONL("research_queries.jsonl", v)
}

func (s *Store) ResearchQueries() ([]domain.ResearchQuery, error) {
	latest := map[string]domain.ResearchQuery{}
	err := s.readJSONL("research_queries.jsonl", func(b []byte) error {
		var v domain.ResearchQuery
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		latest[v.ID] = v
		return nil
	})
	out := make([]domain.ResearchQuery, 0, len(latest))
	for _, v := range latest {
		out = append(out, v)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].CreatedAt == out[j].CreatedAt {
			return out[i].ID < out[j].ID
		}
		return out[i].CreatedAt < out[j].CreatedAt
	})
	return out, err
}

func (s *Store) ResearchQueryByID(id string) (domain.ResearchQuery, bool, error) {
	xs, err := s.ResearchQueries()
	if err != nil {
		return domain.ResearchQuery{}, false, err
	}
	for _, v := range xs {
		if v.ID == id {
			return v, true, nil
		}
	}
	return domain.ResearchQuery{}, false, nil
}

func (s *Store) AppendResearchSession(v domain.ResearchSession) error {
	return s.appendJSONL("research_sessions.jsonl", v)
}

func (s *Store) ResearchSessions() ([]domain.ResearchSession, error) {
	latest := map[string]domain.ResearchSession{}
	err := s.readJSONL("research_sessions.jsonl", func(b []byte) error {
		var v domain.ResearchSession
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		latest[v.ID] = v
		return nil
	})
	out := make([]domain.ResearchSession, 0, len(latest))
	for _, v := range latest {
		out = append(out, v)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].StartedAt == out[j].StartedAt {
			return out[i].ID < out[j].ID
		}
		return out[i].StartedAt < out[j].StartedAt
	})
	return out, err
}

func (s *Store) LatestResearchSession(id string) (domain.ResearchSession, bool, error) {
	xs, err := s.ResearchSessions()
	if err != nil {
		return domain.ResearchSession{}, false, err
	}
	for _, v := range xs {
		if v.ID == id {
			return v, true, nil
		}
	}
	return domain.ResearchSession{}, false, nil
}

func (s *Store) AppendProductObservation(v domain.ProductObservation) error {
	return s.appendJSONL("product_observations.jsonl", v)
}

func (s *Store) ProductObservations(filter domain.ObservationFilter) ([]domain.ProductObservation, error) {
	rows, err := s.productObservationRowsIndexed()
	if err != nil {
		return nil, err
	}
	out := make([]domain.ProductObservation, 0, len(rows))
	for _, v := range rows {
		if filter.SessionID != "" && filter.SessionID != v.SessionID {
			continue
		}
		if filter.ProductID != "" && filter.ProductID != v.ProductID {
			continue
		}
		if filter.AuthorID != "" && filter.AuthorID != v.AuthorID {
			continue
		}
		if filter.QueryID != "" && filter.QueryID != v.QueryID {
			continue
		}
		if filter.CatalogID != "" && filter.CatalogID != v.CatalogID {
			continue
		}
		if filter.MarketMapRunID != "" && filter.MarketMapRunID != v.MarketMapRunID {
			continue
		}
		out = append(out, v)
	}
	return out, nil
}

var _ repository.UniverseRepository = (*Store)(nil)

func (s *Store) AppendObservationSegmentation(v domain.ObservationSegmentation) error {
	if strings.TrimSpace(v.ObservationID) == "" || strings.TrimSpace(v.TaxonomyVersion) == "" {
		return errors.New("observationId and taxonomyVersion are required")
	}
	existing, err := s.ObservationSegmentations(domain.ObservationSegmentationFilter{
		ObservationID:   v.ObservationID,
		TaxonomyVersion: v.TaxonomyVersion,
	})
	if err != nil {
		return err
	}
	if len(existing) > 0 {
		return nil
	}
	if v.ID == "" {
		v.ID = domain.NewID()
	}
	return s.appendJSONL("observation_segmentations.jsonl", v)
}

func (s *Store) ObservationSegmentations(filter domain.ObservationSegmentationFilter) ([]domain.ObservationSegmentation, error) {
	out := []domain.ObservationSegmentation{}
	err := s.readJSONL("observation_segmentations.jsonl", func(b []byte) error {
		var v domain.ObservationSegmentation
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		if filter.ObservationID != "" && filter.ObservationID != v.ObservationID {
			return nil
		}
		if filter.RunID != "" && filter.RunID != v.RunID {
			return nil
		}
		if filter.ProductID != "" && filter.ProductID != v.ProductID {
			return nil
		}
		if filter.TaxonomyVersion != "" && filter.TaxonomyVersion != v.TaxonomyVersion {
			return nil
		}
		out = append(out, v)
		return nil
	})
	sort.Slice(out, func(i, j int) bool {
		if out[i].GeneratedAt == out[j].GeneratedAt {
			return out[i].ID < out[j].ID
		}
		return out[i].GeneratedAt < out[j].GeneratedAt
	})
	return out, err
}
