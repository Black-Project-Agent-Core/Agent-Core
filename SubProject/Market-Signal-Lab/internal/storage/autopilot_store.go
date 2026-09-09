package storage

import (
	"encoding/json"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/repository"
	"sort"
)

func (s *Store) SaveMarketMapPlan(v domain.MarketMapPlan) error {
	return s.appendJSONL("market_map_plans.jsonl", v)
}
func (s *Store) MarketMapPlans() ([]domain.MarketMapPlan, error) {
	latest := map[string]domain.MarketMapPlan{}
	err := s.readJSONL("market_map_plans.jsonl", func(b []byte) error {
		var v domain.MarketMapPlan
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		latest[v.ID] = v
		return nil
	})
	out := make([]domain.MarketMapPlan, 0, len(latest))
	for _, v := range latest {
		out = append(out, v)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt < out[j].CreatedAt })
	return out, err
}
func (s *Store) MarketMapPlanByID(id string) (domain.MarketMapPlan, bool, error) {
	xs, err := s.MarketMapPlans()
	if err != nil {
		return domain.MarketMapPlan{}, false, err
	}
	for _, v := range xs {
		if v.ID == id {
			return v, true, nil
		}
	}
	return domain.MarketMapPlan{}, false, nil
}
func (s *Store) AppendMarketMapRun(v domain.MarketMapRun) error {
	return s.appendJSONL("market_map_runs.jsonl", v)
}
func (s *Store) MarketMapRuns() ([]domain.MarketMapRun, error) {
	latest := map[string]domain.MarketMapRun{}
	err := s.readJSONL("market_map_runs.jsonl", func(b []byte) error {
		var v domain.MarketMapRun
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		latest[v.ID] = v
		return nil
	})
	out := make([]domain.MarketMapRun, 0, len(latest))
	for _, v := range latest {
		out = append(out, v)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].StartedAt < out[j].StartedAt })
	return out, err
}
func (s *Store) MarketMapRunByID(id string) (domain.MarketMapRun, bool, error) {
	xs, err := s.MarketMapRuns()
	if err != nil {
		return domain.MarketMapRun{}, false, err
	}
	for _, v := range xs {
		if v.ID == id {
			return v, true, nil
		}
	}
	return domain.MarketMapRun{}, false, nil
}
func (s *Store) LatestCompletedMarketMapRun(key string) (domain.MarketMapRun, bool, error) {
	xs, err := s.MarketMapRuns()
	if err != nil {
		return domain.MarketMapRun{}, false, err
	}
	var got domain.MarketMapRun
	ok := false
	for _, v := range xs {
		if v.Status != domain.MarketMapRunCompleted || v.CompatibilityKey != key {
			continue
		}
		if !ok || v.CompletedAt > got.CompletedAt {
			got, ok = v, true
		}
	}
	return got, ok, nil
}

func (s *Store) LatestCompletedMarketMapRunExcluding(key, excludeRunID string) (domain.MarketMapRun, bool, error) {
	xs, err := s.MarketMapRuns()
	if err != nil {
		return domain.MarketMapRun{}, false, err
	}
	var got domain.MarketMapRun
	ok := false
	for _, v := range xs {
		if v.ID == excludeRunID || v.Status != domain.MarketMapRunCompleted || v.CompatibilityKey != key {
			continue
		}
		if !ok || v.CompletedAt > got.CompletedAt {
			got, ok = v, true
		}
	}
	return got, ok, nil
}

func (s *Store) AppendMarketSurfaceObservation(v domain.MarketSurfaceObservation) error {
	return s.appendJSONL("market_surface_observations.jsonl", v)
}
func (s *Store) MarketSurfaceObservations(runID string) ([]domain.MarketSurfaceObservation, error) {
	out := []domain.MarketSurfaceObservation{}
	err := s.readJSONL("market_surface_observations.jsonl", func(b []byte) error {
		var v domain.MarketSurfaceObservation
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		if runID == "" || v.RunID == runID {
			out = append(out, v)
		}
		return nil
	})
	return out, err
}
func (s *Store) AppendMarketDirectionSnapshot(v domain.MarketDirectionSnapshot) error {
	return s.appendJSONL("market_direction_snapshots.jsonl", v)
}
func (s *Store) MarketDirectionSnapshots(runID string) ([]domain.MarketDirectionSnapshot, error) {
	out := []domain.MarketDirectionSnapshot{}
	err := s.readJSONL("market_direction_snapshots.jsonl", func(b []byte) error {
		var v domain.MarketDirectionSnapshot
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		if runID == "" || v.RunID == runID {
			out = append(out, v)
		}
		return nil
	})
	return out, err
}
func (s *Store) AppendProductDirectionCluster(v domain.ProductDirectionCluster) error {
	return s.appendJSONL("product_direction_clusters.jsonl", v)
}
func (s *Store) AppendProductDirectionClusters(rows []domain.ProductDirectionCluster) error {
	return appendJSONLBatch(s, "product_direction_clusters.jsonl", rows)
}
func (s *Store) ProductDirectionClusters(runID string) ([]domain.ProductDirectionCluster, error) {
	out := []domain.ProductDirectionCluster{}
	err := s.readJSONL("product_direction_clusters.jsonl", func(b []byte) error {
		var v domain.ProductDirectionCluster
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		if runID == "" || v.RunID == runID {
			out = append(out, v)
		}
		return nil
	})
	return out, err
}
func (s *Store) AppendProductionInsight(v domain.ProductionInsight) error {
	return s.appendJSONL("production_insights.jsonl", v)
}
func (s *Store) AppendProductionInsights(rows []domain.ProductionInsight) error {
	return appendJSONLBatch(s, "production_insights.jsonl", rows)
}
func (s *Store) ProductionInsights(runID string) ([]domain.ProductionInsight, error) {
	out := []domain.ProductionInsight{}
	err := s.readJSONL("production_insights.jsonl", func(b []byte) error {
		var v domain.ProductionInsight
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		if runID == "" || v.RunID == runID {
			out = append(out, v)
		}
		return nil
	})
	return out, err
}
func (s *Store) AppendSaturationAlert(v domain.SaturationAlert) error {
	return s.appendJSONL("saturation_alerts.jsonl", v)
}
func (s *Store) AppendSaturationAlerts(rows []domain.SaturationAlert) error {
	return appendJSONLBatch(s, "saturation_alerts.jsonl", rows)
}
func (s *Store) SaturationAlerts(runID string) ([]domain.SaturationAlert, error) {
	out := []domain.SaturationAlert{}
	err := s.readJSONL("saturation_alerts.jsonl", func(b []byte) error {
		var v domain.SaturationAlert
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		if runID == "" || v.RunID == runID {
			out = append(out, v)
		}
		return nil
	})
	return out, err
}
func (s *Store) AppendAdvancedResearchSeed(v domain.AdvancedResearchSeed) error {
	return s.appendJSONL("advanced_research_seeds.jsonl", v)
}
func (s *Store) AdvancedResearchSeeds(runID string) ([]domain.AdvancedResearchSeed, error) {
	out := []domain.AdvancedResearchSeed{}
	err := s.readJSONL("advanced_research_seeds.jsonl", func(b []byte) error {
		var v domain.AdvancedResearchSeed
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		if runID == "" || v.RunID == runID {
			out = append(out, v)
		}
		return nil
	})
	return out, err
}
func (s *Store) AppendClassificationReview(v domain.ClassificationReview) error {
	return s.appendJSONL("classification_reviews.jsonl", v)
}
func (s *Store) AppendClassificationReviews(rows []domain.ClassificationReview) error {
	return appendJSONLBatch(s, "classification_reviews.jsonl", rows)
}
func (s *Store) ClassificationReviews(runID string) ([]domain.ClassificationReview, error) {
	out := []domain.ClassificationReview{}
	err := s.readJSONL("classification_reviews.jsonl", func(b []byte) error {
		var v domain.ClassificationReview
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		if runID == "" || v.RunID == runID {
			out = append(out, v)
		}
		return nil
	})
	return out, err
}

var _ repository.AutopilotRepository = (*Store)(nil)
