package analyticsengine

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestProductionAnalyticsSourceHasNoGoOrShadowRuntime(t *testing.T) {
	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatal(err)
	}
	forbidden := []string{"ModeGoNative", "ModeShadow", "NewGoEngine", "ShadowEngine", "RustFallbackEngine"}
	var production strings.Builder
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue
		}
		b, err := os.ReadFile(filepath.Clean(name))
		if err != nil {
			t.Fatal(err)
		}
		production.Write(b)
		production.WriteByte('\n')
	}
	src := production.String()
	for _, token := range forbidden {
		if strings.Contains(src, token) {
			t.Fatalf("forbidden production analytics token remains: %s", token)
		}
	}
}

func TestProductionRankingOwnershipHasNoMigratedGoFormulaPaths(t *testing.T) {
	checks := []struct {
		root      string
		forbidden []string
	}{
		{
			root: filepath.Join("..", "app"),
			forbidden: []string{
				"BuildProductSnapshots(",
				"BuildCatalogSnapshots(",
				"indexing.Build(",
			},
		},
		{
			root: filepath.Join("..", "ranking"),
			forbidden: []string{
				"func BuildProductSnapshots(",
				"func BuildCatalogSnapshots(",
				"func SignedDeltaPercent(",
				"func PercentileRanks(",
				"func HHI(",
				"func OptionalWeightedScore(",
				"func DirectionFromIndex(",
			},
		},
		{
			root: filepath.Join("..", "indexing"),
			forbidden: []string{
				"func Build(",
				"func CappedWeights(",
				"func EqualSectorValue(",
				"func ApplyDirection(",
				"func StageForComparableRuns(",
			},
		},
	}

	for _, check := range checks {
		err := filepath.WalkDir(check.root, func(path string, entry os.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if entry.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
				return nil
			}
			data, readErr := os.ReadFile(path)
			if readErr != nil {
				return readErr
			}
			text := string(data)
			for _, token := range check.forbidden {
				if strings.Contains(text, token) {
					t.Fatalf("migrated Go numerical ownership remains in %s: %s", path, token)
				}
			}
			return nil
		})
		if err != nil {
			t.Fatal(err)
		}
	}
}
