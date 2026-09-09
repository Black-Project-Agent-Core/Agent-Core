package temporal

import (
	"testing"

	"marketsignallab/internal/domain"
)

func risingProduct(id string) domain.ProductSnapshot {
	return domain.ProductSnapshot{ProductID: id, Direction: domain.DirectionRising, ExposureScore: 70, OpportunityScore: 68, Confidence: 80}
}

func TestBuildTrendEventsLifecycle(t *testing.T) {
	entered := BuildTrendEvents(LifecycleInput{RunID: "run-1", OccurredAt: "2026-08-01T00:00:00Z", WindowDays: 30, Current: []domain.ProductSnapshot{risingProduct("p1")}})
	if len(entered) != 1 || entered[0].EventType != domain.TrendEventEntered || !entered[0].Active {
		t.Fatalf("entered=%+v", entered)
	}
	continued := BuildTrendEvents(LifecycleInput{RunID: "run-2", PriorRunID: "run-1", OccurredAt: "2026-08-08T00:00:00Z", WindowDays: 30, Current: []domain.ProductSnapshot{risingProduct("p1")}, PreviousEvents: entered})
	if len(continued) != 1 || continued[0].EventType != domain.TrendEventContinued || !continued[0].Active {
		t.Fatalf("continued=%+v", continued)
	}
	falling := risingProduct("p1")
	falling.Direction = domain.DirectionFalling
	exited := BuildTrendEvents(LifecycleInput{RunID: "run-3", PriorRunID: "run-2", OccurredAt: "2026-08-15T00:00:00Z", WindowDays: 30, Current: []domain.ProductSnapshot{falling}, PreviousEvents: append(entered, continued...)})
	if len(exited) != 1 || exited[0].EventType != domain.TrendEventExited || exited[0].Active {
		t.Fatalf("exited=%+v", exited)
	}
	reentered := BuildTrendEvents(LifecycleInput{RunID: "run-4", PriorRunID: "run-3", OccurredAt: "2026-08-22T00:00:00Z", WindowDays: 30, Current: []domain.ProductSnapshot{risingProduct("p1")}, PreviousEvents: append(append(entered, continued...), exited...)})
	if len(reentered) != 1 || reentered[0].EventType != domain.TrendEventReentered || !reentered[0].Active {
		t.Fatalf("reentered=%+v", reentered)
	}
}

func TestBuildTrendEventsDoesNotUpdateLastTrendForNeverTrendingProduct(t *testing.T) {
	row := risingProduct("p2")
	row.Direction = domain.DirectionNeutral
	row.ExposureScore = 90
	row.OpportunityScore = 90
	events := BuildTrendEvents(LifecycleInput{RunID: "run-1", OccurredAt: "2026-08-01T00:00:00Z", WindowDays: 7, Current: []domain.ProductSnapshot{row}})
	if len(events) != 0 {
		t.Fatalf("events=%+v", events)
	}
}

func TestBuildTrendEventsMarksPreviouslyActiveMissingProductExited(t *testing.T) {
	previous := []domain.ProductTrendEvent{{ProductID: "p3", RunID: "run-1", WindowDays: 90, EventType: domain.TrendEventEntered, Active: true, OccurredAt: "2026-08-01T00:00:00Z"}}
	events := BuildTrendEvents(LifecycleInput{RunID: "run-2", PriorRunID: "run-1", OccurredAt: "2026-08-08T00:00:00Z", WindowDays: 90, PreviousEvents: previous})
	if len(events) != 1 || events[0].ProductID != "p3" || events[0].EventType != domain.TrendEventExited {
		t.Fatalf("events=%+v", events)
	}
}
