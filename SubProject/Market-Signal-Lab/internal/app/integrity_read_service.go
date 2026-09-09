package app

import (
	"errors"
	"marketsignallab/internal/domain"
	"math"
	"sort"
	"strings"
)

var canonicalSurfaceOrder = []domain.MarketSurface{
	domain.MarketSurfaceNew,
	domain.MarketSurfaceRandomNew,
	domain.MarketSurfacePopular,
	domain.MarketSurfaceFeatured,
	domain.MarketSurfaceSearch,
	domain.MarketSurfaceCategory,
	domain.MarketSurfaceSimilar,
}

var hierarchyLevelOrder = map[domain.SegmentLevel]int{
	domain.SegmentLevelGlobal:      0,
	domain.SegmentLevelSite:        1,
	domain.SegmentLevelContentType: 2,
	domain.SegmentLevelCatalog:     3,
	domain.SegmentLevelProductType: 4,
	domain.SegmentLevelUseCase:     5,
}

// IntegritySampleAudit returns the immutable, latest stored audit for a run.
// It never recomputes an old run in a read path.
func (s *Service) IntegritySampleAudit(runID string) (domain.SampleAudit, bool, error) {
	return s.integrity.LatestSampleAudit(strings.TrimSpace(runID))
}

// IntegrityIndices returns persisted hierarchy rows in deterministic tree order.
func (s *Service) IntegrityIndices(runID string, level domain.SegmentLevel, entityID string) ([]domain.MarketIndexSnapshot, error) {
	rows, err := s.integrity.MarketIndexSnapshots(domain.MarketIndexFilter{
		RunID: strings.TrimSpace(runID), Level: level, EntityID: strings.TrimSpace(entityID),
	})
	if err != nil {
		return nil, err
	}
	sortMarketIndexHierarchy(rows)
	return rows, nil
}

// IntegrityIndexHistory returns stored history for one exact hierarchy entity.
func (s *Service) IntegrityIndexHistory(level domain.SegmentLevel, entityID string) ([]domain.MarketIndexSnapshot, error) {
	rows, err := s.integrity.MarketIndexSnapshots(domain.MarketIndexFilter{Level: level, EntityID: strings.TrimSpace(entityID)})
	if err != nil {
		return nil, err
	}
	sort.SliceStable(rows, func(i, j int) bool {
		if rows[i].GeneratedAt != rows[j].GeneratedAt {
			return rows[i].GeneratedAt < rows[j].GeneratedAt
		}
		if rows[i].RunID != rows[j].RunID {
			return rows[i].RunID < rows[j].RunID
		}
		return rows[i].ID < rows[j].ID
	})
	return rows, nil
}

func sortMarketIndexHierarchy(rows []domain.MarketIndexSnapshot) {
	sort.SliceStable(rows, func(i, j int) bool {
		li, lj := hierarchyLevelOrder[rows[i].Level], hierarchyLevelOrder[rows[j].Level]
		if li != lj {
			return li < lj
		}
		if rows[i].ParentID != rows[j].ParentID {
			return rows[i].ParentID < rows[j].ParentID
		}
		if rows[i].Label != rows[j].Label {
			return strings.ToLower(rows[i].Label) < strings.ToLower(rows[j].Label)
		}
		if rows[i].EntityID != rows[j].EntityID {
			return rows[i].EntityID < rows[j].EntityID
		}
		if rows[i].GeneratedAt != rows[j].GeneratedAt {
			return rows[i].GeneratedAt < rows[j].GeneratedAt
		}
		return rows[i].ID < rows[j].ID
	})
}

// IntegrityQuality returns persisted quality assessments only.
func (s *Service) IntegrityQuality(runID, entityType, entityID string) ([]domain.DataQualityAssessment, error) {
	rows, err := s.integrity.DataQualityAssessments(domain.DataQualityFilter{
		RunID: strings.TrimSpace(runID), EntityType: strings.TrimSpace(entityType), EntityID: strings.TrimSpace(entityID),
	})
	if err != nil {
		return nil, err
	}
	sort.SliceStable(rows, func(i, j int) bool {
		if rows[i].EntityType != rows[j].EntityType {
			return rows[i].EntityType < rows[j].EntityType
		}
		if rows[i].EntityID != rows[j].EntityID {
			return rows[i].EntityID < rows[j].EntityID
		}
		if rows[i].GeneratedAt != rows[j].GeneratedAt {
			return rows[i].GeneratedAt < rows[j].GeneratedAt
		}
		return rows[i].ID < rows[j].ID
	})
	return rows, nil
}

// IntegrityProvenance returns the exact immutable stored provenance record.
func (s *Service) IntegrityProvenance(id string) (domain.ScoreProvenance, bool, error) {
	return s.integrity.ScoreProvenanceByID(strings.TrimSpace(id))
}

func (s *Service) IntegrityLegacyReviews(status, catalogID string) ([]domain.LegacyClassificationReview, error) {
	rows, err := s.integrity.LegacyClassificationReviews(domain.LegacyClassificationReviewFilter{
		Status: strings.TrimSpace(status), CatalogID: strings.TrimSpace(catalogID),
	})
	if err != nil {
		return nil, err
	}
	sort.SliceStable(rows, func(i, j int) bool {
		if rows[i].Status != rows[j].Status {
			return rows[i].Status < rows[j].Status
		}
		if rows[i].CreatedAt != rows[j].CreatedAt {
			return rows[i].CreatedAt < rows[j].CreatedAt
		}
		return rows[i].ID < rows[j].ID
	})
	return rows, nil
}

// IntegritySurfaceBreakdown exposes all seven canonical surfaces, including
// zero-observation rows, so the UI cannot silently hide failed coverage.
func (s *Service) IntegritySurfaceBreakdown(runID string) ([]domain.SurfaceBreakdownRow, error) {
	audit, ok, err := s.IntegritySampleAudit(runID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, errors.New("sample audit not found")
	}
	targets, err := s.integrity.MarketMapTargetResults(runID)
	if err != nil {
		return nil, err
	}

	type accumulator struct {
		observations, unique, completed, failed int
		reliabilityTotal                        float64
		reliabilityWeight                       int
		contribution                            float64
	}
	acc := map[domain.MarketSurface]*accumulator{}
	for _, surface := range canonicalSurfaceOrder {
		acc[surface] = &accumulator{}
	}
	for _, share := range audit.SurfaceDistribution {
		if surface, ok := domain.ParseMarketSurfaceAlias(share.Key); ok {
			acc[surface].observations = share.Count
			acc[surface].contribution = share.Share
		}
	}
	stratumByTarget := map[string]domain.StratumAudit{}
	for _, stratum := range audit.Strata {
		stratumByTarget[stratum.TargetID] = stratum
		a := acc[stratum.Surface]
		if a == nil {
			continue
		}
		if a.observations == 0 {
			a.observations += stratum.ObservedItems
		}
		a.unique += stratum.UniqueProducts
		weight := stratum.ObservedItems
		if weight <= 0 {
			weight = 1
		}
		a.reliabilityTotal += stratum.Reliability * float64(weight)
		a.reliabilityWeight += weight
	}
	for _, target := range targets {
		stratum, found := stratumByTarget[target.TargetID]
		if !found {
			if surface := surfaceFromStratumKey(target.StratumKey); surface != "" {
				stratum.Surface = surface
				found = true
			}
		}
		if !found {
			continue
		}
		a := acc[stratum.Surface]
		if a == nil {
			continue
		}
		switch target.Status {
		case domain.MarketMapTargetCompleted:
			a.completed++
		case domain.MarketMapTargetFailed, domain.MarketMapTargetSkipped:
			a.failed++
		}
	}

	rows := make([]domain.SurfaceBreakdownRow, 0, len(canonicalSurfaceOrder))
	for _, surface := range canonicalSurfaceOrder {
		a := acc[surface]
		if a.unique > a.observations && a.observations > 0 {
			a.unique = a.observations
		}
		duplicateRate := 0.0
		if a.observations > 0 {
			duplicateRate = 100 * math.Max(0, float64(a.observations-a.unique)) / float64(a.observations)
		}
		reliability := 0.0
		if a.reliabilityWeight > 0 {
			reliability = a.reliabilityTotal / float64(a.reliabilityWeight)
		}
		rows = append(rows, domain.SurfaceBreakdownRow{
			Surface: surface, Observations: a.observations, UniqueProducts: a.unique,
			TargetsCompleted: a.completed, TargetsFailed: a.failed,
			DuplicateRate: roundRead1(duplicateRate), Reliability: roundRead1(reliability),
			Contribution: roundRead1(a.contribution),
		})
	}
	return rows, nil
}

func surfaceFromStratumKey(value string) domain.MarketSurface {
	value = strings.ToLower(value)
	for _, surface := range canonicalSurfaceOrder {
		aliases := []string{string(surface), strings.ReplaceAll(string(surface), "_", "-")}
		for _, alias := range aliases {
			if strings.Contains(value, alias) {
				return surface
			}
		}
	}
	return ""
}

func roundRead1(value float64) float64 { return math.Round(value*10) / 10 }
