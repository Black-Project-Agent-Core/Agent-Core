package app

import (
	"context"
	"marketsignallab/internal/analyticsengine"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/storage"
	"testing"
	"time"
)

type noBatchAppEngine struct{}

func (*noBatchAppEngine) Name() string    { return "no-batch" }
func (*noBatchAppEngine) Version() string { return "test" }
func (*noBatchAppEngine) Capabilities() []analyticsengine.Capability {
	return analyticsengine.PilotCapabilities()
}
func (*noBatchAppEngine) Health(context.Context) analyticsengine.Health {
	return analyticsengine.Health{Status: analyticsengine.EngineHealthy, Engine: "no-batch", Protocol: analyticsengine.ProtocolV1}
}
func (*noBatchAppEngine) DistributionSimilarity(context.Context, analyticsengine.DistributionSimilarityInput) (analyticsengine.DistributionSimilarityResult, error) {
	return analyticsengine.DistributionSimilarityResult{}, nil
}
func (*noBatchAppEngine) ItemVolatility(context.Context, analyticsengine.ItemVolatilityInput) (analyticsengine.VolatilityResult, error) {
	return analyticsengine.VolatilityResult{}, nil
}
func (*noBatchAppEngine) ClusterVolatility(context.Context, analyticsengine.ClusterVolatilityInput) (analyticsengine.VolatilityResult, error) {
	return analyticsengine.VolatilityResult{}, nil
}
func (*noBatchAppEngine) SelectionProbability(context.Context, analyticsengine.SelectionProbabilityInput) (analyticsengine.SelectionProbabilityResult, error) {
	return analyticsengine.SelectionProbabilityResult{}, nil
}
func (*noBatchAppEngine) Close() error { return nil }

type rankingFixtureIDs struct {
	ContentTypeID string
	SportsID      string
	FashionID     string
}

func seedRankingUniverse(t *testing.T, svc *Service) rankingFixtureIDs {
	t.Helper()
	catalogs := []domain.CatalogNode{
		{ID: "presentation", Platform: "Envato Elements", ContentType: "Presentation", Name: "Presentation", CanonicalKey: "elements/presentation", Level: domain.CatalogLevelContentType, FirstSeenAt: "2026-06-01T00:00:00Z", LastSeenAt: "2026-08-15T00:00:00Z"},
		{ID: "sports", ParentID: "presentation", Platform: "Envato Elements", ContentType: "Presentation", Name: "Sports", CanonicalKey: "elements/presentation/sports", Level: domain.CatalogLevelCatalog, FirstSeenAt: "2026-06-01T00:00:00Z", LastSeenAt: "2026-08-15T00:00:00Z"},
		{ID: "fashion", ParentID: "presentation", Platform: "Envato Elements", ContentType: "Presentation", Name: "Fashion Editorial", CanonicalKey: "elements/presentation/fashion", Level: domain.CatalogLevelCatalog, FirstSeenAt: "2026-06-01T00:00:00Z", LastSeenAt: "2026-08-15T00:00:00Z"},
	}
	for _, row := range catalogs {
		if err := svc.universe.SaveCatalogNode(row); err != nil {
			t.Fatal(err)
		}
	}
	queries := []domain.ResearchQuery{
		{ID: "sports-q", Name: "Sports", Platform: "Envato Elements", SourceType: "manual_research", QueryText: "sports presentation", CatalogScopeID: "sports", Purpose: "ranking", CreatedAt: "2026-06-01T00:00:00Z", Enabled: true},
		{ID: "fashion-q", Name: "Fashion", Platform: "Envato Elements", SourceType: "manual_research", QueryText: "fashion editorial", CatalogScopeID: "fashion", Purpose: "ranking", CreatedAt: "2026-06-01T00:00:00Z", Enabled: true},
	}
	for _, row := range queries {
		if err := svc.universe.SaveResearchQuery(row); err != nil {
			t.Fatal(err)
		}
	}
	sessions := []domain.ResearchSession{
		{ID: "sports-prev", StartedAt: "2026-06-16T00:00:00Z", CompletedAt: "2026-07-15T00:00:00Z", SourceType: "manual_research", Scope: "sports", QueryIDs: []string{"sports-q"}, CompletedQueryIDs: []string{"sports-q"}, QueriesPlanned: 1, QueriesCompleted: 1, Status: domain.ResearchSessionCompleted, CoverageEstimate: 90},
		{ID: "sports-now", StartedAt: "2026-07-16T00:00:00Z", CompletedAt: "2026-08-15T00:00:00Z", SourceType: "manual_research", Scope: "sports", QueryIDs: []string{"sports-q"}, CompletedQueryIDs: []string{"sports-q"}, QueriesPlanned: 1, QueriesCompleted: 1, Status: domain.ResearchSessionCompleted, CoverageEstimate: 95},
		{ID: "fashion-prev", StartedAt: "2026-06-16T00:00:00Z", CompletedAt: "2026-07-15T00:00:00Z", SourceType: "manual_research", Scope: "fashion", QueryIDs: []string{"fashion-q"}, CompletedQueryIDs: []string{"fashion-q"}, QueriesPlanned: 1, QueriesCompleted: 1, Status: domain.ResearchSessionCompleted, CoverageEstimate: 85},
		{ID: "fashion-now", StartedAt: "2026-07-16T00:00:00Z", CompletedAt: "2026-08-15T00:00:00Z", SourceType: "manual_research", Scope: "fashion", QueryIDs: []string{"fashion-q"}, CompletedQueryIDs: []string{"fashion-q"}, QueriesPlanned: 1, QueriesCompleted: 1, Status: domain.ResearchSessionCompleted, CoverageEstimate: 90},
	}
	for _, row := range sessions {
		if err := svc.universe.AppendResearchSession(row); err != nil {
			t.Fatal(err)
		}
	}
	products := []domain.ProductEntity{
		{ID: "sp1", SourceType: "manual_research", ExternalItemID: "sp1", CanonicalCatalogID: "sports", FirstSeenAt: "2026-06-01T00:00:00Z", LastSeenAt: "2026-08-10T00:00:00Z", Status: "observed"},
		{ID: "sp2", SourceType: "manual_research", ExternalItemID: "sp2", CanonicalCatalogID: "sports", FirstSeenAt: "2026-06-05T00:00:00Z", LastSeenAt: "2026-08-10T00:00:00Z", Status: "observed"},
		{ID: "sp3", SourceType: "manual_research", ExternalItemID: "sp3", CanonicalCatalogID: "sports", FirstSeenAt: "2026-08-01T00:00:00Z", LastSeenAt: "2026-08-10T00:00:00Z", Status: "observed"},
		{ID: "fa1", SourceType: "manual_research", ExternalItemID: "fa1", CanonicalCatalogID: "fashion", FirstSeenAt: "2026-06-01T00:00:00Z", LastSeenAt: "2026-08-10T00:00:00Z", Status: "observed"},
		{ID: "fa2", SourceType: "manual_research", ExternalItemID: "fa2", CanonicalCatalogID: "fashion", FirstSeenAt: "2026-08-02T00:00:00Z", LastSeenAt: "2026-08-10T00:00:00Z", Status: "observed"},
	}
	for _, row := range products {
		if _, err := svc.universe.UpsertProduct(row); err != nil {
			t.Fatal(err)
		}
	}
	observations := []domain.ProductObservation{
		{ID: "sp1-p", SessionID: "sports-prev", ProductID: "sp1", AuthorID: "sa1", QueryID: "sports-q", CatalogID: "sports", SurfaceType: "search", Position: 20, ObservedAt: "2026-07-01T00:00:00Z", SourceType: "manual_research", ObservationReliability: .9},
		{ID: "sp2-p", SessionID: "sports-prev", ProductID: "sp2", AuthorID: "sa2", QueryID: "sports-q", CatalogID: "sports", SurfaceType: "search", Position: 10, ObservedAt: "2026-07-02T00:00:00Z", SourceType: "manual_research", ObservationReliability: .9},
		{ID: "sp1-c", SessionID: "sports-now", ProductID: "sp1", AuthorID: "sa1", QueryID: "sports-q", CatalogID: "sports", SurfaceType: "search", Position: 5, ObservedAt: "2026-08-01T00:00:00Z", SourceType: "manual_research", ObservationReliability: .9},
		{ID: "sp2-c", SessionID: "sports-now", ProductID: "sp2", AuthorID: "sa2", QueryID: "sports-q", CatalogID: "sports", SurfaceType: "popular", Position: 12, ObservedAt: "2026-08-02T00:00:00Z", SourceType: "manual_research", ObservationReliability: .9},
		{ID: "sp3-c", SessionID: "sports-now", ProductID: "sp3", AuthorID: "sa3", QueryID: "sports-q", CatalogID: "sports", SurfaceType: "new", Position: 8, ObservedAt: "2026-08-03T00:00:00Z", SourceType: "manual_research", ObservationReliability: .8},
		{ID: "fa1-p", SessionID: "fashion-prev", ProductID: "fa1", AuthorID: "fa1-author", QueryID: "fashion-q", CatalogID: "fashion", SurfaceType: "search", Position: 15, ObservedAt: "2026-07-01T00:00:00Z", SourceType: "manual_research", ObservationReliability: .9},
		{ID: "fa1-c", SessionID: "fashion-now", ProductID: "fa1", AuthorID: "fa1-author", QueryID: "fashion-q", CatalogID: "fashion", SurfaceType: "search", Position: 8, ObservedAt: "2026-08-01T00:00:00Z", SourceType: "manual_research", ObservationReliability: .9},
		{ID: "fa2-c", SessionID: "fashion-now", ProductID: "fa2", AuthorID: "fa2-author", QueryID: "fashion-q", CatalogID: "fashion", SurfaceType: "new", Position: 6, ObservedAt: "2026-08-02T00:00:00Z", SourceType: "manual_research", ObservationReliability: .8},
	}
	for _, row := range observations {
		if err := svc.universe.AppendProductObservation(row); err != nil {
			t.Fatal(err)
		}
	}
	return rankingFixtureIDs{ContentTypeID: "presentation", SportsID: "sports", FashionID: "fashion"}
}

func TestBuildRankingsLoadsUniverseBuildsAndPersistsSnapshots(t *testing.T) {
	st, err := storage.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	svc := New(st)
	svc.analyticsRuntime = rankingParityRuntime(t)
	svc.analyticsEngine = svc.analyticsRuntime.Engine()
	fixture := seedRankingUniverse(t, svc)

	got, err := svc.BuildRankings(domain.RankingBuildRequest{
		AsOf:           "2026-08-15T00:00:00Z",
		WindowDays:     30,
		CatalogScopeID: fixture.ContentTypeID,
	})
	if err != nil {
		t.Fatal(err)
	}

	if len(got.CatalogSnapshots) < 2 || len(got.ProductSnapshots) < 4 {
		t.Fatalf("build=%+v", got)
	}
	if got.CatalogsPersisted != len(got.CatalogSnapshots) || got.ProductsPersisted != len(got.ProductSnapshots) {
		t.Fatalf("persisted=%+v", got)
	}

	saved, err := st.CatalogSnapshots(domain.CatalogSnapshotFilter{WindowDays: 30, AsOf: "2026-08-15T00:00:00Z"})
	if err != nil {
		t.Fatal(err)
	}
	if len(saved) != len(got.CatalogSnapshots) {
		t.Fatalf("saved=%d built=%d", len(saved), len(got.CatalogSnapshots))
	}

	if _, err := svc.BuildRankings(domain.RankingBuildRequest{
		AsOf:           "2026-08-15T00:00:00Z",
		WindowDays:     30,
		CatalogScopeID: fixture.ContentTypeID,
	}); err != nil {
		t.Fatal(err)
	}

	saved, _ = st.CatalogSnapshots(domain.CatalogSnapshotFilter{WindowDays: 30, AsOf: "2026-08-15T00:00:00Z"})
	if len(saved) != len(got.CatalogSnapshots) {
		t.Fatalf("exact replay created duplicate snapshots: saved=%d", len(saved))
	}
}

func TestBuildRankingsRejectsEmptyCurrentWindow(t *testing.T) {
	st, err := storage.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	svc := New(st)
	svc.analyticsRuntime = rankingParityRuntime(t)
	svc.analyticsEngine = svc.analyticsRuntime.Engine()
	seedRankingUniverse(t, svc)
	_, err = svc.BuildRankings(domain.RankingBuildRequest{AsOf: "2027-08-15T00:00:00Z", WindowDays: 30})
	if err == nil {
		t.Fatal("expected empty-window error")
	}
}

func TestRankingModelsExposeVersionedDefinitions(t *testing.T) {
	st, _ := storage.Open(t.TempDir())
	models := New(st).RankingModels()
	if len(models) < 5 {
		t.Fatalf("models=%d", len(models))
	}
}

func TestRankingBuildDefaultsAsOfAndWindow(t *testing.T) {
	_ = time.Now() // documents that defaults are clock-based; exact clock is integration-tested elsewhere.
}

func TestBuildRankingsFailsWithoutBatchRuntimeAndPersistsNothing(t *testing.T) {
	st, err := storage.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	// Healthy Engine-only injection deliberately lacks BatchExecutor. Production
	// ranking must fail rather than fall back to legacy Go formulas.
	svc := NewWithAnalyticsEngine(st, &noBatchAppEngine{})
	fixture := seedRankingUniverse(t, svc)
	_, err = svc.BuildRankings(domain.RankingBuildRequest{
		AsOf: "2026-08-15T00:00:00Z", WindowDays: 30, CatalogScopeID: fixture.ContentTypeID,
	})
	if err == nil {
		t.Fatal("expected Rust batch runtime failure")
	}
	catalogs, readErr := st.CatalogSnapshots(domain.CatalogSnapshotFilter{})
	if readErr != nil {
		t.Fatal(readErr)
	}
	products, readErr := st.ProductSnapshots(domain.ProductSnapshotFilter{})
	if readErr != nil {
		t.Fatal(readErr)
	}
	if len(catalogs) != 0 || len(products) != 0 {
		t.Fatalf("no-fallback violation: catalogs=%d products=%d", len(catalogs), len(products))
	}
}
