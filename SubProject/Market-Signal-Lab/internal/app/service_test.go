package app

import (
	"bytes"
	"context"
	"encoding/json"
	envatoconn "marketsignallab/internal/connectors/envato"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/storage"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func p(v float64) *float64 { return &v }

func TestAnalyzePersistsAuditableScoreAndProxyWarning(t *testing.T) {
	st, err := storage.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	svc := New(st)
	id, err := svc.CreateIdentity(domain.NewIdentity("Fashion", "Magazine Template", "Fashion Show", "Event / Editorial", "Fashion Brand"))
	if err != nil {
		t.Fatal(err)
	}
	req := AnalyzeRequest{IdentityID: id.ID, Features: domain.FeatureSet{DemandProxy: p(72), SupplyGap: p(41), MarketMomentum: p(66), CompetitiveGap: p(48), FreshnessGap: p(68), ExternalTrend: p(79), Seasonality: p(74)}, Confidence: domain.ConfidenceContext{EvidenceVolume: 100, RelevantCoverage: 100, IndependentSources: 100, HistoryDepth: 100, FeatureCompleteness: 100, CrossSourceConsistency: 100, Recency: 100, TargetPlatform: "elements", DirectElementsEvidence: false, SourceClassCount: 2, HistorySnapshots: 10}}
	got, err := svc.Analyze(req)
	if err != nil {
		t.Fatal(err)
	}
	if got.Opportunity != 61.7 {
		t.Fatalf("opportunity=%v", got.Opportunity)
	}
	if got.Confidence != 60 {
		t.Fatalf("confidence=%v", got.Confidence)
	}
	if got.Warning == "" {
		t.Fatal("expected visible proxy warning")
	}
	latest, ok, err := st.LatestAnalysis(id.ID)
	if err != nil || !ok {
		t.Fatalf("latest ok=%v err=%v", ok, err)
	}
	if latest.ID != got.ID {
		t.Fatalf("not persisted: %s vs %s", latest.ID, got.ID)
	}
}

func TestBenchmarkComparisonDoesNotChangeAnalysis(t *testing.T) {
	st, _ := storage.Open(filepath.Join(t.TempDir(), "data"))
	svc := New(st)
	id, _ := svc.CreateIdentity(domain.NewIdentity("Fashion", "Magazine Template", "Fashion Show", "Event", "Brand"))
	a := domain.Analysis{ID: "a", IdentityID: id.ID, AsOf: "2026-08-15", Opportunity: 61.7, Direction: "rising"}
	_ = st.AppendAnalysis(a)
	b, err := svc.AddBenchmark(domain.Benchmark{IdentityID: id.ID, AsOf: "2026-08-15", SourceLabel: "Envato Trends & Insights manual", Demand: p(80), Growth: p(70), Supply: p(40), Direction: "rising"})
	if err != nil {
		t.Fatal(err)
	}
	cmp, err := svc.CompareLatest(id.ID)
	if err != nil {
		t.Fatal(err)
	}
	if cmp.BenchmarkID != b.ID || cmp.DirectionAgreement != "same" {
		t.Fatalf("comparison=%+v", cmp)
	}
	latest, _, _ := st.LatestAnalysis(id.ID)
	if latest.Opportunity != 61.7 {
		t.Fatalf("analysis changed to %v", latest.Opportunity)
	}
}

func TestExportBundleContainsLocalResearch(t *testing.T) {
	st, _ := storage.Open(filepath.Join(t.TempDir(), "data"))
	svc := New(st)
	identity, err := svc.CreateIdentity(domain.NewIdentity("Fashion", "Magazine Template", "Fashion Show", "Editorial", "Fashion Brand"))
	if err != nil {
		t.Fatal(err)
	}
	analysis, err := svc.Analyze(AnalyzeRequest{
		IdentityID: identity.ID,
		Features: domain.FeatureSet{
			DemandProxy: p(72), SupplyGap: p(41), MarketMomentum: p(66), CompetitiveGap: p(48),
		},
		Confidence: domain.ConfidenceContext{EvidenceVolume: 40, RelevantCoverage: 50, FeatureCompleteness: 57},
	})
	if err != nil {
		t.Fatal(err)
	}
	b, err := svc.Export()
	if err != nil {
		t.Fatal(err)
	}
	if len(b.Identities) != 1 || len(b.Analyses) != 1 {
		t.Fatalf("export sizes ids=%d analyses=%d", len(b.Identities), len(b.Analyses))
	}
	if b.Analyses[0].IdentityID != identity.ID || b.Analyses[0].ID != analysis.ID {
		t.Fatal("export identity mismatch")
	}
}

func TestAnalyzeFromEvidenceUsesLatestNormalizedMetrics(t *testing.T) {
	st, _ := storage.Open(filepath.Join(t.TempDir(), "data"))
	svc := New(st)
	id, _ := svc.CreateIdentity(domain.NewIdentity("Fashion", "Magazine Template", "Fashion Show", "Event", "Brand"))
	vals := map[string]float64{"demand_proxy": 72, "supply_gap": 41, "market_momentum": 66, "competitive_gap": 48, "freshness_gap": 68, "external_trend": 79, "seasonality": 74}
	i := 0
	for metric, value := range vals {
		source := "manual_research"
		if i%2 == 0 {
			source = "external_csv"
		}
		_, err := svc.AddEvidence(domain.EvidenceRecord{IdentityID: id.ID, ObservedAt: time.Now().UTC().Format(time.RFC3339), SourceType: source, SourceLabel: source, Metric: metric, Value: value, Unit: "score_0_100", Reliability: "medium", Method: "test"})
		if err != nil {
			t.Fatal(err)
		}
		i++
	}
	got, err := svc.AnalyzeFromEvidence(id.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Opportunity != 61.7 {
		t.Fatalf("opportunity=%v", got.Opportunity)
	}
	if got.Confidence <= 0 || got.Confidence > 60 {
		t.Fatalf("confidence=%v", got.Confidence)
	}
	if got.Warning == "" {
		t.Fatal("expected proxy warning")
	}
}

func TestAnalyzeFromEvidenceUsesNewestMetricValue(t *testing.T) {
	st, _ := storage.Open(filepath.Join(t.TempDir(), "data"))
	svc := New(st)
	id, _ := svc.CreateIdentity(domain.NewIdentity("Fashion", "Magazine Template", "Fashion Show", "Event", "Brand"))
	now := time.Now().UTC()
	records := []domain.EvidenceRecord{
		{IdentityID: id.ID, ObservedAt: now.Add(-2 * time.Hour).Format(time.RFC3339), SourceType: "manual", SourceLabel: "old", Metric: "demand_proxy", Value: 10, Unit: "score_0_100", Reliability: "medium", Method: "test"},
		{IdentityID: id.ID, ObservedAt: now.Format(time.RFC3339), SourceType: "manual", SourceLabel: "new", Metric: "demand_proxy", Value: 90, Unit: "score_0_100", Reliability: "medium", Method: "test"},
		{IdentityID: id.ID, ObservedAt: now.Format(time.RFC3339), SourceType: "manual", SourceLabel: "x", Metric: "supply_gap", Value: 50, Unit: "score_0_100", Reliability: "medium", Method: "test"},
		{IdentityID: id.ID, ObservedAt: now.Format(time.RFC3339), SourceType: "manual", SourceLabel: "x", Metric: "market_momentum", Value: 50, Unit: "score_0_100", Reliability: "medium", Method: "test"},
		{IdentityID: id.ID, ObservedAt: now.Format(time.RFC3339), SourceType: "manual", SourceLabel: "x", Metric: "competitive_gap", Value: 50, Unit: "score_0_100", Reliability: "medium", Method: "test"},
	}
	for _, e := range records {
		if _, err := svc.AddEvidence(e); err != nil {
			t.Fatal(err)
		}
	}
	got, err := svc.AnalyzeFromEvidence(id.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Opportunity <= 60 {
		t.Fatalf("expected newer demand evidence to dominate, got %v", got.Opportunity)
	}
}

func TestImportEvidenceCSVAppendsRecords(t *testing.T) {
	st, _ := storage.Open(filepath.Join(t.TempDir(), "data"))
	svc := New(st)
	id, _ := svc.CreateIdentity(domain.NewIdentity("Fashion", "Magazine Template", "Fashion Show", "Event", "Brand"))
	csvText := "identity_id,observed_at,source_type,source_label,metric,value,unit,query,sample_size,reliability,method,notes\n" +
		id.ID + ",2026-08-15T03:00:00Z,external_csv,Trend Export,external_trend,79,score_0_100,fashion show,90,medium,manual_csv_import,note\n"
	n, err := svc.ImportEvidenceCSV(strings.NewReader(csvText))
	if err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("imported=%d", n)
	}
	xs, err := svc.Evidence(id.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(xs) != 1 || xs[0].SourceLabel != "Trend Export" {
		t.Fatalf("evidence=%+v", xs)
	}
}

func TestResearchEnvatoSearchStoresOnlyAggregateEvidence(t *testing.T) {
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer secret" {
			t.Errorf("missing bearer auth")
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		_, _ = w.Write([]byte(`{"total_hits":321,"matches":[{"id":1,"name":"not persisted"},{"id":2}]}`))
	}))
	defer api.Close()
	st, _ := storage.Open(filepath.Join(t.TempDir(), "data"))
	client := envatoconn.NewClient(envatoconn.WithBaseURL(api.URL))
	svc := newServiceWithCredentialForTest(t, st, client, &appTestEngine{name: "test-rust"}, "secret")
	id, _ := svc.CreateIdentity(domain.NewIdentity("Fashion", "Magazine Template", "Fashion Show", "Event", "Brand"))
	agg, evidence, err := svc.ResearchEnvatoSearch(context.Background(), id.ID, envatoconn.SearchRequest{Term: "fashion show", Site: "graphicriver.net", PageSize: 2})
	if err != nil {
		t.Fatal(err)
	}
	if agg.TotalHits != 321 || evidence.Value != 321 || evidence.Metric != "envato_market_search_hits" {
		t.Fatalf("agg=%+v evidence=%+v", agg, evidence)
	}
	xs, _ := svc.Evidence(id.ID)
	if len(xs) != 1 || xs[0].Query != "fashion show" || xs[0].SourceType != "envato_market_api" {
		t.Fatalf("evidence=%+v", xs)
	}
	b, _ := json.Marshal(xs)
	if strings.Contains(string(b), "not persisted") {
		t.Fatal("item payload leaked into evidence history")
	}
}

func TestResearchEnvatoTotalItemsStoresAggregateEvidence(t *testing.T) {
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer secret" {
			t.Errorf("missing bearer auth")
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		_, _ = w.Write([]byte(`{"total-items":{"total_items":"123456"}}`))
	}))
	defer api.Close()
	st, _ := storage.Open(filepath.Join(t.TempDir(), "data"))
	client := envatoconn.NewClient(envatoconn.WithBaseURL(api.URL))
	svc := newServiceWithCredentialForTest(t, st, client, &appTestEngine{name: "test-rust"}, "secret")
	id, _ := svc.CreateIdentity(domain.NewIdentity("Fashion", "Magazine Template", "Fashion Show", "Event", "Brand"))
	agg, evidence, err := svc.ResearchEnvatoTotalItems(context.Background(), id.ID)
	if err != nil {
		t.Fatal(err)
	}
	if agg.TotalItems != 123456 || evidence.Metric != "envato_market_total_items" || evidence.Value != 123456 {
		t.Fatalf("agg=%+v evidence=%+v", agg, evidence)
	}
}

func TestExportBundleIncludesEvidenceLedger(t *testing.T) {
	st, _ := storage.Open(filepath.Join(t.TempDir(), "data"))
	svc := New(st)
	id, _ := svc.CreateIdentity(domain.NewIdentity("Fashion", "Magazine Template", "Fashion Show", "Event", "Brand"))
	_, err := svc.AddEvidence(domain.EvidenceRecord{IdentityID: id.ID, ObservedAt: "2026-08-15T03:00:00Z", SourceType: "manual_research", SourceLabel: "Research", Metric: "demand_proxy", Value: 72, Unit: "score_0_100", Reliability: "medium", Method: "manual"})
	if err != nil {
		t.Fatal(err)
	}
	b, err := svc.Export()
	if err != nil {
		t.Fatal(err)
	}
	if b.Version != "0.3.0-alpha.6.5.3-preview.1" {
		t.Fatalf("version=%s", b.Version)
	}
	if len(b.Evidence) != 1 || b.Evidence[0].Metric != "demand_proxy" {
		t.Fatalf("evidence=%+v", b.Evidence)
	}
}

func TestAnalyzeFromEvidencePersistsFreshnessWarning(t *testing.T) {
	st, _ := storage.Open(filepath.Join(t.TempDir(), "data"))
	svc := New(st)
	id, _ := svc.CreateIdentity(domain.NewIdentity("Fashion", "Magazine Template", "Fashion Show", "Event", "Brand"))
	old := time.Now().UTC().Add(-96 * time.Hour).Format(time.RFC3339)
	vals := map[string]float64{"demand_proxy": 70, "supply_gap": 60, "market_momentum": 60, "competitive_gap": 60}
	for metric, value := range vals {
		_, _ = svc.AddEvidence(domain.EvidenceRecord{IdentityID: id.ID, ObservedAt: old, SourceType: "manual_research", SourceLabel: "old", Metric: metric, Value: value, Unit: "score_0_100", Reliability: "medium", Method: "manual"})
	}
	got, err := svc.AnalyzeFromEvidence(id.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(got.Warning, "older than 72 hours") {
		t.Fatalf("returned warning=%q", got.Warning)
	}
	latest, ok, err := st.LatestAnalysis(id.ID)
	if err != nil || !ok {
		t.Fatalf("latest ok=%v err=%v", ok, err)
	}
	if !strings.Contains(latest.Warning, "older than 72 hours") {
		t.Fatalf("persisted warning=%q", latest.Warning)
	}
}

func TestExportBundleContainsUniverseFoundation(t *testing.T) {
	svc, _ := newUniverseServiceForTest(t, nil)
	path, err := svc.EnsureCatalogPath(domain.CatalogPathInput{Platform: "Envato Elements", ContentType: "Presentation", Catalog: "Sports", Subcatalog: "Padel"})
	if err != nil {
		t.Fatal(err)
	}
	catalog := path[len(path)-1]
	query, err := svc.CreateResearchQuery(domain.ResearchQuery{Name: "padel", Platform: "Envato Elements", SourceType: "envato_elements_manual", QueryText: "padel presentation", CatalogScopeID: catalog.ID, Purpose: "catalog_observation", Enabled: true})
	if err != nil {
		t.Fatal(err)
	}
	session, err := svc.StartResearchSession(StartResearchSessionRequest{SourceType: "envato_elements_manual", Scope: catalog.ID, QueryIDs: []string{query.ID}, RequestBudget: 0})
	if err != nil {
		t.Fatal(err)
	}
	csvText := "session_id,query_id,catalog_id,source_type,external_item_id,title,author_external_key,author_display_name,observed_at\n" +
		session.ID + "," + query.ID + "," + catalog.ID + ",envato_elements_manual,p1,Padel Sponsorship Deck,alice,Alice Studio,2026-08-15T04:00:00Z\n"
	if _, err := svc.ImportObservedProductsCSV(strings.NewReader(csvText)); err != nil {
		t.Fatal(err)
	}

	b, err := svc.Export()
	if err != nil {
		t.Fatal(err)
	}
	if b.Version != "0.3.0-alpha.6.5.3-preview.1" {
		t.Fatalf("version=%s", b.Version)
	}
	if len(b.Catalogs) == 0 || len(b.Products) == 0 || len(b.ProductMetadata) == 0 || len(b.Authors) == 0 || len(b.ResearchQueries) == 0 || len(b.ResearchSessions) == 0 || len(b.ProductObservations) == 0 || len(b.SourcePolicies) == 0 {
		t.Fatalf("universe missing from export: catalogs=%d products=%d metadata=%d authors=%d queries=%d sessions=%d observations=%d policies=%d", len(b.Catalogs), len(b.Products), len(b.ProductMetadata), len(b.Authors), len(b.ResearchQueries), len(b.ResearchSessions), len(b.ProductObservations), len(b.SourcePolicies))
	}
}

func TestExportIncludesRankingSnapshotsAndModelRegistry(t *testing.T) {
	st, err := storage.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	svc := New(st)
	svc.analyticsRuntime = rankingParityRuntime(t)
	svc.analyticsEngine = svc.analyticsRuntime.Engine()
	fixture := seedRankingUniverse(t, svc)
	if _, err := svc.BuildRankings(domain.RankingBuildRequest{AsOf: "2026-08-15T00:00:00Z", WindowDays: 30, CatalogScopeID: fixture.ContentTypeID}); err != nil {
		t.Fatal(err)
	}

	got, err := svc.Export()
	if err != nil {
		t.Fatal(err)
	}
	if got.Version != "0.3.0-alpha.6.5.3-preview.1" {
		t.Fatalf("version=%s", got.Version)
	}
	if len(got.CatalogSnapshots) == 0 || len(got.ProductSnapshots) == 0 || len(got.RankingModels) < 5 {
		t.Fatalf("ranking export missing")
	}
	raw, _ := json.Marshal(got)
	if bytes.Contains(bytes.ToLower(raw), []byte(`"token"`)) {
		t.Fatal("export contains token field")
	}
}

func TestExportIncludesSavedViewsAndWatchlist(t *testing.T) {
	st, err := storage.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	svc := New(st)
	path, err := svc.EnsureCatalogPath(domain.CatalogPathInput{
		Platform:    "Envato Market",
		ContentType: "Graphic Templates",
		Catalog:     "Presentation Templates",
	})
	if err != nil {
		t.Fatal(err)
	}
	catalog := path[len(path)-1]
	if _, err := svc.SaveView(domain.SavedView{
		Name:   "Rising presentations",
		Target: domain.ExplorerTargetCatalogs,
		Filters: map[string]string{
			"direction": "rising",
			"minTrend":  "70",
		},
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.AddWatchlist(domain.WatchlistEntry{
		EntityType: domain.WatchEntityCatalog,
		EntityID:   catalog.ID,
		Notes:      "Review weekly",
	}); err != nil {
		t.Fatal(err)
	}

	bundle, err := svc.Export()
	if err != nil {
		t.Fatal(err)
	}
	if len(bundle.SavedViews) != 1 || bundle.SavedViews[0].Name != "Rising presentations" {
		t.Fatalf("saved views=%+v", bundle.SavedViews)
	}
	if len(bundle.Watchlist) != 1 || bundle.Watchlist[0].EntityID != catalog.ID {
		t.Fatalf("watchlist=%+v", bundle.Watchlist)
	}
}

func TestExportIncludesTemporalProductIntelligence(t *testing.T) {
	st, err := storage.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	svc := New(st)
	product, err := st.UpsertProduct(domain.ProductEntity{
		ID:                 "product-temporal-export",
		SourceType:         "envato_market_api",
		ExternalItemID:     "991122",
		CanonicalCatalogID: "catalog-temporal-export",
		FirstSeenAt:        "2026-08-16T01:00:00Z",
		LastSeenAt:         "2026-08-16T01:00:00Z",
		Status:             "observed",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := st.UpsertProductRelease(domain.ProductReleaseRecord{
		ID:          "release-temporal-export",
		ProductID:   product.ID,
		ReleasedAt:  "2025-03-14T10:20:00Z",
		Precision:   domain.ReleasePrecisionDateTime,
		SourceType:  "envato_market_api",
		SourceField: "released_at",
		VerifiedAt:  "2026-08-16T01:01:00Z",
	}); err != nil {
		t.Fatal(err)
	}
	if err := st.AppendProductTrendEvent(domain.ProductTrendEvent{
		ID:               "trend-temporal-export",
		ProductID:        product.ID,
		RunID:            "run-temporal-export",
		WindowDays:       30,
		EventType:        domain.TrendEventEntered,
		Active:           true,
		TrendScore:       78,
		OpportunityScore: 74,
		ExposureScore:    82,
		Direction:        domain.DirectionRising,
		OccurredAt:       "2026-08-16T02:00:00Z",
		ModelVersion:     "trend-lifecycle-v0.1",
	}); err != nil {
		t.Fatal(err)
	}

	bundle, err := svc.Export()
	if err != nil {
		t.Fatal(err)
	}
	if bundle.Version != "0.3.0-alpha.6.5.3-preview.1" {
		t.Fatalf("version=%s", bundle.Version)
	}
	if len(bundle.ProductReleases) != 1 || bundle.ProductReleases[0].ReleasedAt != "2025-03-14T10:20:00Z" {
		t.Fatalf("product releases=%+v", bundle.ProductReleases)
	}
	if len(bundle.ProductTrendEvents) != 1 || bundle.ProductTrendEvents[0].EventType != domain.TrendEventEntered {
		t.Fatalf("trend events=%+v", bundle.ProductTrendEvents)
	}
	if bundle.ProductReleaseConflicts == nil {
		t.Fatal("release conflicts must be exported as an empty array, not null")
	}
}

func TestExportAlpha65IncludesIntegrityAndPreservesTemporalData(t *testing.T) {
	st, err := storage.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	svc := New(st)
	_ = st.AppendMarketMapTargetResult(domain.MarketMapTargetResult{ID: "target-1", RunID: "run-1", TargetID: "t1", Status: domain.MarketMapTargetCompleted, CompletedAt: "2026-08-16T00:00:00Z"})
	_ = st.AppendObservationSegmentation(domain.ObservationSegmentation{ID: "seg-1", ObservationID: "obs-1", RunID: "run-1", ProductID: "product-1", TaxonomyVersion: "taxonomy-segmentation-v0.1", GeneratedAt: "2026-08-16T00:00:00Z"})
	_ = st.AppendSampleAudit(domain.SampleAudit{ID: "audit-1", RunID: "run-1", GeneratedAt: "2026-08-16T00:00:00Z"})
	_ = st.AppendDataQualityAssessment(domain.DataQualityAssessment{ID: "quality-1", RunID: "run-1", EntityType: "global", EntityID: "global", Score: 80, Grade: domain.DataQualityGradeB, GeneratedAt: "2026-08-16T00:00:00Z"})
	_ = st.AppendMarketIndexSnapshot(domain.MarketIndexSnapshot{ID: "index-1", RunID: "run-1", Level: domain.SegmentLevelGlobal, EntityID: "global", IntegrityStatus: domain.IntegrityStatusNativeAlpha65, GeneratedAt: "2026-08-16T00:00:00Z"})
	_ = st.AppendScoreProvenance(domain.ScoreProvenance{ID: "prov-1", RunID: "run-1", ScoreType: "composition", EntityType: "global", EntityID: "global", GeneratedAt: "2026-08-16T00:00:00Z"})
	_ = st.AppendLegacyClassificationReview(domain.LegacyClassificationReview{ID: "review-1", CatalogID: "catalog-1", Status: "open", CreatedAt: "2026-08-16T00:00:00Z"})
	_, _, _ = st.UpsertProductRelease(domain.ProductReleaseRecord{ID: "release-1", ProductID: "product-1", ReleasedAt: "2025-03-14", Precision: domain.ReleasePrecisionDate, SourceType: "envato_market_api", SourceField: "published_at", VerifiedAt: "2026-08-16T00:00:00Z"})
	if _, conflict, err := st.UpsertProductRelease(domain.ProductReleaseRecord{ID: "release-2", ProductID: "product-1", ReleasedAt: "2025-03-15", Precision: domain.ReleasePrecisionDate, SourceType: "envato_market_api", SourceField: "published_at", VerifiedAt: "2026-08-16T01:00:00Z"}); err != nil || conflict == nil {
		t.Fatalf("release conflict missing conflict=%+v err=%v", conflict, err)
	}
	_ = st.AppendProductTrendEvent(domain.ProductTrendEvent{ID: "trend-1", ProductID: "product-1", RunID: "run-1", WindowDays: 30, EventType: domain.TrendEventEntered, Active: true, OccurredAt: "2026-08-16T00:00:00Z"})
	_ = st.AppendWatchlistEntry(domain.WatchlistEntry{ID: "watch-1", EntityType: domain.WatchEntityProduct, EntityID: "product-1", CreatedAt: "2026-08-16T00:00:00Z", UpdatedAt: "2026-08-16T00:00:00Z"})
	_ = st.AppendSavedView(domain.SavedView{ID: "view-1", Name: "Rising", Target: domain.ExplorerTargetCatalogs, Filters: map[string]string{"direction": "rising"}, CreatedAt: "2026-08-16T00:00:00Z", UpdatedAt: "2026-08-16T00:00:00Z"})

	bundle, err := svc.Export()
	if err != nil {
		t.Fatal(err)
	}
	if bundle.Version != "0.3.0-alpha.6.5.3-preview.1" {
		t.Fatalf("version=%q", bundle.Version)
	}
	if len(bundle.MarketMapTargetResults) != 1 || len(bundle.ObservationSegmentations) != 1 || len(bundle.SampleAudits) != 1 || len(bundle.DataQualityAssessments) != 1 || len(bundle.MarketIndexSnapshots) != 1 || len(bundle.ScoreProvenance) != 1 || len(bundle.LegacyClassificationReviews) != 1 {
		t.Fatalf("integrity export incomplete=%+v", bundle)
	}
	if len(bundle.IntegrityModels) != 8 {
		t.Fatalf("integrity models=%d", len(bundle.IntegrityModels))
	}
	if len(bundle.ProductReleases) != 1 || len(bundle.ProductReleaseConflicts) != 1 || len(bundle.ProductTrendEvents) != 1 || len(bundle.Watchlist) != 1 || len(bundle.SavedViews) != 1 {
		t.Fatal("Alpha 6.4 data not preserved")
	}
	raw, _ := json.Marshal(bundle)
	lower := strings.ToLower(string(raw))
	for _, forbidden := range []string{`"token":`, `"authorization":`, `"rawpayload":`, `"raw_payload":`} {
		if strings.Contains(lower, forbidden) {
			t.Fatalf("forbidden %q", forbidden)
		}
	}
}
