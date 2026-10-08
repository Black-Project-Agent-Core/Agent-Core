package app

import (
	"errors"
	"sort"

	"marketsignallab/internal/domain"
)

func (s *Service) ProductTemporalSummary(productID string) (domain.ProductTemporalSummary, error) {
	products, err := s.universe.Products()
	if err != nil {
		return domain.ProductTemporalSummary{}, err
	}
	var product domain.ProductEntity
	found := false
	for _, row := range products {
		if row.ID == productID {
			product, found = row, true
			break
		}
	}
	if !found {
		return domain.ProductTemporalSummary{}, errors.New("product not found")
	}
	out := domain.ProductTemporalSummary{
		ProductID: product.ID, FirstDetectedAt: product.FirstSeenAt, LastScannedAt: product.LastSeenAt,
		ReleaseStatus: "unavailable", ActiveWindows: []int{}, WindowStates: map[int]domain.ProductTrendWindowSummary{},
		LifecycleStatus: "not_trending",
	}
	if release, ok, err := s.universe.ProductRelease(product.ID); err != nil {
		return out, err
	} else if ok {
		out.ReleaseAvailable = true
		out.ReleasedAt = release.ReleasedAt
		out.ReleasePrecision = release.Precision
		out.ReleaseSourceType = release.SourceType
		out.ReleaseSourceField = release.SourceField
		out.ReleaseVerifiedAt = release.VerifiedAt
		out.ReleaseStatus = "verified"
	}
	conflicts, err := s.universe.ProductReleaseConflicts(product.ID)
	if err != nil {
		return out, err
	}
	for _, conflict := range conflicts {
		if conflict.Status == domain.ReleaseConflictPending {
			out.ReleaseConflict = true
			out.ReleaseStatus = "conflict"
			break
		}
	}
	observations, err := s.universe.ProductObservations(domain.ObservationFilter{ProductID: product.ID})
	if err != nil {
		return out, err
	}
	scans := map[string]bool{}
	for _, observation := range observations {
		key := observation.MarketMapRunID
		if key == "" {
			key = observation.SessionID
		}
		if key != "" {
			scans[key] = true
		}
	}
	out.ScanCount = len(scans)
	events, err := s.universe.ProductTrendEvents(domain.ProductTrendEventFilter{ProductID: product.ID})
	if err != nil {
		return out, err
	}
	latest := map[int]domain.ProductTrendEvent{}
	lastActiveAt := ""
	for _, event := range events {
		old, ok := latest[event.WindowDays]
		if !ok || event.OccurredAt > old.OccurredAt || (event.OccurredAt == old.OccurredAt && event.ID > old.ID) {
			latest[event.WindowDays] = event
		}
		if event.Active && event.OccurredAt > lastActiveAt {
			lastActiveAt = event.OccurredAt
		}
	}
	out.LastTrendSeenAt = lastActiveAt
	for _, days := range []int{7, 30, 90} {
		event, ok := latest[days]
		if !ok {
			out.WindowStates[days] = domain.ProductTrendWindowSummary{WindowDays: days}
			continue
		}
		state := domain.ProductTrendWindowSummary{
			WindowDays: days, Active: event.Active, EventType: event.EventType, LastEventAt: event.OccurredAt,
			TrendScore: event.TrendScore, OpportunityScore: event.OpportunityScore,
			ExposureScore: event.ExposureScore, Direction: event.Direction,
		}
		if event.Active {
			state.LastTrendSeenAt = event.OccurredAt
			out.ActiveWindows = append(out.ActiveWindows, days)
			out.LifecycleStatus = string(event.EventType)
		}
		out.WindowStates[days] = state
	}
	sort.Ints(out.ActiveWindows)
	if len(out.ActiveWindows) == 0 && len(events) > 0 {
		out.LifecycleStatus = "no_longer_trending"
	}
	return out, nil
}

func (s *Service) AutopilotHistory() ([]domain.MarketMapHistoryRow, error) {
	runs, err := s.autopilot.MarketMapRuns()
	if err != nil {
		return nil, err
	}
	out := make([]domain.MarketMapHistoryRow, 0, len(runs))
	for _, run := range runs {
		row := domain.MarketMapHistoryRow{
			RunID: run.ID, Mode: run.Mode, Status: run.Status, StartedAt: run.StartedAt, CompletedAt: run.CompletedAt,
			ProductsObserved: run.ProductsObserved, AuthorsObserved: run.AuthorsObserved,
			Coverage: run.Coverage, Confidence: run.Confidence, DirectionAvailable: run.DirectionAvailable,
			CompositionOnly: true,
		}
		directions, err := s.autopilot.MarketDirectionSnapshots(run.ID)
		if err != nil {
			return nil, err
		}
		if len(directions) > 0 {
			last := directions[len(directions)-1]
			row.PriorRunID = last.PriorRunID
			row.Temperature = last.Temperature
			row.Direction = last.Direction
			row.CompositionOnly = last.CompositionOnly
		}
		out = append(out, row)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].StartedAt != out[j].StartedAt {
			return out[i].StartedAt > out[j].StartedAt
		}
		return out[i].RunID > out[j].RunID
	})
	return out, nil
}
