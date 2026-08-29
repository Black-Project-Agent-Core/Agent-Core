package analyticsengine

import (
	"context"
	"encoding/json"
	"reflect"
	"testing"
)

func TestEngineContractExposesPilotCapabilities(t *testing.T) {
	want := []Capability{
		CapabilityDistributionSimilarity,
		CapabilityItemVolatility,
		CapabilityClusterVolatility,
		CapabilitySelectionProbability,
	}
	got := PilotCapabilities()
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("capabilities=%v want=%v", got, want)
	}

	var _ Engine = (*contractEngineStub)(nil)
}

func TestEngineDTOJSONNamesAreDeterministic(t *testing.T) {
	rank := 5
	payload := struct {
		Similarity DistributionSimilarityInput `json:"similarity"`
		Item       ItemVolatilityInput         `json:"item"`
		Cluster    ClusterVolatilityInput      `json:"cluster"`
		Selection  SelectionProbabilityInput   `json:"selection"`
	}{
		Similarity: DistributionSimilarityInput{A: map[string]float64{"a": 1}, B: map[string]float64{"b": 2}},
		Item:       ItemVolatilityInput{Ranks: []*int{&rank, nil}, TopK: 30, ConsecutiveAppearances: 1, EligibleSnapshots: 2, RBOToPrevious: 75},
		Cluster:    ClusterVolatilityInput{Shares: []float64{10, 12}, ContextDisagreement: 20, CrossTimePersistence: 80},
		Selection:  SelectionProbabilityInput{Observations: []SelectionObservation{{Weight: 2, Selected: true}}},
	}
	b, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(b, &decoded); err != nil {
		t.Fatal(err)
	}
	item := decoded["item"].(map[string]any)
	for _, key := range []string{"ranks", "topK", "consecutiveAppearances", "eligibleSnapshots", "rboToPrevious"} {
		if _, ok := item[key]; !ok {
			t.Fatalf("missing item JSON key %q in %s", key, b)
		}
	}
	selection := decoded["selection"].(map[string]any)
	if _, ok := selection["observations"]; !ok {
		t.Fatalf("missing observations in %s", b)
	}
}

type contractEngineStub struct{}

func (*contractEngineStub) Name() string                  { return "stub" }
func (*contractEngineStub) Version() string               { return "0" }
func (*contractEngineStub) Capabilities() []Capability    { return PilotCapabilities() }
func (*contractEngineStub) Health(context.Context) Health { return Health{} }
func (*contractEngineStub) DistributionSimilarity(context.Context, DistributionSimilarityInput) (DistributionSimilarityResult, error) {
	return DistributionSimilarityResult{}, nil
}
func (*contractEngineStub) ItemVolatility(context.Context, ItemVolatilityInput) (VolatilityResult, error) {
	return VolatilityResult{}, nil
}
func (*contractEngineStub) ClusterVolatility(context.Context, ClusterVolatilityInput) (VolatilityResult, error) {
	return VolatilityResult{}, nil
}
func (*contractEngineStub) SelectionProbability(context.Context, SelectionProbabilityInput) (SelectionProbabilityResult, error) {
	return SelectionProbabilityResult{}, nil
}
func (*contractEngineStub) Close() error { return nil }
