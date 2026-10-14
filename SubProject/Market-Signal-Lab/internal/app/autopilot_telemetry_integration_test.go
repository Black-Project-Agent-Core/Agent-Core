package app

import (
	"context"
	envatoconn "marketsignallab/internal/connectors/envato"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/storage"
	"path/filepath"
	"testing"
)

func TestAutopilotEmitsRuntimeTelemetryWithoutChangingAnalytics(t *testing.T) {
	api := realAutopilotIntegrationServer(t)
	defer api.Close()
	st, err := storage.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	client := envatoconn.NewClient(envatoconn.WithBaseURL(api.URL))
	svc := newServiceWithCredentialForTest(t, st, client, &appTestEngine{name: "test-rust"}, "real-session-token")
	view, err := svc.RunMarketAutopilot(context.Background(), domain.MarketMapModeQuick)
	if err != nil {
		t.Fatal(err)
	}
	rows, _, err := svc.AutopilotRunLog(view.Run.ID, 0, 500)
	if err != nil {
		t.Fatal(err)
	}
	seen := map[domain.ScanStage]bool{}
	for _, ev := range rows {
		if ev.Code == "stage_completed" {
			seen[ev.Stage] = true
		}
	}
	for _, stage := range domain.CanonicalScanStages() {
		if !seen[stage] {
			t.Fatalf("missing completed stage %s events=%+v", stage, rows)
		}
	}
	sum, ok, err := st.ScanRuntimeSummaryByRunID(view.Run.ID)
	if err != nil || !ok {
		t.Fatalf("summary ok=%v err=%v", ok, err)
	}
	if sum.CompletedWorkUnits != sum.PlannedWorkUnits || sum.PlannedWorkUnits <= 0 {
		t.Fatalf("summary=%+v", sum)
	}
	if len(view.Directions) < 2 || len(view.Insights) == 0 {
		t.Fatal("analytics changed")
	}
}
