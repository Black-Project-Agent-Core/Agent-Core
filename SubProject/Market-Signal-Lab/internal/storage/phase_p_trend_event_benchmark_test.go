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

func phasePTrendEvent(id, productID, runID string, window int) domain.ProductTrendEvent {
	return domain.ProductTrendEvent{
		ID: id, ProductID: productID, RunID: runID,
		WindowDays: window, EventType: domain.TrendEventEntered, Active: true,
		OccurredAt: "2026-08-18T00:00:00Z", ModelVersion: "trend-lifecycle-v0.1",
	}
}

func seedPhasePTrendLedger(b *testing.B, st *Store, count int) {
	b.Helper()
	path := filepath.Join(st.Root(), "history", productTrendEventsFile)
	f, err := os.Create(path)
	if err != nil {
		b.Fatal(err)
	}
	w := bufio.NewWriterSize(f, 256*1024)
	enc := json.NewEncoder(w)
	for i := 0; i < count; i++ {
		row := phasePTrendEvent(
			fmt.Sprintf("seed-event-%05d", i),
			fmt.Sprintf("seed-product-%05d", i),
			fmt.Sprintf("seed-run-%03d", i%20),
			[]int{7, 30, 90}[i%3],
		)
		if err := enc.Encode(row); err != nil {
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

func BenchmarkAppendProductTrendEventsSingularGrowingLedger(b *testing.B) {
	for iteration := 0; iteration < b.N; iteration++ {
		b.StopTimer()
		st, err := Open(filepath.Join(b.TempDir(), fmt.Sprintf("trend-singular-%d", iteration)))
		if err != nil {
			b.Fatal(err)
		}
		seedPhasePTrendLedger(b, st, 1000)
		rows := make([]domain.ProductTrendEvent, 200)
		for i := range rows {
			rows[i] = phasePTrendEvent(
				fmt.Sprintf("new-event-%05d", i),
				fmt.Sprintf("new-product-%05d", i),
				"run-new",
				30,
			)
		}
		b.StartTimer()
		for _, row := range rows {
			if err := st.AppendProductTrendEvent(row); err != nil {
				b.Fatal(err)
			}
		}
	}
}

func BenchmarkAppendProductTrendEventsBatchGrowingLedger(b *testing.B) {
	for iteration := 0; iteration < b.N; iteration++ {
		b.StopTimer()
		st, err := Open(filepath.Join(b.TempDir(), fmt.Sprintf("trend-batch-%d", iteration)))
		if err != nil {
			b.Fatal(err)
		}
		seedPhasePTrendLedger(b, st, 1000)
		rows := make([]domain.ProductTrendEvent, 200)
		for i := range rows {
			rows[i] = phasePTrendEvent(
				fmt.Sprintf("batch-event-%05d", i),
				fmt.Sprintf("batch-product-%05d", i),
				"run-new",
				30,
			)
		}
		b.StartTimer()
		if err := st.AppendProductTrendEvents(rows); err != nil {
			b.Fatal(err)
		}
	}
}
