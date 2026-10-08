package app

import (
	"marketsignallab/internal/domain"
	"marketsignallab/internal/storage"
	"testing"
	"time"
)

func explorerFixture(t *testing.T) (*Service, rankingFixtureIDs) {
	t.Helper()
	st, err := storage.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	svc := New(st)
	svc.analyticsRuntime = rankingParityRuntime(t)
	svc.analyticsEngine = svc.analyticsRuntime.Engine()
	ids := seedRankingUniverse(t, svc)

	authors := []domain.AuthorEntity{
		{ID: "sa1", SourceType: "manual_research", ExternalAuthorKey: "sa1", DisplayName: "Sports Alpha", FirstSeenAt: "2026-06-01T00:00:00Z", LastSeenAt: "2026-08-15T00:00:00Z"},
		{ID: "sa2", SourceType: "manual_research", ExternalAuthorKey: "sa2", DisplayName: "Sports Beta", FirstSeenAt: "2026-06-01T00:00:00Z", LastSeenAt: "2026-08-15T00:00:00Z"},
		{ID: "sa3", SourceType: "manual_research", ExternalAuthorKey: "sa3", DisplayName: "Sports Gamma", FirstSeenAt: "2026-08-01T00:00:00Z", LastSeenAt: "2026-08-15T00:00:00Z"},
		{ID: "fa1-author", SourceType: "manual_research", ExternalAuthorKey: "fa1-author", DisplayName: "Fashion Alpha", FirstSeenAt: "2026-06-01T00:00:00Z", LastSeenAt: "2026-08-15T00:00:00Z"},
		{ID: "fa2-author", SourceType: "manual_research", ExternalAuthorKey: "fa2-author", DisplayName: "Fashion Beta", FirstSeenAt: "2026-08-01T00:00:00Z", LastSeenAt: "2026-08-15T00:00:00Z"},
	}
	for _, a := range authors {
		if _, err := svc.universe.UpsertAuthor(a); err != nil {
			t.Fatal(err)
		}
	}
	meta := []domain.LiveProductMetadata{
		{ProductID: "sp1", AuthorID: "sa1", SourceType: "manual_research", Title: "Padel Sponsorship Deck", AuthorDisplayName: "Sports Alpha", CategoryText: "Sports Presentation", FetchedAt: "2026-08-15T00:00:00Z", ExpiresAt: "2026-09-15T00:00:00Z"},
		{ProductID: "sp2", AuthorID: "sa2", SourceType: "manual_research", Title: "Sports Club Proposal", AuthorDisplayName: "Sports Beta", CategoryText: "Sports Presentation", FetchedAt: "2026-08-15T00:00:00Z", ExpiresAt: "2026-09-15T00:00:00Z"},
		{ProductID: "sp3", AuthorID: "sa3", SourceType: "manual_research", Title: "Athlete Media Kit", AuthorDisplayName: "Sports Gamma", CategoryText: "Sports Presentation", FetchedAt: "2026-08-15T00:00:00Z", ExpiresAt: "2026-09-15T00:00:00Z"},
		{ProductID: "fa1", AuthorID: "fa1-author", SourceType: "manual_research", Title: "Fashion Collection Dossier", AuthorDisplayName: "Fashion Alpha", CategoryText: "Fashion Editorial", FetchedAt: "2026-08-15T00:00:00Z", ExpiresAt: "2026-09-15T00:00:00Z"},
		{ProductID: "fa2", AuthorID: "fa2-author", SourceType: "manual_research", Title: "Runway Editorial Presentation", AuthorDisplayName: "Fashion Beta", CategoryText: "Fashion Editorial", FetchedAt: "2026-08-15T00:00:00Z", ExpiresAt: "2026-09-15T00:00:00Z"},
	}
	for _, m := range meta {
		if err := svc.universe.SaveLiveProductMetadata(m); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := svc.BuildRankings(domain.RankingBuildRequest{AsOf: "2026-08-15T00:00:00Z", WindowDays: 30, CatalogScopeID: ids.ContentTypeID}); err != nil {
		t.Fatal(err)
	}
	return svc, ids
}

func f64(v float64) *float64 { return &v }

func TestExploreCatalogsFiltersSortsAndPaginates(t *testing.T) {
	svc, ids := explorerFixture(t)
	got, err := svc.ExploreCatalogs(domain.CatalogExplorerFilter{
		ParentID: ids.ContentTypeID, Text: "sport", Direction: domain.DirectionRising,
		MinTrend: f64(1), WindowDays: 30, SortBy: "trend", Desc: true, Limit: 1,
	})
	if err != nil {
		t.Fatal(err)
	}
	if got.Total != 1 || len(got.Items) != 1 || got.Items[0].Catalog.ID != ids.SportsID {
		t.Fatalf("got=%+v", got)
	}
	if got.Items[0].Snapshot == nil || got.Items[0].Snapshot.TrendScore <= 0 {
		t.Fatalf("snapshot=%+v", got.Items[0].Snapshot)
	}
}

func TestExploreProductsFiltersByCatalogTextAuthorAndScores(t *testing.T) {
	svc, ids := explorerFixture(t)
	got, err := svc.ExploreProducts(domain.ProductExplorerFilter{
		CatalogID: ids.SportsID, Text: "padel", AuthorID: "sa1", WindowDays: 30,
		MinOpportunity: f64(1), MinObservations: 2, SortBy: "opportunity", Desc: true, Limit: 20,
	})
	if err != nil {
		t.Fatal(err)
	}
	if got.Total != 1 || got.Items[0].Product.ID != "sp1" {
		t.Fatalf("got=%+v", got)
	}
	if got.Items[0].Metadata == nil || got.Items[0].Author == nil || got.Items[0].Snapshot == nil {
		t.Fatalf("join=%+v", got.Items[0])
	}
}

func TestExploreAuthorsAndSessions(t *testing.T) {
	svc, ids := explorerFixture(t)
	authors, err := svc.ExploreAuthors(domain.AuthorExplorerFilter{CatalogID: ids.SportsID, Text: "sports", MinObservedProducts: 1, SortBy: "observations", Desc: true, Limit: 20})
	if err != nil {
		t.Fatal(err)
	}
	if authors.Total != 3 {
		t.Fatalf("authors=%+v", authors)
	}
	sessions, err := svc.ExploreSessions(domain.SessionExplorerFilter{CatalogID: ids.SportsID, Status: domain.ResearchSessionCompleted, StartedFrom: "2026-07-01T00:00:00Z", MinCoverage: f64(90), SortBy: "started", Desc: true, Limit: 20})
	if err != nil {
		t.Fatal(err)
	}
	if sessions.Total != 1 || sessions.Items[0].Session.ID != "sports-now" {
		t.Fatalf("sessions=%+v", sessions)
	}
}

func TestSavedViewsWatchlistAndCompare(t *testing.T) {
	svc, ids := explorerFixture(t)
	view, err := svc.SaveView(domain.SavedView{Name: "Rising presentations", Target: domain.ExplorerTargetCatalogs, Filters: map[string]string{"parentId": ids.ContentTypeID, "direction": "rising"}})
	if err != nil {
		t.Fatal(err)
	}
	if view.ID == "" || view.Filters["direction"] != "rising" {
		t.Fatalf("view=%+v", view)
	}
	views, err := svc.SavedViews()
	if err != nil || len(views) != 1 {
		t.Fatalf("views=%+v err=%v", views, err)
	}

	entry, err := svc.AddWatchlist(domain.WatchlistEntry{EntityType: domain.WatchEntityCatalog, EntityID: ids.SportsID, Notes: "Monitor weekly"})
	if err != nil {
		t.Fatal(err)
	}
	rows, err := svc.Watchlist(30)
	if err != nil || len(rows) != 1 || rows[0].Entry.ID != entry.ID || rows[0].CatalogSnapshot == nil {
		t.Fatalf("watchlist=%+v err=%v", rows, err)
	}
	if _, err := svc.AddWatchlist(domain.WatchlistEntry{EntityType: domain.WatchEntityCatalog, EntityID: ids.SportsID}); err == nil {
		t.Fatal("expected duplicate watchlist error")
	}

	catalogs, err := svc.CompareCatalogs([]string{ids.SportsID, ids.FashionID}, 30)
	if err != nil || len(catalogs) != 2 {
		t.Fatalf("catalog compare=%+v err=%v", catalogs, err)
	}
	products, err := svc.CompareProducts([]string{"sp1", "fa1"}, 30)
	if err != nil || len(products) != 2 {
		t.Fatalf("product compare=%+v err=%v", products, err)
	}

	if err := svc.DeleteSavedView(view.ID); err != nil {
		t.Fatal(err)
	}
	if err := svc.DeleteWatchlist(entry.ID); err != nil {
		t.Fatal(err)
	}
	views, _ = svc.SavedViews()
	rows, _ = svc.Watchlist(30)
	if len(views) != 0 || len(rows) != 0 {
		t.Fatalf("deleted views=%d watchlist=%d", len(views), len(rows))
	}
}

func TestExplorerRejectsInvalidLimitsAndCompareCounts(t *testing.T) {
	svc, _ := explorerFixture(t)
	if _, err := svc.ExploreCatalogs(domain.CatalogExplorerFilter{Limit: 201}); err == nil {
		t.Fatal("expected limit error")
	}
	if _, err := svc.CompareCatalogs([]string{"sports"}, 30); err == nil {
		t.Fatal("expected compare count error")
	}
	if _, err := svc.CompareProducts([]string{"sp1", "sp1"}, 30); err == nil {
		t.Fatal("expected unique IDs error")
	}
	if _, err := svc.SaveView(domain.SavedView{Name: "x", Target: "invalid"}); err == nil {
		t.Fatal("expected target error")
	}
	if _, err := svc.AddWatchlist(domain.WatchlistEntry{EntityType: domain.WatchEntityProduct, EntityID: "missing"}); err == nil {
		t.Fatal("expected missing entity")
	}
}

func TestExplorerSessionDateValidation(t *testing.T) {
	svc, _ := explorerFixture(t)
	if _, err := svc.ExploreSessions(domain.SessionExplorerFilter{StartedFrom: "not-a-date"}); err == nil {
		t.Fatal("expected date error")
	}
	_ = time.Now()
}
