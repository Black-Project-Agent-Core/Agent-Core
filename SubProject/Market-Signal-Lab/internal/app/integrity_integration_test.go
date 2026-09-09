package app

import (
	"context"
	envatoconn "marketsignallab/internal/connectors/envato"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/segmentation"
	"marketsignallab/internal/storage"
	"path/filepath"
	"testing"
)

func TestRunMarketAutopilotPublishesAuditedCompositionOnlyOnFirstRun(t *testing.T) {
	api := autopilotAPIServer(t)
	defer api.Close()
	st, err := storage.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	svc := newServiceWithCredentialForTest(t, st, envatoconn.NewClient(envatoconn.WithBaseURL(api.URL)), &appTestEngine{name: "test-rust"}, "secret")

	view, err := svc.RunMarketAutopilot(context.Background(), domain.MarketMapModeQuick)
	if err != nil {
		t.Fatal(err)
	}
	if view.Integrity == nil {
		t.Fatal("integrity summary missing")
	}
	global := view.Integrity.GlobalIndex
	if global.DirectionStage != domain.DirectionStageComposition || global.Direction != "" || global.TrendScore != nil {
		t.Fatalf("global=%+v", global)
	}
	if global.ProvenanceID == "" || global.DataQualityGrade == "" || view.Integrity.SampleAudit.ID == "" {
		t.Fatalf("integrity=%+v", view.Integrity)
	}
	if len(view.Integrity.SurfaceBreakdown) == 0 {
		t.Fatal("surface breakdown missing")
	}
	targetResults, err := st.MarketMapTargetResults(view.Run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(targetResults) != view.Run.TargetsPlanned {
		t.Fatalf("targetResults=%d planned=%d", len(targetResults), view.Run.TargetsPlanned)
	}
	for _, row := range view.Catalogs {
		catalogs, _ := st.CatalogNodes()
		for _, catalog := range catalogs {
			if catalog.ID == row.CatalogID && segmentation.IsReservedSurfaceCatalogName(catalog.Name) {
				t.Fatalf("surface leaked into catalog ranking: %+v", catalog)
			}
		}
	}
}

func TestRunMarketAutopilotSecondCompatibleRunPublishesMovementIndication(t *testing.T) {
	api := autopilotAPIServer(t)
	defer api.Close()
	st, err := storage.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	svc := newServiceWithCredentialForTest(t, st, envatoconn.NewClient(envatoconn.WithBaseURL(api.URL)), &appTestEngine{name: "test-rust"}, "secret")
	if _, err := svc.RunMarketAutopilot(context.Background(), domain.MarketMapModeQuick); err != nil {
		t.Fatal(err)
	}
	view, err := svc.RunMarketAutopilot(context.Background(), domain.MarketMapModeQuick)
	if err != nil {
		t.Fatal(err)
	}
	if view.Integrity == nil {
		t.Fatal("integrity summary missing")
	}
	global := view.Integrity.GlobalIndex
	if global.DirectionStage != domain.DirectionStageMovement || global.TrendScore == nil || global.ComparableRuns != 2 {
		t.Fatalf("global=%+v", global)
	}
	if view.Run.ComparableRunCount != 2 || view.Run.GlobalIndexID == "" || view.Run.SampleAuditID == "" {
		t.Fatalf("run=%+v", view.Run)
	}
}
