package storage

import (
	"encoding/json"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/repository"
	"sort"
	"strings"
)

func (s *Store) AppendMarketMapTargetResult(v domain.MarketMapTargetResult) error {
	if v.ID == "" {
		v.ID = domain.NewID()
	}
	xs, err := s.MarketMapTargetResults("")
	if err != nil {
		return err
	}
	for _, row := range xs {
		if row.ID == v.ID {
			return nil
		}
	}
	return s.appendJSONL("market_map_target_results.jsonl", v)
}

func (s *Store) MarketMapTargetResults(runID string) ([]domain.MarketMapTargetResult, error) {
	out := []domain.MarketMapTargetResult{}
	err := s.readJSONL("market_map_target_results.jsonl", func(b []byte) error {
		var v domain.MarketMapTargetResult
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		if runID != "" && v.RunID != runID {
			return nil
		}
		out = append(out, v)
		return nil
	})
	sort.Slice(out, func(i, j int) bool {
		if out[i].CompletedAt == out[j].CompletedAt {
			return out[i].ID < out[j].ID
		}
		return out[i].CompletedAt < out[j].CompletedAt
	})
	return out, err
}

func (s *Store) AppendSampleAudit(v domain.SampleAudit) error {
	if v.ID == "" {
		v.ID = domain.NewID()
	}
	xs, err := s.SampleAudits(domain.SampleAuditFilter{ID: v.ID})
	if err != nil {
		return err
	}
	if len(xs) > 0 {
		return nil
	}
	return s.appendJSONL("sample_audits.jsonl", v)
}
func (s *Store) SampleAudits(f domain.SampleAuditFilter) ([]domain.SampleAudit, error) {
	out := []domain.SampleAudit{}
	err := s.readJSONL("sample_audits.jsonl", func(b []byte) error {
		var v domain.SampleAudit
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		if f.ID != "" && v.ID != f.ID {
			return nil
		}
		if f.RunID != "" && v.RunID != f.RunID {
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
func (s *Store) LatestSampleAudit(runID string) (domain.SampleAudit, bool, error) {
	xs, err := s.SampleAudits(domain.SampleAuditFilter{RunID: runID})
	if err != nil || len(xs) == 0 {
		return domain.SampleAudit{}, false, err
	}
	return xs[len(xs)-1], true, nil
}

func (s *Store) AppendDataQualityAssessment(v domain.DataQualityAssessment) error {
	return s.AppendDataQualityAssessments([]domain.DataQualityAssessment{v})
}

func (s *Store) AppendDataQualityAssessments(rows []domain.DataQualityAssessment) error {
	prepared := append([]domain.DataQualityAssessment(nil), rows...)
	for i := range prepared {
		if prepared[i].ID == "" {
			prepared[i].ID = domain.NewID()
		}
	}
	return appendUniqueJSONLBatch(s, "data_quality_assessments.jsonl", prepared, func(v domain.DataQualityAssessment) string { return v.ID })
}
func (s *Store) DataQualityAssessments(f domain.DataQualityFilter) ([]domain.DataQualityAssessment, error) {
	out := []domain.DataQualityAssessment{}
	err := s.readJSONL("data_quality_assessments.jsonl", func(b []byte) error {
		var v domain.DataQualityAssessment
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		if f.ID != "" && v.ID != f.ID {
			return nil
		}
		if f.RunID != "" && v.RunID != f.RunID {
			return nil
		}
		if f.EntityType != "" && v.EntityType != f.EntityType {
			return nil
		}
		if f.EntityID != "" && v.EntityID != f.EntityID {
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

func (s *Store) AppendMarketIndexSnapshot(v domain.MarketIndexSnapshot) error {
	return s.AppendMarketIndexSnapshots([]domain.MarketIndexSnapshot{v})
}

func (s *Store) AppendMarketIndexSnapshots(rows []domain.MarketIndexSnapshot) error {
	prepared := append([]domain.MarketIndexSnapshot(nil), rows...)
	for i := range prepared {
		if prepared[i].ID == "" {
			prepared[i].ID = domain.NewID()
		}
	}
	return appendUniqueJSONLBatch(s, "market_index_snapshots.jsonl", prepared, func(v domain.MarketIndexSnapshot) string { return v.ID })
}
func (s *Store) MarketIndexSnapshots(f domain.MarketIndexFilter) ([]domain.MarketIndexSnapshot, error) {
	out := []domain.MarketIndexSnapshot{}
	err := s.readJSONL("market_index_snapshots.jsonl", func(b []byte) error {
		var v domain.MarketIndexSnapshot
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		if f.ID != "" && v.ID != f.ID {
			return nil
		}
		if f.RunID != "" && v.RunID != f.RunID {
			return nil
		}
		if f.PriorRunID != "" && v.PriorRunID != f.PriorRunID {
			return nil
		}
		if f.EntityID != "" && v.EntityID != f.EntityID {
			return nil
		}
		if f.Level != "" && v.Level != f.Level {
			return nil
		}
		if f.IntegrityStatus != "" && v.IntegrityStatus != f.IntegrityStatus {
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
func (s *Store) LatestMarketIndexSnapshot(f domain.MarketIndexFilter) (domain.MarketIndexSnapshot, bool, error) {
	xs, err := s.MarketIndexSnapshots(f)
	if err != nil || len(xs) == 0 {
		return domain.MarketIndexSnapshot{}, false, err
	}
	return xs[len(xs)-1], true, nil
}

func (s *Store) AppendScoreProvenance(v domain.ScoreProvenance) error {
	return s.AppendScoreProvenances([]domain.ScoreProvenance{v})
}

func (s *Store) AppendScoreProvenances(rows []domain.ScoreProvenance) error {
	prepared := append([]domain.ScoreProvenance(nil), rows...)
	for i := range prepared {
		if prepared[i].ID == "" {
			prepared[i].ID = domain.NewID()
		}
	}
	return appendUniqueJSONLBatch(s, "score_provenance.jsonl", prepared, func(v domain.ScoreProvenance) string { return v.ID })
}
func (s *Store) ScoreProvenances(f domain.ScoreProvenanceFilter) ([]domain.ScoreProvenance, error) {
	out := []domain.ScoreProvenance{}
	err := s.readJSONL("score_provenance.jsonl", func(b []byte) error {
		var v domain.ScoreProvenance
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		if f.ID != "" && v.ID != f.ID {
			return nil
		}
		if f.RunID != "" && v.RunID != f.RunID {
			return nil
		}
		if f.ScoreType != "" && v.ScoreType != f.ScoreType {
			return nil
		}
		if f.EntityType != "" && v.EntityType != f.EntityType {
			return nil
		}
		if f.EntityID != "" && v.EntityID != f.EntityID {
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
func (s *Store) ScoreProvenanceByID(id string) (domain.ScoreProvenance, bool, error) {
	xs, err := s.ScoreProvenances(domain.ScoreProvenanceFilter{ID: id})
	if err != nil || len(xs) == 0 {
		return domain.ScoreProvenance{}, false, err
	}
	return xs[len(xs)-1], true, nil
}

func (s *Store) AppendLegacyClassificationReview(v domain.LegacyClassificationReview) error {
	if v.ID == "" {
		v.ID = domain.NewID()
	}
	xs, err := s.LegacyClassificationReviews(domain.LegacyClassificationReviewFilter{ID: v.ID})
	if err != nil {
		return err
	}
	if len(xs) > 0 {
		return nil
	}
	return s.appendJSONL("legacy_classification_reviews.jsonl", v)
}
func (s *Store) LegacyClassificationReviews(f domain.LegacyClassificationReviewFilter) ([]domain.LegacyClassificationReview, error) {
	out := []domain.LegacyClassificationReview{}
	err := s.readJSONL("legacy_classification_reviews.jsonl", func(b []byte) error {
		var v domain.LegacyClassificationReview
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		if f.ID != "" && v.ID != f.ID {
			return nil
		}
		if f.CatalogID != "" && v.CatalogID != f.CatalogID {
			return nil
		}
		if f.Status != "" && !strings.EqualFold(v.Status, f.Status) {
			return nil
		}
		out = append(out, v)
		return nil
	})
	sort.Slice(out, func(i, j int) bool {
		if out[i].CreatedAt == out[j].CreatedAt {
			return out[i].ID < out[j].ID
		}
		return out[i].CreatedAt < out[j].CreatedAt
	})
	return out, err
}

var _ repository.IntegrityRepository = (*Store)(nil)
