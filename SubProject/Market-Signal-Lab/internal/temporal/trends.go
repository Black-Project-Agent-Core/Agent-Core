package temporal

import (
	"sort"

	"marketsignallab/internal/domain"
)

const TrendLifecycleModelVersion = "trend-lifecycle-v0.1"

type LifecycleInput struct {
	RunID          string
	PriorRunID     string
	OccurredAt     string
	WindowDays     int
	Current        []domain.ProductSnapshot
	PreviousEvents []domain.ProductTrendEvent
}

func QualifiesAsTrending(row domain.ProductSnapshot) bool {
	if row.Direction != domain.DirectionRising && row.Direction != domain.DirectionStrongRising {
		return false
	}
	return row.ExposureScore >= 55 && row.OpportunityScore >= 55
}

func BuildTrendEvents(in LifecycleInput) []domain.ProductTrendEvent {
	latest := map[string]domain.ProductTrendEvent{}
	everActive := map[string]bool{}
	for _, event := range in.PreviousEvents {
		if event.WindowDays != in.WindowDays {
			continue
		}
		if event.Active {
			everActive[event.ProductID] = true
		}
		old, ok := latest[event.ProductID]
		if !ok || event.OccurredAt > old.OccurredAt || (event.OccurredAt == old.OccurredAt && event.ID > old.ID) {
			latest[event.ProductID] = event
		}
	}
	current := map[string]domain.ProductSnapshot{}
	for _, row := range in.Current {
		if row.ProductID != "" {
			current[row.ProductID] = row
		}
	}
	out := []domain.ProductTrendEvent{}
	for productID, row := range current {
		active := QualifiesAsTrending(row)
		previous, hasPrevious := latest[productID]
		if !active {
			if hasPrevious && previous.Active {
				out = append(out, newEvent(in, row, domain.TrendEventExited, false))
			}
			continue
		}
		eventType := domain.TrendEventEntered
		if hasPrevious {
			if previous.Active {
				eventType = domain.TrendEventContinued
			} else if everActive[productID] {
				eventType = domain.TrendEventReentered
			}
		}
		out = append(out, newEvent(in, row, eventType, true))
	}
	for productID, previous := range latest {
		if _, ok := current[productID]; ok || !previous.Active {
			continue
		}
		out = append(out, domain.ProductTrendEvent{
			ID: domain.NewID(), ProductID: productID, RunID: in.RunID, PriorRunID: in.PriorRunID,
			WindowDays: in.WindowDays, EventType: domain.TrendEventExited, Active: false,
			OccurredAt: in.OccurredAt, ModelVersion: TrendLifecycleModelVersion,
		})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].ProductID != out[j].ProductID {
			return out[i].ProductID < out[j].ProductID
		}
		return out[i].EventType < out[j].EventType
	})
	return out
}

func newEvent(in LifecycleInput, row domain.ProductSnapshot, eventType domain.TrendEventType, active bool) domain.ProductTrendEvent {
	return domain.ProductTrendEvent{
		ID: domain.NewID(), ProductID: row.ProductID, RunID: in.RunID, PriorRunID: in.PriorRunID,
		WindowDays: in.WindowDays, EventType: eventType, Active: active,
		TrendScore: row.ExposureScore, OpportunityScore: row.OpportunityScore,
		ExposureScore: row.ExposureScore, Direction: row.Direction,
		OccurredAt: in.OccurredAt, ModelVersion: TrendLifecycleModelVersion,
	}
}
