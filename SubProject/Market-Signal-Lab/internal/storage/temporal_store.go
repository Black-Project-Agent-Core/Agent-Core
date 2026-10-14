package storage

import (
	"bufio"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"time"

	"marketsignallab/internal/domain"
)

const (
	productReleasesFile         = "product_releases.jsonl"
	productReleaseConflictsFile = "product_release_conflicts.jsonl"
	productTrendEventsFile      = "product_trend_events.jsonl"
)

func validateProductRelease(v domain.ProductReleaseRecord) error {
	if strings.TrimSpace(v.ProductID) == "" {
		return errors.New("productId is required")
	}
	if strings.TrimSpace(v.ReleasedAt) == "" {
		return errors.New("releasedAt is required")
	}
	switch v.Precision {
	case domain.ReleasePrecisionDate:
		if _, err := time.Parse("2006-01-02", v.ReleasedAt); err != nil {
			return errors.New("date release must use YYYY-MM-DD")
		}
	case domain.ReleasePrecisionDateTime:
		if _, err := time.Parse(time.RFC3339, v.ReleasedAt); err != nil {
			return errors.New("datetime release must use RFC3339")
		}
	default:
		return errors.New("release precision must be date or datetime")
	}
	if strings.TrimSpace(v.SourceType) == "" || strings.TrimSpace(v.SourceField) == "" {
		return errors.New("release sourceType and sourceField are required")
	}
	if strings.TrimSpace(v.VerifiedAt) == "" {
		return errors.New("verifiedAt is required")
	}
	if _, err := time.Parse(time.RFC3339, v.VerifiedAt); err != nil {
		return errors.New("verifiedAt must use RFC3339")
	}
	return nil
}

func (s *Store) ProductReleases() ([]domain.ProductReleaseRecord, error) {
	return s.productReleaseRowsIndexed()
}

func (s *Store) ProductRelease(productID string) (domain.ProductReleaseRecord, bool, error) {
	return s.productReleaseFirstIndexed(productID)
}

func (s *Store) UpsertProductRelease(v domain.ProductReleaseRecord) (domain.ProductReleaseRecord, *domain.ProductReleaseConflict, error) {
	if err := validateProductRelease(v); err != nil {
		return v, nil, err
	}
	existing, ok, err := s.ProductRelease(v.ProductID)
	if err != nil {
		return v, nil, err
	}
	if ok {
		if existing.ReleasedAt == v.ReleasedAt && existing.Precision == v.Precision {
			return existing, nil, nil
		}
		conflict := domain.ProductReleaseConflict{
			ID: domain.NewID(), ProductID: v.ProductID, ReleaseRecordID: existing.ID,
			ExistingReleasedAt: existing.ReleasedAt, CandidateReleasedAt: v.ReleasedAt,
			CandidatePrecision: v.Precision, CandidateSourceType: v.SourceType,
			CandidateSourceField: v.SourceField, DetectedAt: v.VerifiedAt,
			Status: domain.ReleaseConflictPending,
		}
		if err := s.appendJSONL(productReleaseConflictsFile, conflict); err != nil {
			return existing, nil, err
		}
		return existing, &conflict, nil
	}
	if v.ID == "" {
		v.ID = domain.NewID()
	}
	if err := s.appendJSONL(productReleasesFile, v); err != nil {
		return v, nil, err
	}
	return v, nil, nil
}

func (s *Store) ProductReleaseConflicts(productID string) ([]domain.ProductReleaseConflict, error) {
	rows, err := s.productReleaseConflictRowsIndexed()
	if err != nil {
		return nil, err
	}
	out := make([]domain.ProductReleaseConflict, 0, len(rows))
	for _, row := range rows {
		if productID == "" || row.ProductID == productID {
			out = append(out, row)
		}
	}
	return out, nil
}

type productTrendEventKey struct {
	ProductID  string
	RunID      string
	WindowDays int
}

func trendEventKey(v domain.ProductTrendEvent) productTrendEventKey {
	return productTrendEventKey{ProductID: v.ProductID, RunID: v.RunID, WindowDays: v.WindowDays}
}

func validateProductTrendEventIdentity(v domain.ProductTrendEvent) error {
	if strings.TrimSpace(v.ProductID) == "" || strings.TrimSpace(v.RunID) == "" {
		return errors.New("productId and runId are required")
	}
	if v.WindowDays <= 0 {
		return errors.New("windowDays must be positive")
	}
	switch v.EventType {
	case domain.TrendEventEntered, domain.TrendEventContinued, domain.TrendEventExited, domain.TrendEventReentered:
		return nil
	default:
		return errors.New("unsupported trend event type")
	}
}

func validateProductTrendEventTimestamp(v domain.ProductTrendEvent) error {
	if strings.TrimSpace(v.OccurredAt) == "" {
		return errors.New("occurredAt is required")
	}
	if _, err := time.Parse(time.RFC3339, v.OccurredAt); err != nil {
		return errors.New("occurredAt must use RFC3339")
	}
	return nil
}

func newerTrendEvent(candidate, current domain.ProductTrendEvent) bool {
	return candidate.OccurredAt > current.OccurredAt || (candidate.OccurredAt == current.OccurredAt && candidate.ID > current.ID)
}

func (s *Store) AppendProductTrendEvent(v domain.ProductTrendEvent) error {
	return s.AppendProductTrendEvents([]domain.ProductTrendEvent{v})
}

func (s *Store) AppendProductTrendEvents(rows []domain.ProductTrendEvent) error {
	if len(rows) == 0 {
		return nil
	}
	prepared := append([]domain.ProductTrendEvent(nil), rows...)

	s.mu.Lock()
	defer s.mu.Unlock()
	path := filepath.Join(s.root, "history", productTrendEventsFile)
	latest := map[productTrendEventKey]domain.ProductTrendEvent{}
	f, err := os.Open(path)
	if err == nil {
		scanner := bufio.NewScanner(f)
		scanner.Buffer(make([]byte, 1024), 10*1024*1024)
		for scanner.Scan() {
			if strings.TrimSpace(scanner.Text()) == "" {
				continue
			}
			var row domain.ProductTrendEvent
			if err := json.Unmarshal(scanner.Bytes(), &row); err != nil {
				f.Close()
				return err
			}
			key := trendEventKey(row)
			old, ok := latest[key]
			if !ok || newerTrendEvent(row, old) {
				latest[key] = row
			}
		}
		if err := scanner.Err(); err != nil {
			f.Close()
			return err
		}
		if err := f.Close(); err != nil {
			return err
		}
	} else if !os.IsNotExist(err) {
		return err
	}

	accepted := make([]domain.ProductTrendEvent, 0, len(prepared))
	for i := range prepared {
		v := prepared[i]
		if err := validateProductTrendEventIdentity(v); err != nil {
			return err
		}
		key := trendEventKey(v)
		if old, ok := latest[key]; ok {
			if old.EventType == v.EventType && old.Active == v.Active {
				continue
			}
			return errors.New("trend event already exists for product, run, and window")
		}
		if v.ID == "" {
			v.ID = domain.NewID()
		}
		if err := validateProductTrendEventTimestamp(v); err != nil {
			return err
		}
		prepared[i] = v
		latest[key] = v
		accepted = append(accepted, v)
	}
	if len(accepted) == 0 {
		return nil
	}
	encoded := make([][]byte, len(accepted))
	for i, row := range accepted {
		b, err := json.Marshal(row)
		if err != nil {
			return err
		}
		encoded[i] = b
	}
	out, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	writer := bufio.NewWriterSize(out, 256*1024)
	for _, b := range encoded {
		if _, err := writer.Write(b); err != nil {
			out.Close()
			return err
		}
		if err := writer.WriteByte('\n'); err != nil {
			out.Close()
			return err
		}
	}
	if err := writer.Flush(); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

func (s *Store) ProductTrendEvents(filter domain.ProductTrendEventFilter) ([]domain.ProductTrendEvent, error) {
	rows, err := s.productTrendEventRowsIndexed()
	if err != nil {
		return nil, err
	}
	out := make([]domain.ProductTrendEvent, 0, len(rows))
	for _, v := range rows {
		if filter.ProductID != "" && v.ProductID != filter.ProductID {
			continue
		}
		if filter.RunID != "" && v.RunID != filter.RunID {
			continue
		}
		if filter.WindowDays > 0 && v.WindowDays != filter.WindowDays {
			continue
		}
		out = append(out, v)
	}
	return out, nil
}
