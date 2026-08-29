package ranking

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"sort"
	"testing"
)

type c1FixtureManifest struct {
	SchemaVersion string   `json:"schemaVersion"`
	ReferenceSHA  string   `json:"referenceSha"`
	ModelVersions []string `json:"modelVersions"`
	FixtureFiles  []string `json:"fixtureFiles"`
}

func TestC1GoldenManifestContract(t *testing.T) {
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot resolve C1 golden test source path")
	}
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(currentFile), "..", ".."))
	manifestPath := filepath.Join(repoRoot, "internal", "ranking", "testdata", "c1", "manifest.json")

	raw, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("C1 golden manifest missing: %v", err)
	}

	var manifest c1FixtureManifest
	if err := json.Unmarshal(raw, &manifest); err != nil {
		t.Fatalf("decode C1 golden manifest: %v", err)
	}
	if manifest.SchemaVersion != "msl-c1-ranking-golden/1" {
		t.Fatalf("schemaVersion=%q want %q", manifest.SchemaVersion, "msl-c1-ranking-golden/1")
	}
	if len(manifest.ReferenceSHA) != 40 {
		t.Fatalf("referenceSha=%q must be an exact 40-character source commit", manifest.ReferenceSHA)
	}

	wantFixtures := []string{
		"internal/indexing/testdata/c1/structural_index_v01_cases.json",
		"internal/ranking/testdata/c1/catalog_v01_cases.json",
		"internal/ranking/testdata/c1/product_v01_cases.json",
	}
	gotFixtures := append([]string(nil), manifest.FixtureFiles...)
	sort.Strings(gotFixtures)
	if !reflect.DeepEqual(gotFixtures, wantFixtures) {
		t.Fatalf("fixtureFiles=%v want %v", gotFixtures, wantFixtures)
	}
	for _, fixture := range wantFixtures {
		if _, err := os.Stat(filepath.Join(repoRoot, filepath.FromSlash(fixture))); err != nil {
			t.Fatalf("required C1 fixture %q unavailable: %v", fixture, err)
		}
	}

	wantModels := []string{
		"catalog-opportunity-v0.1",
		"catalog-trend-v0.1",
		"data-quality-v0.1",
		"direction-stage-v0.1",
		"direction-v0.1",
		"equal-sector-market-index-v0.1",
		"index-divergence-v0.1",
		"product-exposure-v0.1",
		"product-opportunity-v0.1",
		"sampling-schema-v0.1",
		"score-provenance-v0.1",
		"taxonomy-segmentation-v0.1",
		"volume-weighted-market-index-v0.1",
	}
	gotModels := append([]string(nil), manifest.ModelVersions...)
	sort.Strings(gotModels)
	if !reflect.DeepEqual(gotModels, wantModels) {
		t.Fatalf("modelVersions=%v want %v", gotModels, wantModels)
	}
}
