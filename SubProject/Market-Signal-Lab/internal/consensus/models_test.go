package consensus

import "testing"

func TestRegisteredModelsAreCompleteAndVersioned(t *testing.T) {
	want := []string{
		"observation-context-v0.1",
		"surface-snapshot-v0.1",
		"paired-comparability-v0.1",
		"rbo-consensus-v0.1",
		"concept-distribution-similarity-v0.1",
		"market-consensus-v0.1",
		"market-ambiguity-v0.1",
		"ranking-volatility-v0.1",
		"observed-selection-probability-v0.1",
		"cluster-consensus-v0.1",
		"context-health-v0.1",
		"capture-policy-v0.1",
	}
	got := map[string]bool{}
	for _, model := range RegisteredModels() {
		got[model.Version] = true
	}
	for _, version := range want {
		if !got[version] {
			t.Fatalf("missing model %s", version)
		}
	}
}

func TestConsensusWeightsMatchApprovedDesign(t *testing.T) {
	byName := map[string]map[string]float64{}
	for _, model := range RegisteredModels() {
		byName[model.Name] = model.Weights
	}
	if byName["market-consensus"]["item_consensus"] != .35 || byName["market-consensus"]["concept_consensus"] != .65 {
		t.Fatalf("unexpected market-consensus weights: %#v", byName["market-consensus"])
	}
	if byName["cluster-consensus"]["context_presence_rate"] != .25 || byName["cluster-consensus"]["evidence_quality"] != .10 {
		t.Fatalf("unexpected cluster weights: %#v", byName["cluster-consensus"])
	}
}
