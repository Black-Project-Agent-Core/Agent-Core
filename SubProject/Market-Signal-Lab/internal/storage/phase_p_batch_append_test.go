package storage

import (
	"marketsignallab/internal/domain"
	"path/filepath"
	"testing"
)

func TestRankingBatchAppendsPreserveOrderAndEmptyBatchIsNoOp(t *testing.T) {
	st, err := Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	products := []domain.ProductSnapshot{
		{ID: "product-snap-1", ProductID: "product-1"},
		{ID: "product-snap-2", ProductID: "product-2"},
	}
	if err := st.AppendProductSnapshots(products); err != nil {
		t.Fatal(err)
	}
	if err := st.AppendProductSnapshots(nil); err != nil {
		t.Fatal(err)
	}
	ids := rawLedgerIDs(t, filepath.Join(st.Root(), "history", productSnapshotsFile))
	if len(ids) != 2 || ids[0] != "product-snap-1" || ids[1] != "product-snap-2" {
		t.Fatalf("product snapshot order=%v", ids)
	}
	catalogs := []domain.CatalogSnapshot{
		{ID: "catalog-snap-1", CatalogID: "catalog-1"},
		{ID: "catalog-snap-2", CatalogID: "catalog-2"},
	}
	if err := st.AppendCatalogSnapshots(catalogs); err != nil {
		t.Fatal(err)
	}
	ids = rawLedgerIDs(t, filepath.Join(st.Root(), "history", catalogSnapshotsFile))
	if len(ids) != 2 || ids[0] != "catalog-snap-1" || ids[1] != "catalog-snap-2" {
		t.Fatalf("catalog snapshot order=%v", ids)
	}
}

func TestAutopilotBatchAppendsPreserveOrder(t *testing.T) {
	st, err := Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	clusters := []domain.ProductDirectionCluster{{ID: "cluster-1"}, {ID: "cluster-2"}}
	if err := st.AppendProductDirectionClusters(clusters); err != nil {
		t.Fatal(err)
	}
	ids := rawLedgerIDs(t, filepath.Join(st.Root(), "history", "product_direction_clusters.jsonl"))
	if len(ids) != 2 || ids[0] != "cluster-1" || ids[1] != "cluster-2" {
		t.Fatalf("cluster order=%v", ids)
	}
	reviews := []domain.ClassificationReview{{ID: "review-1"}, {ID: "review-2"}}
	if err := st.AppendClassificationReviews(reviews); err != nil {
		t.Fatal(err)
	}
	ids = rawLedgerIDs(t, filepath.Join(st.Root(), "history", "classification_reviews.jsonl"))
	if len(ids) != 2 || ids[0] != "review-1" || ids[1] != "review-2" {
		t.Fatalf("review order=%v", ids)
	}

	insights := []domain.ProductionInsight{{ID: "insight-1"}, {ID: "insight-2"}}
	if err := st.AppendProductionInsights(insights); err != nil {
		t.Fatal(err)
	}
	ids = rawLedgerIDs(t, filepath.Join(st.Root(), "history", "production_insights.jsonl"))
	if len(ids) != 2 || ids[0] != "insight-1" || ids[1] != "insight-2" {
		t.Fatalf("insight order=%v", ids)
	}

	alerts := []domain.SaturationAlert{{ID: "alert-1"}, {ID: "alert-2"}}
	if err := st.AppendSaturationAlerts(alerts); err != nil {
		t.Fatal(err)
	}
	ids = rawLedgerIDs(t, filepath.Join(st.Root(), "history", "saturation_alerts.jsonl"))
	if len(ids) != 2 || ids[0] != "alert-1" || ids[1] != "alert-2" {
		t.Fatalf("alert order=%v", ids)
	}
}
