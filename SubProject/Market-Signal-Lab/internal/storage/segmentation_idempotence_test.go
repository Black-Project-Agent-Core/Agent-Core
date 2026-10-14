package storage

import (
	"marketsignallab/internal/domain"
	"path/filepath"
	"testing"
)

func TestRepeatedObservationSegmentationDoesNotDuplicateSameVersion(t *testing.T) {
	st, err := Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	row := domain.ObservationSegmentation{ID: "seg-1", ObservationID: "obs-1", RunID: "run-1", ProductID: "p1", TaxonomyVersion: "taxonomy-segmentation-v0.1", GeneratedAt: "2026-08-16T00:00:00Z"}
	if err := st.AppendObservationSegmentation(row); err != nil {
		t.Fatal(err)
	}
	row.ID = "seg-2"
	if err := st.AppendObservationSegmentation(row); err != nil {
		t.Fatal(err)
	}
	xs, err := st.ObservationSegmentations(domain.ObservationSegmentationFilter{ObservationID: "obs-1", TaxonomyVersion: "taxonomy-segmentation-v0.1"})
	if err != nil {
		t.Fatal(err)
	}
	if len(xs) != 1 {
		t.Fatalf("rows=%d want=1: %+v", len(xs), xs)
	}
	row.ID = "seg-3"
	row.TaxonomyVersion = "taxonomy-segmentation-v0.2"
	if err := st.AppendObservationSegmentation(row); err != nil {
		t.Fatal(err)
	}
	xs, _ = st.ObservationSegmentations(domain.ObservationSegmentationFilter{ObservationID: "obs-1"})
	if len(xs) != 2 {
		t.Fatalf("versioned rows=%d want=2", len(xs))
	}
}
