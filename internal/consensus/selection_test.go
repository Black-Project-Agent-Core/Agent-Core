package consensus

import (
	"context"
	"testing"
)

func TestObservedSelectionProbabilityExposesBoundedDenominator(t *testing.T) {
	got, err := BuildSelectionProbabilityWithEngine(context.Background(), testAnalyticsEngine, SelectionInput{EntityType: "item", EntityID: "product-a", Observations: []SelectionObservation{{SnapshotID: "s1", Weight: 1, Selected: true}, {SnapshotID: "s2", Weight: 1, Selected: true}, {SnapshotID: "s3", Weight: 1, Selected: false}, {SnapshotID: "s4", Weight: 1, Selected: true}}, TopK: 30, ContextTypes: []string{"public_web", "subscriber_app"}, WindowStart: "2026-08-01T00:00:00Z", WindowEnd: "2026-08-16T00:00:00Z"})
	if err != nil {
		t.Fatal(err)
	}
	if got.Score != 75 || got.SelectedWeight != 3 || got.EligibleWeight != 4 || len(got.EligibleSnapshotIDs) != 4 {
		t.Fatalf("got=%+v", got)
	}
	if got.Label != "observed_selection_probability" {
		t.Fatalf("label=%s", got.Label)
	}
}

func TestSelectionProbabilityRejectsEmptyOrNegativeWeights(t *testing.T) {
	if _, err := BuildSelectionProbabilityWithEngine(context.Background(), testAnalyticsEngine, SelectionInput{}); err == nil {
		t.Fatal("empty denominator must fail")
	}
	if _, err := BuildSelectionProbabilityWithEngine(context.Background(), testAnalyticsEngine, SelectionInput{Observations: []SelectionObservation{{SnapshotID: "s1", Weight: -1, Selected: true}}}); err == nil {
		t.Fatal("negative weight must fail")
	}
}
