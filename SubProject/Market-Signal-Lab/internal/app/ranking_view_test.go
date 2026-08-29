package app

import (
	"marketsignallab/internal/domain"
	"marketsignallab/internal/storage"
	"testing"
)

func rankingWindowForTest(asOf string) domain.RankingWindow {
	if asOf == "2026-07-15T00:00:00Z" {
		return domain.RankingWindow{Days: 30, PreviousStart: "2026-05-16T00:00:00Z", PreviousEnd: "2026-06-15T00:00:00Z", CurrentStart: "2026-06-15T00:00:00Z", CurrentEnd: asOf}
	}
	return domain.RankingWindow{Days: 30, PreviousStart: "2026-06-16T00:00:00Z", PreviousEnd: "2026-07-16T00:00:00Z", CurrentStart: "2026-07-16T00:00:00Z", CurrentEnd: asOf}
}

func TestCatalogRankingsSelectNewestPreferredModelAndSortTrend(t *testing.T) {
	st, err := storage.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	svc := New(st)
	for _, catalog := range []domain.CatalogNode{
		{ID: "sports", Platform: "Envato Elements", ContentType: "Presentation", Name: "Sports", CanonicalKey: "elements/sports", Level: domain.CatalogLevelCatalog},
		{ID: "fashion", Platform: "Envato Elements", ContentType: "Presentation", Name: "Fashion", CanonicalKey: "elements/fashion", Level: domain.CatalogLevelCatalog},
	} {
		if err := st.SaveCatalogNode(catalog); err != nil {
			t.Fatal(err)
		}
	}
	rows := []domain.CatalogSnapshot{
		{ID: "old-fashion", CatalogID: "fashion", Window: rankingWindowForTest("2026-07-15T00:00:00Z"), TrendScore: 99, OpportunityScore: 90, Confidence: 90, ModelVersion: "catalog-snapshot-v0.1"},
		{ID: "sports-v1", CatalogID: "sports", Window: rankingWindowForTest("2026-08-15T00:00:00Z"), TrendScore: 70, OpportunityScore: 80, Confidence: 90, ModelVersion: "catalog-snapshot-v0.1"},
		{ID: "fashion-v1", CatalogID: "fashion", Window: rankingWindowForTest("2026-08-15T00:00:00Z"), TrendScore: 80, OpportunityScore: 70, Confidence: 90, ModelVersion: "catalog-snapshot-v0.1"},
		{ID: "sports-v2", CatalogID: "sports", Window: rankingWindowForTest("2026-08-15T00:00:00Z"), TrendScore: 100, OpportunityScore: 100, Confidence: 100, ModelVersion: "catalog-snapshot-v0.2"},
	}
	for _, row := range rows {
		if err := st.AppendCatalogSnapshot(row); err != nil {
			t.Fatal(err)
		}
	}

	got, err := svc.CatalogRankings(domain.CatalogSnapshotFilter{WindowDays: 30})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].Catalog.ID != "sports" || got[0].Rank != 1 {
		t.Fatalf("rankings=%+v", got)
	}
	if got[0].Snapshot.ModelVersion != "catalog-snapshot-v0.2" || got[0].Snapshot.Window.CurrentEnd != "2026-08-15T00:00:00Z" {
		t.Fatalf("selection=%+v", got[0])
	}
}

func TestProductRankingsJoinMetadataFreshnessAndAuthorAndSortExposure(t *testing.T) {
	st, err := storage.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	svc := New(st)
	if err := st.SaveCatalogNode(domain.CatalogNode{ID: "sports", Platform: "Envato Elements", ContentType: "Presentation", Name: "Sports", CanonicalKey: "elements/sports", Level: domain.CatalogLevelCatalog}); err != nil {
		t.Fatal(err)
	}
	for _, product := range []domain.ProductEntity{
		{ID: "p1", SourceType: "manual_research", ExternalItemID: "p1", CanonicalCatalogID: "sports"},
		{ID: "p2", SourceType: "manual_research", ExternalItemID: "p2", CanonicalCatalogID: "sports"},
	} {
		if _, err := st.UpsertProduct(product); err != nil {
			t.Fatal(err)
		}
	}
	author, err := st.UpsertAuthor(domain.AuthorEntity{ID: "author-2", SourceType: "manual_research", ExternalAuthorKey: "author-2", DisplayName: "Demo Author 2"})
	if err != nil {
		t.Fatal(err)
	}
	if err := st.SaveLiveProductMetadata(domain.LiveProductMetadata{ProductID: "p2", AuthorID: author.ID, SourceType: "manual_research", Title: "DEMO — Sports Leader", FetchedAt: "2026-08-15T00:00:00Z"}); err != nil {
		t.Fatal(err)
	}
	w := rankingWindowForTest("2026-08-15T00:00:00Z")
	for _, snapshot := range []domain.ProductSnapshot{
		{ID: "p1-v1", ProductID: "p1", CatalogID: "sports", Window: w, ExposureScore: 70, OpportunityScore: 90, RelativeStrength: 100, ModelVersion: "product-snapshot-v0.1"},
		{ID: "p2-v1", ProductID: "p2", CatalogID: "sports", Window: w, ExposureScore: 80, OpportunityScore: 70, RelativeStrength: 50, ModelVersion: "product-snapshot-v0.1"},
	} {
		if err := st.AppendProductSnapshot(snapshot); err != nil {
			t.Fatal(err)
		}
	}
	got, err := svc.ProductRankings(domain.ProductSnapshotFilter{CatalogID: "sports", WindowDays: 30, AsOf: w.CurrentEnd})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].Product.ID != "p2" || got[0].Rank != 1 {
		t.Fatalf("rankings=%+v", got)
	}
	if got[0].Metadata == nil || got[0].MetadataFreshness != "IMPORTED SNAPSHOT" || got[0].Author == nil || got[0].Author.DisplayName != "Demo Author 2" {
		t.Fatalf("join=%+v", got[0])
	}
}
