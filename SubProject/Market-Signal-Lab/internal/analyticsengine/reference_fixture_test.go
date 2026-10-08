package analyticsengine

import (
	"encoding/json"
	"os"
	"testing"
)

type referenceFixtureV6521 struct {
	Version    string `json:"version"`
	Tolerances struct {
		DistributionSimilarity float64 `json:"distributionSimilarity"`
		Volatility             float64 `json:"volatility"`
		SelectionProbability   float64 `json:"selectionProbability"`
	} `json:"tolerances"`
	DistributionSimilarity []referenceCase `json:"distributionSimilarity"`
	ItemVolatility         []referenceCase `json:"itemVolatility"`
	ClusterVolatility      []referenceCase `json:"clusterVolatility"`
	SelectionProbability   []referenceCase `json:"selectionProbability"`
}

type referenceCase struct {
	Name          string          `json:"name"`
	Input         json.RawMessage `json:"input"`
	Expected      json.RawMessage `json:"expected,omitempty"`
	ExpectedError string          `json:"expectedError,omitempty"`
}

func loadReferenceFixture(t *testing.T, path string) referenceFixtureV6521 {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var fixture referenceFixtureV6521
	if err := json.Unmarshal(b, &fixture); err != nil {
		t.Fatal(err)
	}
	return fixture
}

func TestReferenceVectorsV6521AreComplete(t *testing.T) {
	fixture := loadReferenceFixture(t, "testdata/reference_vectors_v6521.json")
	if fixture.Version != "alpha6.5.2.1" {
		t.Fatalf("version=%q", fixture.Version)
	}
	if len(fixture.DistributionSimilarity) < 4 || len(fixture.ItemVolatility) < 3 || len(fixture.ClusterVolatility) < 2 || len(fixture.SelectionProbability) < 4 {
		t.Fatalf("fixture coverage incomplete: distribution=%d item=%d cluster=%d selection=%d", len(fixture.DistributionSimilarity), len(fixture.ItemVolatility), len(fixture.ClusterVolatility), len(fixture.SelectionProbability))
	}
	if fixture.Tolerances.DistributionSimilarity != 1e-6 || fixture.Tolerances.Volatility != 1e-6 || fixture.Tolerances.SelectionProbability != 1e-9 {
		t.Fatalf("unexpected tolerances: %+v", fixture.Tolerances)
	}
	for group, cases := range map[string][]referenceCase{"distributionSimilarity": fixture.DistributionSimilarity, "itemVolatility": fixture.ItemVolatility, "clusterVolatility": fixture.ClusterVolatility, "selectionProbability": fixture.SelectionProbability} {
		for i, c := range cases {
			if c.Name == "" || len(c.Input) == 0 || (len(c.Expected) == 0 && c.ExpectedError == "") {
				t.Fatalf("%s[%d] incomplete: %+v", group, i, c)
			}
		}
	}
}
