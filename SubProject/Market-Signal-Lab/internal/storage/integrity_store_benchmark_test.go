package storage

import (
	"bufio"
	"encoding/json"
	"fmt"
	"marketsignallab/internal/domain"
	"os"
	"path/filepath"
	"testing"
)

func phasePProvenanceRow(id string) domain.ScoreProvenance {
	dist := make([]domain.DistributionShare, 64)
	for i := range dist {
		dist[i] = domain.DistributionShare{
			Key:   fmt.Sprintf("catalog-%03d", i),
			Count: i + 1,
			Share: float64((i%20)+1) / 10,
		}
	}
	return domain.ScoreProvenance{
		ID: id, RunID: "phase-p-bench", ScoreType: "opportunity",
		EntityType: "product", EntityID: id,
		CatalogDistribution: dist,
		GeneratedAt:         "2026-08-18T00:00:00Z",
	}
}

func seedPhasePProvenanceLedger(b *testing.B, st *Store, count int) {
	b.Helper()
	path := filepath.Join(st.Root(), "history", "score_provenance.jsonl")
	f, err := os.Create(path)
	if err != nil {
		b.Fatal(err)
	}
	w := bufio.NewWriterSize(f, 256*1024)
	enc := json.NewEncoder(w)
	for i := 0; i < count; i++ {
		if err := enc.Encode(phasePProvenanceRow(fmt.Sprintf("seed-%05d", i))); err != nil {
			f.Close()
			b.Fatal(err)
		}
	}
	if err := w.Flush(); err != nil {
		f.Close()
		b.Fatal(err)
	}
	if err := f.Close(); err != nil {
		b.Fatal(err)
	}
}

func BenchmarkAppendScoreProvenanceGrowingLedger(b *testing.B) {
	for iteration := 0; iteration < b.N; iteration++ {
		b.StopTimer()
		st, err := Open(filepath.Join(b.TempDir(), fmt.Sprintf("case-%d", iteration)))
		if err != nil {
			b.Fatal(err)
		}
		seedPhasePProvenanceLedger(b, st, 200)
		rows := make([]domain.ScoreProvenance, 40)
		for i := range rows {
			rows[i] = phasePProvenanceRow(fmt.Sprintf("new-%05d", i))
		}
		b.StartTimer()
		for _, row := range rows {
			if err := st.AppendScoreProvenance(row); err != nil {
				b.Fatal(err)
			}
		}
	}
}

func BenchmarkAppendScoreProvenancesBatchGrowingLedger(b *testing.B) {
	for iteration := 0; iteration < b.N; iteration++ {
		b.StopTimer()
		st, err := Open(filepath.Join(b.TempDir(), fmt.Sprintf("batch-case-%d", iteration)))
		if err != nil {
			b.Fatal(err)
		}
		seedPhasePProvenanceLedger(b, st, 200)
		rows := make([]domain.ScoreProvenance, 40)
		for i := range rows {
			rows[i] = phasePProvenanceRow(fmt.Sprintf("batch-new-%05d", i))
		}
		b.StartTimer()
		if err := st.AppendScoreProvenances(rows); err != nil {
			b.Fatal(err)
		}
	}
}
