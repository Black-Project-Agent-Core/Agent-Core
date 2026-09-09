package segmentation

import (
	"marketsignallab/internal/domain"
	"testing"
)

func TestParseMarketSurfaceAcceptsExactlySevenCanonicalValues(t *testing.T) {
	cases := map[string]domain.MarketSurface{
		"new":        domain.MarketSurfaceNew,
		"random_new": domain.MarketSurfaceRandomNew,
		"popular":    domain.MarketSurfacePopular,
		"featured":   domain.MarketSurfaceFeatured,
		"search":     domain.MarketSurfaceSearch,
		"category":   domain.MarketSurfaceCategory,
		"similar":    domain.MarketSurfaceSimilar,
	}
	for raw, want := range cases {
		got, err := ParseMarketSurface(raw)
		if err != nil || got != want {
			t.Fatalf("raw=%q got=%q err=%v", raw, got, err)
		}
	}
	for _, invalid := range []string{"new_category", "imported_snapshot", "", "homepage"} {
		if _, err := ParseMarketSurface(invalid); err == nil {
			t.Fatalf("expected invalid surface %q", invalid)
		}
	}
}

func TestReservedSurfaceCatalogAliases(t *testing.T) {
	for _, value := range []string{"Popular", "FEATURED", "Random New", "random-new", "Search", "Category", "New"} {
		if !IsReservedSurfaceCatalogName(value) {
			t.Fatalf("expected reserved alias %q", value)
		}
	}
	if IsReservedSurfaceCatalogName("Popular Culture") {
		t.Fatal("real manual catalog must remain allowed")
	}
}
