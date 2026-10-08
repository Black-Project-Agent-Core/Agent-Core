package ranking

import (
	"marketsignallab/internal/analyticsengine"
	"marketsignallab/internal/domain"
	"reflect"
	"testing"
	"time"
)

func TestAssembleProductSnapshotsV01PreservesContractMetadataAndOrdering(t *testing.T) {
	w, _ := NewWindow(time.Date(2026, 8, 20, 0, 0, 0, 0, time.UTC), 30)
	input := BuildInput{Window: w, MarketMapRunID: "run-9"}
	n := RustRankingNormalizationV01{
		ProductKeys:              LocalKeyMapV01{ByKey: map[uint32]string{1: "p-b", 2: "p-a"}},
		ResolvedCatalogByProduct: map[string]string{"p-a": "cat", "p-b": "cat"},
	}
	result := analyticsengine.ProductRankingV01Result{Rows: []analyticsengine.ProductRankingV01ResultRow{
		{ProductKey: 1, DirectionCode: 2, MissingMask: 0b11, MedianPosition: 4, ExposureScore: 70},
		{ProductKey: 2, DirectionCode: 3, MissingMask: 0, MedianPosition: 2, ExposureScore: 80},
	}}
	got, err := AssembleProductSnapshotsV01(input, n, result)
	if err != nil {
		t.Fatal(err)
	}
	if got[0].ProductID != "p-a" || got[1].ProductID != "p-b" {
		t.Fatalf("product snapshot order=%v,%v", got[0].ProductID, got[1].ProductID)
	}
	if got[0].ModelVersion != "product-snapshot-v0.2" || got[0].MarketMapRunID != "run-9" || got[0].IntegrityStatus != domain.IntegrityStatusNativeAlpha65 || got[0].ObservedAt != w.CurrentEnd {
		t.Fatalf("metadata=%+v", got[0])
	}
	if got[0].ID != SnapshotID("product", "p-a", w, "product-snapshot-v0.2") {
		t.Fatalf("snapshot id=%s", got[0].ID)
	}
	if !reflect.DeepEqual(got[1].Missing, []string{"rank_velocity", "segmentation_fallback"}) {
		t.Fatalf("missing=%v", got[1].Missing)
	}
}

func TestAssembleCatalogSnapshotsV01PreservesContractMetadataAndMissingOrder(t *testing.T) {
	w, _ := NewWindow(time.Date(2026, 8, 20, 0, 0, 0, 0, time.UTC), 30)
	input := BuildInput{Window: w, MarketMapRunID: "run-10"}
	n := RustRankingNormalizationV01{CatalogKeys: LocalKeyMapV01{ByKey: map[uint32]string{1: "cat-b", 2: "cat-a"}}}
	result := analyticsengine.CatalogRankingV01Result{Rows: []analyticsengine.CatalogRankingV01ResultRow{
		{CatalogKey: 1, DirectionCode: 2, MissingMask: 0b1111},
		{CatalogKey: 2, DirectionCode: 4, MissingMask: 0},
	}}
	got, err := AssembleCatalogSnapshotsV01(input, n, result)
	if err != nil {
		t.Fatal(err)
	}
	if got[0].CatalogID != "cat-a" || got[1].CatalogID != "cat-b" {
		t.Fatalf("catalog order=%s,%s", got[0].CatalogID, got[1].CatalogID)
	}
	if got[0].ModelVersion != "catalog-snapshot-v0.2" || got[0].MarketMapRunID != "run-10" || got[0].IntegrityStatus != domain.IntegrityStatusNativeAlpha65 || got[0].ObservedAt != w.CurrentEnd {
		t.Fatalf("metadata=%+v", got[0])
	}
	if got[0].ID != SnapshotID("catalog", "cat-a", w, "catalog-snapshot-v0.2") {
		t.Fatalf("snapshot id=%s", got[0].ID)
	}
	wantMissing := []string{"author_attribution", "external_trend", "previous_window_history", "research_session_coverage"}
	if !reflect.DeepEqual(got[1].Missing, wantMissing) {
		t.Fatalf("missing=%v want=%v", got[1].Missing, wantMissing)
	}
}
