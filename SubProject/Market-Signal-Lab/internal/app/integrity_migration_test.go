package app

import (
	"marketsignallab/internal/domain"
	"marketsignallab/internal/storage"
	"path/filepath"
	"testing"
)

func TestAlpha65MigrationExcludesSurfaceCatalogWithoutDeletingRealData(t *testing.T) {
	st, _ := storage.Open(filepath.Join(t.TempDir(), "data"))
	svc := New(st)
	surfaceNode := domain.CatalogNode{ID: "random-new", Platform: "Envato Market", ContentType: "Graphics", Name: "Random New", CanonicalKey: "envato/content_type:graphics/catalog:random-new", Level: domain.CatalogLevelCatalog, Origin: domain.CatalogOriginScanner}
	if err := st.SaveCatalogNode(surfaceNode); err != nil {
		t.Fatal(err)
	}
	query := domain.ResearchQuery{ID: "q1", CatalogScopeID: surfaceNode.ID, Purpose: "market_autopilot_surface", Filters: map[string]string{"surface": "random_new"}, CreatedAt: "2026-08-01T00:00:00Z"}
	if err := st.SaveResearchQuery(query); err != nil {
		t.Fatal(err)
	}
	product, _ := st.UpsertProduct(domain.ProductEntity{ID: "p1", SourceType: "envato_market_api", ExternalItemID: "123", CanonicalCatalogID: surfaceNode.ID, FirstSeenAt: "2026-08-01T00:00:00Z", LastSeenAt: "2026-08-01T00:00:00Z", Status: "observed"})
	if err := st.AppendProductObservation(domain.ProductObservation{ID: "o1", ProductID: product.ID, QueryID: query.ID, CatalogID: surfaceNode.ID, SurfaceType: domain.MarketSurfaceRandomNew, ObservedAt: "2026-08-01T00:00:00Z", SourceType: "envato_market_api"}); err != nil {
		t.Fatal(err)
	}
	if _, _, err := st.UpsertProductRelease(domain.ProductReleaseRecord{ID: "r1", ProductID: product.ID, ReleasedAt: "2025-03-14", Precision: domain.ReleasePrecisionDate, SourceType: "envato_market_api", SourceField: "published_at", VerifiedAt: "2026-08-01T00:00:00Z"}); err != nil {
		t.Fatal(err)
	}
	if err := st.AppendProductTrendEvent(domain.ProductTrendEvent{ID: "t1", ProductID: product.ID, RunID: "run-1", WindowDays: 30, EventType: domain.TrendEventEntered, Active: true, OccurredAt: "2026-08-01T00:00:00Z"}); err != nil {
		t.Fatal(err)
	}

	summary, err := svc.RunAlpha65IntegrityMigration("2026-08-16T00:00:00Z")
	if err != nil {
		t.Fatal(err)
	}
	if summary.ExcludedSurfaceCatalogs != 1 {
		t.Fatalf("summary=%+v", summary)
	}
	migrated, ok, _ := st.CatalogByID(surfaceNode.ID)
	if !ok || !migrated.ExcludedFromRanking || migrated.AnalyticalStatus != domain.IntegrityStatusExcluded {
		t.Fatalf("migrated=%+v", migrated)
	}
	if xs, _ := st.ProductObservations(domain.ObservationFilter{ProductID: product.ID}); len(xs) != 1 {
		t.Fatalf("observations=%+v", xs)
	}
	if _, ok, _ := st.ProductRelease(product.ID); !ok {
		t.Fatal("release removed")
	}
	if xs, _ := st.ProductTrendEvents(domain.ProductTrendEventFilter{ProductID: product.ID}); len(xs) != 1 {
		t.Fatal("trend history removed")
	}

	again, err := svc.RunAlpha65IntegrityMigration("2026-08-16T00:00:00Z")
	if err != nil || again.ExcludedSurfaceCatalogs != 0 {
		t.Fatalf("again=%+v err=%v", again, err)
	}
}

func TestAlpha65MigrationQuarantinesAmbiguousSurfaceName(t *testing.T) {
	st, _ := storage.Open(filepath.Join(t.TempDir(), "data"))
	svc := New(st)
	manual := domain.CatalogNode{ID: "culture", Platform: "Manual Research", ContentType: "Editorial", Name: "Popular Culture", CanonicalKey: "manual/content_type:editorial/catalog:popular-culture", Level: domain.CatalogLevelCatalog, Origin: domain.CatalogOriginManual}
	ambiguous := domain.CatalogNode{ID: "popular", Platform: "Envato Market", ContentType: "Graphics", Name: "Popular", CanonicalKey: "envato/content_type:graphics/catalog:popular", Level: domain.CatalogLevelCatalog}
	_ = st.SaveCatalogNode(manual)
	_ = st.SaveCatalogNode(ambiguous)
	summary, err := svc.RunAlpha65IntegrityMigration("2026-08-16T00:00:00Z")
	if err != nil {
		t.Fatal(err)
	}
	if summary.QuarantinedCatalogs != 1 {
		t.Fatalf("summary=%+v", summary)
	}
	kept, _, _ := st.CatalogByID("culture")
	if kept.ExcludedFromRanking {
		t.Fatalf("manual changed=%+v", kept)
	}
	pending, _, _ := st.CatalogByID("popular")
	if !pending.ExcludedFromRanking || pending.AnalyticalStatus != domain.IntegrityStatusNeedsReview {
		t.Fatalf("pending=%+v", pending)
	}
}
