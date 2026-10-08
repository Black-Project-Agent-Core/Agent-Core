package storage

import (
	"fmt"
	"marketsignallab/internal/domain"
	"path/filepath"
	"testing"
)

func phasePProductSnapshotRow(i int) domain.ProductSnapshot {
	return domain.ProductSnapshot{
		ID:               fmt.Sprintf("snapshot-%05d", i),
		ProductID:        fmt.Sprintf("product-%05d", i),
		CatalogID:        fmt.Sprintf("catalog-%03d", i%100),
		ModelVersion:     "product-ranking-v0.1",
		ExposureScore:    float64(i % 101),
		OpportunityScore: float64((i * 3) % 101),
	}
}

func BenchmarkAppendProductSnapshotRowsSingular(b *testing.B) {
	for iteration := 0; iteration < b.N; iteration++ {
		b.StopTimer()
		st, err := Open(filepath.Join(b.TempDir(), fmt.Sprintf("singular-%d", iteration)))
		if err != nil {
			b.Fatal(err)
		}
		rows := make([]domain.ProductSnapshot, 500)
		for i := range rows {
			rows[i] = phasePProductSnapshotRow(i)
		}
		b.StartTimer()
		for _, row := range rows {
			if err := st.AppendProductSnapshot(row); err != nil {
				b.Fatal(err)
			}
		}
	}
}

func BenchmarkAppendProductSnapshotRowsBatch(b *testing.B) {
	for iteration := 0; iteration < b.N; iteration++ {
		b.StopTimer()
		st, err := Open(filepath.Join(b.TempDir(), fmt.Sprintf("batch-%d", iteration)))
		if err != nil {
			b.Fatal(err)
		}
		rows := make([]domain.ProductSnapshot, 500)
		for i := range rows {
			rows[i] = phasePProductSnapshotRow(i)
		}
		b.StartTimer()
		if err := st.AppendProductSnapshots(rows); err != nil {
			b.Fatal(err)
		}
	}
}
