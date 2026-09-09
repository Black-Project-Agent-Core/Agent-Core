package app

import (
	"sort"

	"marketsignallab/internal/domain"
	"marketsignallab/internal/temporal"
)

func (s *Service) persistTrendLifecycle(run domain.MarketMapRun, priorRunID string, byWindow map[int][]domain.ProductSnapshot) error {
	windows := make([]int, 0, len(byWindow))
	for days := range byWindow {
		windows = append(windows, days)
	}
	sort.Ints(windows)
	history, err := s.universe.ProductTrendEvents(domain.ProductTrendEventFilter{})
	if err != nil {
		return err
	}
	pending := make([]domain.ProductTrendEvent, 0)
	for _, days := range windows {
		already := false
		previous := make([]domain.ProductTrendEvent, 0)
		for _, event := range history {
			if event.WindowDays != days {
				continue
			}
			if event.RunID == run.ID {
				already = true
				continue
			}
			previous = append(previous, event)
		}
		if already {
			continue
		}
		events := temporal.BuildTrendEvents(temporal.LifecycleInput{
			RunID: run.ID, PriorRunID: priorRunID, OccurredAt: run.CompletedAt,
			WindowDays: days, Current: byWindow[days], PreviousEvents: previous,
		})
		pending = append(pending, events...)
		history = append(history, events...)
	}
	return s.universe.AppendProductTrendEvents(pending)
}
