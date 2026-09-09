package app

import (
	"errors"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/sampling"
	"sort"
	"time"
)

// BuildAndPersistSampleAudit joins only persisted observations, market-surface
// evidence and versioned taxonomy segmentations. It never infers a site or a
// surface from a product title.
func (s *Service) BuildAndPersistSampleAudit(runID string, comparableRuns int) (domain.SampleAudit, error) {
	run, ok, err := s.autopilot.MarketMapRunByID(runID)
	if err != nil {
		return domain.SampleAudit{}, err
	}
	if !ok {
		return domain.SampleAudit{}, errors.New("market map run not found")
	}
	plan, ok, err := s.autopilot.MarketMapPlanByID(run.PlanID)
	if err != nil {
		return domain.SampleAudit{}, err
	}
	if !ok {
		return domain.SampleAudit{}, errors.New("market map plan not found")
	}
	targetResults, err := s.integrity.MarketMapTargetResults(runID)
	if err != nil {
		return domain.SampleAudit{}, err
	}
	observations, err := s.universe.ProductObservations(domain.ObservationFilter{MarketMapRunID: runID})
	if err != nil {
		return domain.SampleAudit{}, err
	}
	surfaceRows, err := s.autopilot.MarketSurfaceObservations(runID)
	if err != nil {
		return domain.SampleAudit{}, err
	}
	segmentations, err := s.integrity.ObservationSegmentations(domain.ObservationSegmentationFilter{RunID: runID})
	if err != nil {
		return domain.SampleAudit{}, err
	}

	surfaceByProduct := map[string]domain.MarketSurfaceObservation{}
	for _, row := range surfaceRows {
		if existing, found := surfaceByProduct[row.ProductID]; !found || row.ObservedAt > existing.ObservedAt {
			surfaceByProduct[row.ProductID] = row
		}
	}
	segmentByObservation := map[string]domain.ObservationSegmentation{}
	for _, row := range segmentations {
		if existing, found := segmentByObservation[row.ObservationID]; !found || row.GeneratedAt > existing.GeneratedAt {
			segmentByObservation[row.ObservationID] = row
		}
	}

	auditRows := make([]sampling.AuditObservation, 0, len(observations))
	for _, observation := range observations {
		surface := surfaceByProduct[observation.ProductID]
		segment := segmentByObservation[observation.ID]
		site := surface.Site
		marketSurface := surface.Surface
		reliability := surface.Reliability
		if marketSurface == "" {
			marketSurface = observation.SurfaceType
		}
		if reliability == 0 {
			reliability = observation.ObservationReliability
		}
		catalogID := segment.CatalogID
		if catalogID == "" {
			catalogID = observation.CatalogID
		}
		auditRows = append(auditRows, sampling.AuditObservation{
			ProductID: observation.ProductID, AuthorID: observation.AuthorID,
			Site: site, ContentType: segment.ContentType, CatalogID: catalogID,
			Surface: marketSurface, Reliability: reliability, TaxonomyConfidence: segment.Confidence,
		})
	}
	sort.SliceStable(auditRows, func(i, j int) bool {
		if auditRows[i].Site != auditRows[j].Site {
			return auditRows[i].Site < auditRows[j].Site
		}
		return auditRows[i].ProductID < auditRows[j].ProductID
	})
	generatedAt := run.CompletedAt
	if generatedAt == "" {
		generatedAt = time.Now().UTC().Format(time.RFC3339)
	}
	audit, err := sampling.BuildSampleAudit(sampling.AuditInput{
		RunID: run.ID, PlannerVersion: plan.PlannerVersion,
		SamplingSchemaVersion: plan.SamplingSchemaVersion, TaxonomyVersion: plan.TaxonomyVersion,
		Targets: plan.Targets, TargetResults: targetResults, Observations: auditRows,
		ComparableRuns: comparableRuns, GeneratedAt: generatedAt,
	})
	if err != nil {
		return domain.SampleAudit{}, err
	}
	if err := s.integrity.AppendSampleAudit(audit); err != nil {
		return domain.SampleAudit{}, err
	}
	run.SampleAuditID = audit.ID
	if err := s.autopilot.AppendMarketMapRun(run); err != nil {
		return domain.SampleAudit{}, err
	}
	return audit, nil
}
