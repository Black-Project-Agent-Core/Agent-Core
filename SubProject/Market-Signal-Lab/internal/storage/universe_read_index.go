package storage

import (
	"bufio"
	"bytes"
	"encoding/json"
	"marketsignallab/internal/domain"
	"os"
	"path/filepath"
	"sort"
)

type ledgerRowsReadIndex[T any] struct {
	signature ledgerFileSignature
	rows      []T
}

type productEntityReadIndex struct {
	signature ledgerFileSignature
	rows      []domain.ProductEntity
}

type liveMetadataReadIndex struct {
	signature ledgerFileSignature
	rows      []domain.LiveProductMetadata
	byProduct map[string]domain.LiveProductMetadata
}

type productReleaseReadIndex struct {
	signature      ledgerFileSignature
	rows           []domain.ProductReleaseRecord
	firstByProduct map[string]domain.ProductReleaseRecord
}

func readLedgerRowsIndexed[T any](s *Store, path string, cache **ledgerRowsReadIndex[T], decode func([]byte) (T, error), less func([]T, int, int) bool) ([]T, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sig, err := fileSignature(path)
	if err != nil {
		return nil, err
	}
	if *cache != nil && (*cache).signature == sig {
		return append([]T(nil), (*cache).rows...), nil
	}
	if !sig.exists {
		*cache = &ledgerRowsReadIndex[T]{signature: sig, rows: []T{}}
		return []T{}, nil
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	rows := []T{}
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 1024), 10*1024*1024)
	for scanner.Scan() {
		line := bytes.TrimSpace(scanner.Bytes())
		if len(line) == 0 {
			continue
		}
		row, err := decode(line)
		if err != nil {
			return nil, err
		}
		rows = append(rows, row)
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	if less != nil {
		sort.SliceStable(rows, func(i, j int) bool { return less(rows, i, j) })
	}
	*cache = &ledgerRowsReadIndex[T]{signature: sig, rows: rows}
	return append([]T(nil), rows...), nil
}

func (s *Store) productObservationRowsIndexed() ([]domain.ProductObservation, error) {
	path := filepath.Join(s.root, "history", "product_observations.jsonl")
	return readLedgerRowsIndexed(s, path, &s.productObservationIndex, func(b []byte) (domain.ProductObservation, error) {
		var row domain.ProductObservation
		err := json.Unmarshal(b, &row)
		return row, err
	}, func(rows []domain.ProductObservation, i, j int) bool {
		if rows[i].ObservedAt == rows[j].ObservedAt {
			return rows[i].ID < rows[j].ID
		}
		return rows[i].ObservedAt < rows[j].ObservedAt
	})
}

func (s *Store) productTrendEventRowsIndexed() ([]domain.ProductTrendEvent, error) {
	path := filepath.Join(s.root, "history", productTrendEventsFile)
	return readLedgerRowsIndexed(s, path, &s.productTrendEventIndex, func(b []byte) (domain.ProductTrendEvent, error) {
		var row domain.ProductTrendEvent
		err := json.Unmarshal(b, &row)
		return row, err
	}, func(rows []domain.ProductTrendEvent, i, j int) bool {
		if rows[i].OccurredAt == rows[j].OccurredAt {
			return rows[i].ID < rows[j].ID
		}
		return rows[i].OccurredAt < rows[j].OccurredAt
	})
}

func (s *Store) productReleaseConflictRowsIndexed() ([]domain.ProductReleaseConflict, error) {
	path := filepath.Join(s.root, "history", productReleaseConflictsFile)
	return readLedgerRowsIndexed(s, path, &s.productReleaseConflictIndex, func(b []byte) (domain.ProductReleaseConflict, error) {
		var row domain.ProductReleaseConflict
		err := json.Unmarshal(b, &row)
		return row, err
	}, func(rows []domain.ProductReleaseConflict, i, j int) bool {
		if rows[i].DetectedAt == rows[j].DetectedAt {
			return rows[i].ID < rows[j].ID
		}
		return rows[i].DetectedAt < rows[j].DetectedAt
	})
}

func (s *Store) productEntityRowsIndexed() ([]domain.ProductEntity, error) {
	path := filepath.Join(s.root, "history", "product_entities.jsonl")
	s.mu.Lock()
	defer s.mu.Unlock()
	sig, err := fileSignature(path)
	if err != nil {
		return nil, err
	}
	if s.productEntityIndex != nil && s.productEntityIndex.signature == sig {
		return append([]domain.ProductEntity(nil), s.productEntityIndex.rows...), nil
	}
	if !sig.exists {
		s.productEntityIndex = &productEntityReadIndex{signature: sig, rows: []domain.ProductEntity{}}
		return []domain.ProductEntity{}, nil
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	latest := map[string]domain.ProductEntity{}
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 1024), 10*1024*1024)
	for scanner.Scan() {
		line := bytes.TrimSpace(scanner.Bytes())
		if len(line) == 0 {
			continue
		}
		var row domain.ProductEntity
		if err := json.Unmarshal(line, &row); err != nil {
			return nil, err
		}
		latest[row.ID] = row
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	rows := make([]domain.ProductEntity, 0, len(latest))
	for _, row := range latest {
		rows = append(rows, row)
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].SourceType == rows[j].SourceType {
			return rows[i].ExternalItemID < rows[j].ExternalItemID
		}
		return rows[i].SourceType < rows[j].SourceType
	})
	s.productEntityIndex = &productEntityReadIndex{signature: sig, rows: rows}
	return append([]domain.ProductEntity(nil), rows...), nil
}

func (s *Store) liveMetadataRowsIndexed() ([]domain.LiveProductMetadata, error) {
	path := filepath.Join(s.root, "cache", "live_product_metadata.jsonl")
	s.mu.Lock()
	defer s.mu.Unlock()
	sig, err := fileSignature(path)
	if err != nil {
		return nil, err
	}
	if s.liveMetadataIndex != nil && s.liveMetadataIndex.signature == sig {
		return append([]domain.LiveProductMetadata(nil), s.liveMetadataIndex.rows...), nil
	}
	if !sig.exists {
		s.liveMetadataIndex = &liveMetadataReadIndex{signature: sig, rows: []domain.LiveProductMetadata{}, byProduct: map[string]domain.LiveProductMetadata{}}
		return []domain.LiveProductMetadata{}, nil
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	byProduct := map[string]domain.LiveProductMetadata{}
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 1024), 10*1024*1024)
	for scanner.Scan() {
		line := bytes.TrimSpace(scanner.Bytes())
		if len(line) == 0 {
			continue
		}
		var row domain.LiveProductMetadata
		if err := json.Unmarshal(line, &row); err != nil {
			return nil, err
		}
		byProduct[row.ProductID] = row
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(byProduct))
	for id := range byProduct {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	rows := make([]domain.LiveProductMetadata, 0, len(ids))
	for _, id := range ids {
		rows = append(rows, byProduct[id])
	}
	s.liveMetadataIndex = &liveMetadataReadIndex{signature: sig, rows: rows, byProduct: byProduct}
	return append([]domain.LiveProductMetadata(nil), rows...), nil
}

func (s *Store) productReleaseRowsIndexed() ([]domain.ProductReleaseRecord, error) {
	path := filepath.Join(s.root, "history", productReleasesFile)
	s.mu.Lock()
	defer s.mu.Unlock()
	sig, err := fileSignature(path)
	if err != nil {
		return nil, err
	}
	if s.productReleaseIndex != nil && s.productReleaseIndex.signature == sig {
		return append([]domain.ProductReleaseRecord(nil), s.productReleaseIndex.rows...), nil
	}
	if !sig.exists {
		s.productReleaseIndex = &productReleaseReadIndex{signature: sig, rows: []domain.ProductReleaseRecord{}, firstByProduct: map[string]domain.ProductReleaseRecord{}}
		return []domain.ProductReleaseRecord{}, nil
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	rows := []domain.ProductReleaseRecord{}
	firstByProduct := map[string]domain.ProductReleaseRecord{}
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 1024), 10*1024*1024)
	for scanner.Scan() {
		line := bytes.TrimSpace(scanner.Bytes())
		if len(line) == 0 {
			continue
		}
		var row domain.ProductReleaseRecord
		if err := json.Unmarshal(line, &row); err != nil {
			return nil, err
		}
		rows = append(rows, row)
		if _, ok := firstByProduct[row.ProductID]; !ok {
			firstByProduct[row.ProductID] = row
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	sort.SliceStable(rows, func(i, j int) bool {
		if rows[i].VerifiedAt == rows[j].VerifiedAt {
			return rows[i].ID < rows[j].ID
		}
		return rows[i].VerifiedAt < rows[j].VerifiedAt
	})
	s.productReleaseIndex = &productReleaseReadIndex{signature: sig, rows: rows, firstByProduct: firstByProduct}
	return append([]domain.ProductReleaseRecord(nil), rows...), nil
}

func (s *Store) productReleaseFirstIndexed(productID string) (domain.ProductReleaseRecord, bool, error) {
	if _, err := s.productReleaseRowsIndexed(); err != nil {
		return domain.ProductReleaseRecord{}, false, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.productReleaseIndex == nil {
		return domain.ProductReleaseRecord{}, false, nil
	}
	row, ok := s.productReleaseIndex.firstByProduct[productID]
	return row, ok, nil
}
