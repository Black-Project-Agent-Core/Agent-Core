package ranking

import (
	"reflect"
	"strings"
	"testing"
)

func TestC2ModelPresentationPreservesLegacyNumericContracts(t *testing.T) {
	product, _ := ModelByName("product-opportunity")
	if product.Version != "product-opportunity-v0.1" || product.Kind != "opportunity_index" || product.MissingPolicy != "renormalize" {
		t.Fatalf("product contract changed: %+v", product)
	}
	want := map[string]float64{"exposure": .40, "relative_strength": .25, "freshness": .15, "cross_query": .10, "rank_velocity": .10}
	if !reflect.DeepEqual(product.Weights, want) {
		t.Fatalf("weights=%v", product.Weights)
	}
	// The C2-safe note disclaims "not market-entry timing", so a bare substring
	// check for "entry timing" would reject it; pin the exact mandated string instead.
	wantProductNotes := "Legacy numeric model presented as Product Insight Score under msl-semantic-contract/2; not market-entry timing, success probability, revenue, or competitor earnings."
	if product.Notes != wantProductNotes || strings.Contains(strings.ToLower(product.Notes), "entry-opportunity") {
		t.Fatalf("unsafe C2 note: %q", product.Notes)
	}

	catalog, _ := ModelByName("catalog-opportunity")
	if catalog.Version != "catalog-opportunity-v0.1" || catalog.Kind != "opportunity_index" || catalog.MissingPolicy != "renormalize" {
		t.Fatalf("catalog contract changed: %+v", catalog)
	}
	wantCatalog := map[string]float64{"trend": .35, "supply_gap": .20, "market_breadth": .15, "freshness": .10, "author_diversity": .10, "inverse_competition": .10}
	if !reflect.DeepEqual(catalog.Weights, wantCatalog) {
		t.Fatalf("weights=%v", catalog.Weights)
	}
	wantCatalogNotes := "Legacy numeric model presented as Catalog Insight Score under msl-semantic-contract/2; not market-entry timing, success probability, revenue, or certainty of future demand."
	if catalog.Notes != wantCatalogNotes || strings.Contains(strings.ToLower(catalog.Notes), "entry opportunity") {
		t.Fatalf("unsafe C2 note: %q", catalog.Notes)
	}
}

func TestModelRegistryContainsLockedV03BModels(t *testing.T) {
	names := map[string]bool{}
	for _, model := range ModelRegistry() {
		names[model.Name] = true
		if model.Version == "" {
			t.Fatalf("invalid model=%+v", model)
		}
	}
	for _, name := range []string{
		"product-exposure", "product-opportunity", "catalog-trend",
		"catalog-opportunity", "direction",
	} {
		if !names[name] {
			t.Fatalf("missing model %s", name)
		}
		model, ok := ModelByName(name)
		if !ok || model.MissingPolicy != "renormalize" {
			t.Fatalf("legacy model contract changed: %+v", model)
		}
	}
}

func TestModelRegistryContainsAlpha65IntegrityModels(t *testing.T) {
	versions := map[string]bool{}
	for _, model := range ModelRegistry() {
		versions[model.Version] = true
	}
	for _, version := range []string{"sampling-schema-v0.1", "taxonomy-segmentation-v0.1", "data-quality-v0.1", "volume-weighted-market-index-v0.1", "equal-sector-market-index-v0.1", "index-divergence-v0.1", "direction-stage-v0.1", "score-provenance-v0.1"} {
		if !versions[version] {
			t.Fatalf("missing integrity model %s", version)
		}
	}
}
