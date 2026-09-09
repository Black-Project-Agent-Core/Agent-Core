package app

import (
	"path/filepath"
	"testing"

	"marketsignallab/internal/domain"
	"marketsignallab/internal/storage"
)

func sourceLinkTestService(t *testing.T) (*Service, *storage.Store) {
	t.Helper()
	st, err := storage.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	return New(st), st
}

func addSourceLinkProduct(t *testing.T, st *storage.Store, id, externalID, title, author, rawURL string) {
	t.Helper()
	if _, err := st.UpsertProduct(domain.ProductEntity{ID: id, SourceType: "envato_market_api", ExternalItemID: externalID, CanonicalCatalogID: "catalog-1", FirstSeenAt: "2026-08-16T00:00:00Z", LastSeenAt: "2026-08-16T00:00:00Z", Status: "observed"}); err != nil {
		t.Fatal(err)
	}
	if err := st.SaveLiveProductMetadata(domain.LiveProductMetadata{ProductID: id, SourceType: "envato_market_api", Title: title, AuthorDisplayName: author, SourceURL: rawURL, FetchedAt: "2026-08-16T00:00:00Z"}); err != nil {
		t.Fatal(err)
	}
}

func TestProductDirectionSourceProductsResolvesDeduplicatesSortsAndSanitizes(t *testing.T) {
	svc, st := sourceLinkTestService(t)
	addSourceLinkProduct(t, st, "p1", "101", "Zulu Product", "Author Z", "https://graphicriver.net/item/zulu-product/101?ref=test")
	addSourceLinkProduct(t, st, "p2", "102", "Alpha Product", "Author A", "https://themeforest.net/item/alpha-product/102")
	addSourceLinkProduct(t, st, "p3", "103", "Unsafe Product", "Author U", "https://example.com/item/unsafe/103")
	if err := st.AppendProductSnapshot(domain.ProductSnapshot{ID: "s1", ProductID: "p1", CatalogID: "catalog-1", Window: domain.RankingWindow{Days: 30, CurrentEnd: "2026-08-16T00:00:00Z"}, ExposureScore: 81.2, OpportunityScore: 73.4, FreshnessScore: 90, Confidence: 77, Direction: domain.DirectionRising, ModelVersion: "product-snapshot-v0.1"}); err != nil {
		t.Fatal(err)
	}
	if _, _, err := st.UpsertProductRelease(domain.ProductReleaseRecord{ProductID: "p1", ReleasedAt: "2025-03-14", Precision: domain.ReleasePrecisionDate, SourceType: "envato_market_api", SourceField: "published_date", VerifiedAt: "2026-08-16T00:00:00Z"}); err != nil {
		t.Fatal(err)
	}
	if err := st.AppendProductTrendEvent(domain.ProductTrendEvent{ID: "trend-p1", ProductID: "p1", RunID: "run-1", WindowDays: 30, EventType: domain.TrendEventEntered, Active: true, OccurredAt: "2026-08-16T00:00:00Z"}); err != nil {
		t.Fatal(err)
	}
	if err := st.AppendProductDirectionCluster(domain.ProductDirectionCluster{ID: "direction-1", RunID: "run-1", Label: "Direction", EvidenceProductIDs: []string{"p1", "p2", "p1", "missing", "p3"}, ProductCount: 4}); err != nil {
		t.Fatal(err)
	}

	got, err := svc.ProductDirectionSourceProducts("direction-1")
	if err != nil {
		t.Fatal(err)
	}
	if got.DirectionID != "direction-1" || got.Label != "Direction" || got.ProductCount != 3 || got.AvailableCount != 2 {
		t.Fatalf("unexpected summary %+v", got)
	}
	if len(got.Products) != 3 || got.Products[0].Title != "Alpha Product" || got.Products[1].Title != "Unsafe Product" || got.Products[2].Title != "Zulu Product" {
		t.Fatalf("unexpected sorted products %+v", got.Products)
	}
	if got.Products[0].SourceURL != "https://themeforest.net/item/alpha-product/102" || !got.Products[0].LinkAvailable {
		t.Fatalf("valid link not resolved %+v", got.Products[0])
	}
	if got.Products[1].SourceURL != "" || got.Products[1].LinkAvailable {
		t.Fatalf("unsafe link exposed %+v", got.Products[1])
	}
	if got.Products[2].SourceURL != "https://graphicriver.net/item/zulu-product/101" || !got.Products[2].LinkAvailable || got.Products[2].ExposureScore != 81.2 || got.Products[2].OpportunityScore != 73.4 || got.Products[2].Direction != domain.DirectionRising {
		t.Fatalf("tracking URL or metrics not resolved %+v", got.Products[2])
	}
	if got.Products[2].Temporal.ReleasedAt != "2025-03-14" || got.Products[2].Temporal.LastTrendSeenAt != "2026-08-16T00:00:00Z" || len(got.Products[2].Temporal.ActiveWindows) != 1 {
		t.Fatalf("temporal product data not resolved %+v", got.Products[2].Temporal)
	}
}

func TestProductDirectionLinkSummaryDistinguishesSingleMultipleAndUnavailable(t *testing.T) {
	svc, st := sourceLinkTestService(t)
	addSourceLinkProduct(t, st, "p1", "101", "Single Product", "Author", "https://graphicriver.net/item/single-product/101")
	addSourceLinkProduct(t, st, "p2", "102", "Second Product", "Author", "https://themeforest.net/item/second-product/102")
	addSourceLinkProduct(t, st, "p3", "103", "Unavailable Product", "Author", "https://example.com/item/unavailable/103")
	for _, row := range []domain.ProductDirectionCluster{
		{ID: "single", RunID: "run-1", Label: "Single", EvidenceProductIDs: []string{"p1"}, ProductCount: 1},
		{ID: "multiple", RunID: "run-1", Label: "Multiple", EvidenceProductIDs: []string{"p1", "p2"}, ProductCount: 2},
		{ID: "unavailable", RunID: "run-1", Label: "Unavailable", EvidenceProductIDs: []string{"p3"}, ProductCount: 1},
	} {
		if err := st.AppendProductDirectionCluster(row); err != nil {
			t.Fatal(err)
		}
	}

	rows, err := svc.ProductDirectionLinkSummaries("run-1")
	if err != nil {
		t.Fatal(err)
	}
	byID := map[string]domain.ProductDirectionLinkSummary{}
	for _, row := range rows {
		byID[row.DirectionID] = row
	}
	if byID["single"].Mode != "single" || byID["single"].Representative == nil || byID["single"].Representative.SourceURL == "" {
		t.Fatalf("single summary=%+v", byID["single"])
	}
	if byID["multiple"].Mode != "multiple" || byID["multiple"].ProductCount != 2 || byID["multiple"].AvailableCount != 2 {
		t.Fatalf("multiple summary=%+v", byID["multiple"])
	}
	if byID["unavailable"].Mode != "unavailable" || byID["unavailable"].Representative != nil || byID["unavailable"].AvailableCount != 0 {
		t.Fatalf("unavailable summary=%+v", byID["unavailable"])
	}
}
