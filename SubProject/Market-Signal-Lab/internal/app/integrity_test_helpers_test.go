package app

import (
	"fmt"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/storage"
	"path/filepath"
	"testing"
	"time"
)

func seedComparableRealRuns(t *testing.T, count int) (*Service, []domain.MarketMapRun) {
	t.Helper()
	st, err := storage.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	svc := New(st)
	base := time.Date(2026, 8, 1, 1, 0, 0, 0, time.UTC)
	content := domain.CatalogNode{ID: "content-presentation", Platform: "Envato Market", ContentType: "Presentation", Name: "Presentation", CanonicalKey: "envato-market/presentation", Level: domain.CatalogLevelContentType, FirstSeenAt: base.Format(time.RFC3339), LastSeenAt: base.AddDate(0, 0, count).Format(time.RFC3339), Origin: domain.CatalogOriginScanner, AnalyticalStatus: domain.IntegrityStatusNativeAlpha65}
	catalog := domain.CatalogNode{ID: "catalog-sports", Platform: "Envato Market", ContentType: "Presentation", ParentID: content.ID, Name: "Sports Presentation", CanonicalKey: "envato-market/presentation/sports-presentation", Level: domain.CatalogLevelCatalog, FirstSeenAt: content.FirstSeenAt, LastSeenAt: content.LastSeenAt, Origin: domain.CatalogOriginScanner, AnalyticalStatus: domain.IntegrityStatusNativeAlpha65}
	if err := st.SaveCatalogNode(content); err != nil {
		t.Fatal(err)
	}
	if err := st.SaveCatalogNode(catalog); err != nil {
		t.Fatal(err)
	}
	author, err := st.UpsertAuthor(domain.AuthorEntity{ID: "author-real", SourceType: "envato_market_api", ExternalAuthorKey: "real-studio", DisplayName: "Real Studio", FirstSeenAt: content.FirstSeenAt, LastSeenAt: content.LastSeenAt})
	if err != nil {
		t.Fatal(err)
	}
	runs := make([]domain.MarketMapRun, 0, count)
	for i := 0; i < count; i++ {
		at := base.AddDate(0, 0, i*3)
		runID := fmt.Sprintf("run-%02d", i+1)
		planID := fmt.Sprintf("plan-%02d", i+1)
		targetID := fmt.Sprintf("target-%02d", i+1)
		plan := domain.MarketMapPlan{ID: planID, CreatedAt: at.Add(-time.Minute).Format(time.RFC3339), Mode: domain.MarketMapModeStandard, ScanMode: domain.MarketMapModeStandard, PlannerVersion: "market-map-planner-v0.2", CompatibilityKey: "alpha65-compatible", ScopeLabel: "Observed Envato Market", Sites: []string{"graphicriver.net"}, RequestBudget: 10, Targets: []domain.MarketMapSurfaceTarget{{ID: targetID, Site: "graphicriver.net", Surface: domain.MarketSurfacePopular, ContentType: "Presentation", Category: "presentation-templates", RequestAllowance: 1, StratumKey: "graphicriver.net|presentation|sports|popular", TargetSample: 1, HighPriority: true, CatalogLevelKey: catalog.CanonicalKey}}, SamplingSchemaVersion: "sampling-schema-v0.1", TaxonomyVersion: "taxonomy-segmentation-v0.1", IndexWeightingVersion: "index-weighting-v0.1"}
		if err := st.SaveMarketMapPlan(plan); err != nil {
			t.Fatal(err)
		}
		run := domain.MarketMapRun{ID: runID, PlanID: planID, Mode: domain.MarketMapModeStandard, CompatibilityKey: plan.CompatibilityKey, SamplingSchemaVersion: plan.SamplingSchemaVersion, TaxonomyVersion: plan.TaxonomyVersion, IndexWeightingVersion: plan.IndexWeightingVersion, StartedAt: at.Add(-time.Minute).Format(time.RFC3339), CompletedAt: at.Format(time.RFC3339), Status: domain.MarketMapRunCompleted, RequestsUsed: 1, TargetsPlanned: 1, TargetsCompleted: 1, ObservationsCollected: 1, ProductsObserved: 1, AuthorsObserved: 1, Coverage: 100, Confidence: 90, IntegrityStatus: domain.IntegrityStatusNativeAlpha65}
		if err := st.AppendMarketMapRun(run); err != nil {
			t.Fatal(err)
		}
		product, err := st.UpsertProduct(domain.ProductEntity{ID: "product-real", SourceType: "envato_market_api", ExternalItemID: "12345678", CanonicalCatalogID: catalog.ID, FirstSeenAt: base.Format(time.RFC3339), LastSeenAt: at.Format(time.RFC3339), Status: "observed"})
		if err != nil {
			t.Fatal(err)
		}
		if err := st.SaveLiveProductMetadata(domain.LiveProductMetadata{ProductID: product.ID, AuthorID: author.ID, SourceType: "envato_market_api", Title: "Sports Sponsorship Presentation", AuthorDisplayName: author.DisplayName, SourceURL: "https://graphicriver.net/item/sports-sponsorship-presentation/12345678", CategoryText: "Presentation Templates", FetchedAt: at.Format(time.RFC3339), ExpiresAt: at.Add(6 * time.Hour).Format(time.RFC3339)}); err != nil {
			t.Fatal(err)
		}
		queryID := fmt.Sprintf("query-%02d", i+1)
		sessionID := fmt.Sprintf("session-%02d", i+1)
		if err := st.SaveResearchQuery(domain.ResearchQuery{ID: queryID, Name: "Sports Presentation", Platform: "Envato Market", SourceType: "envato_market_api", QueryText: "sports presentation", CatalogScopeID: catalog.ID, Purpose: "market_map", CreatedAt: at.Add(-time.Minute).Format(time.RFC3339), Enabled: true}); err != nil {
			t.Fatal(err)
		}
		if err := st.AppendResearchSession(domain.ResearchSession{ID: sessionID, StartedAt: at.Add(-time.Minute).Format(time.RFC3339), CompletedAt: at.Format(time.RFC3339), SourceType: "envato_market_api", Scope: catalog.ID, RequestBudget: 1, RequestsUsed: 1, QueryIDs: []string{queryID}, CompletedQueryIDs: []string{queryID}, QueriesPlanned: 1, QueriesCompleted: 1, Status: domain.ResearchSessionCompleted, CoverageEstimate: 100, PagesPlanned: 1, PagesCompleted: 1, ObservationsCollected: 1, ProductsObserved: 1, AuthorsObserved: 1, LastProgressAt: at.Format(time.RFC3339), ScannerVersion: "market-autopilot-v0.2", MarketMapRunID: runID}); err != nil {
			t.Fatal(err)
		}
		obsID := fmt.Sprintf("obs-%02d", i+1)
		position := 10 - i
		if position < 1 {
			position = 1
		}
		if err := st.AppendProductObservation(domain.ProductObservation{ID: obsID, SessionID: sessionID, ProductID: product.ID, AuthorID: author.ID, QueryID: queryID, CatalogID: catalog.ID, SurfaceType: domain.MarketSurfacePopular, Position: position, Page: 1, ObservedAt: at.Format(time.RFC3339), SourceType: "envato_market_api", ObservationReliability: 95, MarketMapRunID: runID}); err != nil {
			t.Fatal(err)
		}
		if err := st.AppendMarketSurfaceObservation(domain.MarketSurfaceObservation{ID: "surface-" + runID, RunID: runID, TargetID: targetID, Site: "graphicriver.net", Surface: domain.MarketSurfacePopular, Category: "presentation-templates", ExternalItemID: product.ExternalItemID, ProductID: product.ID, AuthorID: author.ID, Position: position, ObservedAt: at.Format(time.RFC3339), Reliability: 95}); err != nil {
			t.Fatal(err)
		}
		if err := st.AppendObservationSegmentation(domain.ObservationSegmentation{ID: "seg-" + runID, ObservationID: obsID, RunID: runID, ProductID: product.ID, Site: "graphicriver.net", ContentType: "Presentation", CatalogID: catalog.ID, ProductType: "presentation", UseCase: "sponsorship", Topic: "sports", Confidence: 95, Status: domain.IntegrityStatusNativeAlpha65, ReasonCodes: []string{"category_mapping"}, TaxonomyVersion: "taxonomy-segmentation-v0.1", GeneratedAt: at.Format(time.RFC3339)}); err != nil {
			t.Fatal(err)
		}
		if err := st.AppendMarketMapTargetResult(domain.MarketMapTargetResult{ID: "target-result-" + runID, RunID: runID, TargetID: targetID, StratumKey: plan.Targets[0].StratumKey, Status: domain.MarketMapTargetCompleted, RequestsUsed: 1, ObservedItems: 1, UniqueProducts: 1, CompletedAt: at.Format(time.RFC3339)}); err != nil {
			t.Fatal(err)
		}
		runs = append(runs, run)
	}
	return svc, runs
}
