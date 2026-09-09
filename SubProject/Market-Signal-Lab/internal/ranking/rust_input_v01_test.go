package ranking

import (
	"encoding/json"
	"marketsignallab/internal/analyticsengine"
	"marketsignallab/internal/domain"
	"reflect"
	"strings"
	"testing"
	"time"
)

func rustInputTestWindow(t *testing.T) domain.RankingWindow {
	t.Helper()
	w, err := NewWindow(time.Date(2026, 8, 20, 0, 0, 0, 0, time.UTC), 30)
	if err != nil {
		t.Fatal(err)
	}
	return w
}

func TestRankingWindowBucketV01MatchesLegacyBoundaries(t *testing.T) {
	w := rustInputTestWindow(t)
	tests := []struct {
		raw  string
		want analyticsengine.RankingWindowBucket
	}{
		{w.CurrentStart, analyticsengine.RankingWindowCurrent},
		{w.CurrentEnd, analyticsengine.RankingWindowCurrent},
		{w.PreviousStart, analyticsengine.RankingWindowPrevious},
		{w.PreviousEnd, analyticsengine.RankingWindowCurrent},
		{"2020-01-01T00:00:00Z", analyticsengine.RankingWindowOutside},
	}
	for _, tt := range tests {
		got := rankingWindowBucketV01(tt.raw, w)
		if got != tt.want {
			t.Fatalf("bucket(%s)=%d want=%d", tt.raw, got, tt.want)
		}
		if (got == analyticsengine.RankingWindowCurrent) != InCurrentWindow(tt.raw, w) {
			t.Fatalf("current boundary mismatch for %s", tt.raw)
		}
		if (got == analyticsengine.RankingWindowPrevious) != InPreviousWindow(tt.raw, w) {
			t.Fatalf("previous boundary mismatch for %s", tt.raw)
		}
	}
}

func TestNormalizeProductRankingV01UsesLatestSegmentationAndDeterministicKeys(t *testing.T) {
	w := rustInputTestWindow(t)
	base := BuildInput{
		Window:         w,
		MarketMapRunID: "run-1",
		Dataset: Dataset{
			Catalogs: []domain.CatalogNode{
				{ID: "cat-a", Platform: "envato", ContentType: "graphics", Level: domain.CatalogLevelCatalog},
				{ID: "cat-b", Platform: "envato", ContentType: "graphics", Level: domain.CatalogLevelCatalog},
			},
			Products: []domain.ProductEntity{
				{ID: "p-b", CanonicalCatalogID: "cat-a", FirstSeenAt: w.CurrentStart},
				{ID: "p-a", CanonicalCatalogID: "cat-a", FirstSeenAt: w.PreviousStart},
			},
			Queries: []domain.ResearchQuery{{ID: "q-b", Enabled: true, CatalogScopeID: "cat-b"}, {ID: "q-a", Enabled: true, CatalogScopeID: "cat-a"}},
			Observations: []domain.ProductObservation{
				{ID: "o-b", ProductID: "p-b", QueryID: "q-b", CatalogID: "cat-a", SurfaceType: domain.MarketSurfaceSearch, Position: 2, ObservedAt: w.CurrentStart, ObservationReliability: .8},
				{ID: "o-a", ProductID: "p-a", QueryID: "q-a", CatalogID: "cat-a", SurfaceType: domain.MarketSurfacePopular, Position: 3, ObservedAt: w.PreviousStart, ObservationReliability: .9},
			},
			Segmentations: []domain.ObservationSegmentation{
				{ObservationID: "o-b", ProductID: "p-b", CatalogID: "cat-a", Status: domain.IntegrityStatusNativeAlpha65, GeneratedAt: "2026-08-18T00:00:00Z"},
				{ObservationID: "o-b", ProductID: "p-b", CatalogID: "cat-b", Status: domain.IntegrityStatusRecalculated, GeneratedAt: "2026-08-19T00:00:00Z"},
			},
		},
	}

	got, err := NormalizeProductRankingV01(base)
	if err != nil {
		t.Fatal(err)
	}
	if got.ResolvedCatalogByProduct["p-b"] != "cat-b" {
		t.Fatalf("latest valid segmentation did not win: %+v", got.ResolvedCatalogByProduct)
	}
	if got.ProductKeys.ByID["p-a"] != 1 || got.ProductKeys.ByID["p-b"] != 2 {
		t.Fatalf("product keys are not sorted/deterministic: %+v", got.ProductKeys.ByID)
	}
	if got.CatalogKeys.ByID["cat-a"] != 1 || got.CatalogKeys.ByID["cat-b"] != 2 {
		t.Fatalf("catalog keys are not sorted/deterministic: %+v", got.CatalogKeys.ByID)
	}

	shuffled := base
	shuffled.Dataset.Products = []domain.ProductEntity{base.Dataset.Products[1], base.Dataset.Products[0]}
	shuffled.Dataset.Queries = []domain.ResearchQuery{base.Dataset.Queries[1], base.Dataset.Queries[0]}
	shuffled.Dataset.Observations = []domain.ProductObservation{base.Dataset.Observations[1], base.Dataset.Observations[0]}
	again, err := NormalizeProductRankingV01(shuffled)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got.ProductKeys, again.ProductKeys) || !reflect.DeepEqual(got.CatalogKeys, again.CatalogKeys) || !reflect.DeepEqual(got.QueryKeys, again.QueryKeys) {
		t.Fatalf("local key assignment changed after input reorder")
	}
}

func TestNormalizedRankingDTOContainsNoSecretFields(t *testing.T) {
	w := rustInputTestWindow(t)
	input := BuildInput{Window: w, Dataset: Dataset{
		Catalogs:     []domain.CatalogNode{{ID: "cat", Platform: "envato", ContentType: "graphics", Level: domain.CatalogLevelCatalog}},
		Products:     []domain.ProductEntity{{ID: "p", CanonicalCatalogID: "cat", FirstSeenAt: w.CurrentStart}},
		Queries:      []domain.ResearchQuery{{ID: "q", Enabled: true, CatalogScopeID: "cat"}},
		Observations: []domain.ProductObservation{{ID: "o", ProductID: "p", QueryID: "q", CatalogID: "cat", SurfaceType: domain.MarketSurfaceSearch, Position: 1, ObservedAt: w.CurrentStart}},
	}}
	normalized, err := NormalizeProductRankingV01(input)
	if err != nil {
		t.Fatal(err)
	}
	blob, err := json.Marshal(normalized.ProductInput)
	if err != nil {
		t.Fatal(err)
	}
	lower := strings.ToLower(string(blob))
	for _, forbidden := range []string{"credential", "secret", "token", "apikey", "api_key", "password"} {
		if strings.Contains(lower, forbidden) {
			t.Fatalf("normalized DTO contains forbidden secret field marker %q: %s", forbidden, blob)
		}
	}
}
