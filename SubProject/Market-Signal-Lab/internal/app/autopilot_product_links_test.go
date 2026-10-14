package app

import (
	"path/filepath"
	"testing"

	"marketsignallab/internal/domain"
	"marketsignallab/internal/storage"
)

func TestAutopilotViewEnrichesProductLinksAndSummaries(t *testing.T) {
	st, err := storage.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	svc := New(st)
	plan := domain.MarketMapPlan{ID: "plan-links", CreatedAt: "2026-08-16T00:00:00Z", Mode: domain.MarketMapModeQuick, ScanMode: domain.MarketMapModeQuick, PlannerVersion: "test", CompatibilityKey: "test", ScopeLabel: "test", Sites: []string{"graphicriver.net"}, RequestBudget: 1}
	if err := st.SaveMarketMapPlan(plan); err != nil {
		t.Fatal(err)
	}
	run := domain.MarketMapRun{ID: "run-links", PlanID: plan.ID, Mode: domain.MarketMapModeQuick, StartedAt: "2026-08-16T00:00:00Z", CompletedAt: "2026-08-16T00:01:00Z", Status: domain.MarketMapRunCompleted, Coverage: 100, Confidence: 80}
	if err := st.AppendMarketMapRun(run); err != nil {
		t.Fatal(err)
	}
	addSourceLinkProduct(t, st, "p1", "1001", "Editorial Presentation", "Public Author", "https://graphicriver.net/item/editorial-presentation/1001")
	addSourceLinkProduct(t, st, "p2", "1002", "Second Product", "Second Author", "https://themeforest.net/item/second-product/1002")
	for _, cluster := range []domain.ProductDirectionCluster{
		{ID: "single", RunID: run.ID, Label: "Editorial Presentation", EvidenceProductIDs: []string{"p1"}, ProductCount: 1},
		{ID: "multiple", RunID: run.ID, Label: "Editorial Cluster", EvidenceProductIDs: []string{"p1", "p2"}, ProductCount: 2},
	} {
		if err := st.AppendProductDirectionCluster(cluster); err != nil {
			t.Fatal(err)
		}
	}

	view, err := svc.AutopilotView(run.ID)
	if err != nil {
		t.Fatal(err)
	}
	byID := map[string]domain.ProductDirectionCluster{}
	for _, row := range view.Directions {
		byID[row.ID] = row
	}
	if len(byID["single"].SourceProducts) != 1 || byID["single"].PrimaryProduct == nil || byID["single"].PrimaryProduct.SourceURL == "" {
		t.Fatalf("single=%+v", byID["single"])
	}
	if len(byID["multiple"].SourceProducts) != 2 || byID["multiple"].PrimaryProduct != nil {
		t.Fatalf("multiple=%+v", byID["multiple"])
	}
	if len(view.DirectionLinks) != 2 {
		t.Fatalf("direction links=%+v", view.DirectionLinks)
	}
}
