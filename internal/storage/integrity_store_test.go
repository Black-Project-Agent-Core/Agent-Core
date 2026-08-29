package storage

import (
	"marketsignallab/internal/domain"
	"path/filepath"
	"testing"
)

func TestIntegrityStoreRoundTripsEveryRecord(t *testing.T) {
	st, err := Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	seg := domain.ObservationSegmentation{ID: "seg-1", ObservationID: "obs-1", RunID: "run-1", ProductID: "product-1", Site: "graphicriver.net", ContentType: "Graphics", ProductType: "presentation", Confidence: 90, Status: domain.IntegrityStatusNativeAlpha65, TaxonomyVersion: "taxonomy-segmentation-v0.1", GeneratedAt: "2026-08-16T00:00:00Z"}
	audit := domain.SampleAudit{ID: "audit-1", RunID: "run-1", GeneratedAt: "2026-08-16T00:00:00Z"}
	quality := domain.DataQualityAssessment{ID: "quality-1", RunID: "run-1", EntityType: "global", EntityID: "global", Score: 80, Grade: domain.DataQualityGradeB, GeneratedAt: "2026-08-16T00:00:00Z"}
	index := domain.MarketIndexSnapshot{ID: "index-1", RunID: "run-1", Level: domain.SegmentLevelGlobal, EntityID: "global", IntegrityStatus: domain.IntegrityStatusNativeAlpha65, GeneratedAt: "2026-08-16T00:00:00Z"}
	provenance := domain.ScoreProvenance{ID: "prov-1", RunID: "run-1", ScoreType: "composition", EntityType: "global", EntityID: "global", GeneratedAt: "2026-08-16T00:00:00Z"}
	review := domain.LegacyClassificationReview{ID: "review-1", CatalogID: "catalog-1", Status: "open", CreatedAt: "2026-08-16T00:00:00Z"}
	for _, err := range []error{st.AppendObservationSegmentation(seg), st.AppendSampleAudit(audit), st.AppendDataQualityAssessment(quality), st.AppendMarketIndexSnapshot(index), st.AppendScoreProvenance(provenance), st.AppendLegacyClassificationReview(review)} {
		if err != nil {
			t.Fatal(err)
		}
	}
	if xs, _ := st.ObservationSegmentations(domain.ObservationSegmentationFilter{ProductID: "product-1"}); len(xs) != 1 {
		t.Fatalf("segmentations=%+v", xs)
	}
	if row, ok, _ := st.LatestSampleAudit("run-1"); !ok || row.ID != "audit-1" {
		t.Fatalf("audit=%+v ok=%v", row, ok)
	}
	if xs, _ := st.ScoreProvenances(domain.ScoreProvenanceFilter{ID: "prov-1"}); len(xs) != 1 {
		t.Fatalf("provenance=%+v", xs)
	}
}

func TestObservationSegmentationIsIdempotentByObservationAndVersion(t *testing.T) {
	st, _ := Open(filepath.Join(t.TempDir(), "data"))
	row := domain.ObservationSegmentation{ID: "seg-1", ObservationID: "obs-1", TaxonomyVersion: "taxonomy-segmentation-v0.1", GeneratedAt: "2026-08-16T00:00:00Z"}
	if err := st.AppendObservationSegmentation(row); err != nil {
		t.Fatal(err)
	}
	row.ID = "seg-2"
	if err := st.AppendObservationSegmentation(row); err != nil {
		t.Fatal(err)
	}
	xs, _ := st.ObservationSegmentations(domain.ObservationSegmentationFilter{ObservationID: "obs-1"})
	if len(xs) != 1 {
		t.Fatalf("xs=%+v", xs)
	}
}
