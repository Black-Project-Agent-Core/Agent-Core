package indexing

import "testing"

func TestRegisteredModelsIncludesAlpha65IntegrityModels(t *testing.T) {
	models := RegisteredModels()
	want := map[string]bool{
		"sampling-schema-v0.1":              false,
		"taxonomy-segmentation-v0.1":        false,
		"data-quality-v0.1":                 false,
		"volume-weighted-market-index-v0.1": false,
		"equal-sector-market-index-v0.1":    false,
		"index-divergence-v0.1":             false,
		"direction-stage-v0.1":              false,
		"score-provenance-v0.1":             false,
	}
	for _, model := range models {
		if _, ok := want[model.Version]; ok {
			want[model.Version] = true
			if model.Kind != "integrity" || model.Notes == "" {
				t.Fatalf("invalid model=%+v", model)
			}
		}
	}
	for version, found := range want {
		if !found {
			t.Fatalf("missing model %s", version)
		}
	}
}
