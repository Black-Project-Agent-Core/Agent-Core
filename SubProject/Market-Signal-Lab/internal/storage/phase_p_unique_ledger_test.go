package storage

import (
	"encoding/json"
	"marketsignallab/internal/domain"
	"os"
	"path/filepath"
	"testing"
)

func rawLedgerIDs(t *testing.T, path string) []string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var ids []string
	for _, line := range bytesLines(data) {
		if len(line) == 0 {
			continue
		}
		var row struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(line, &row); err != nil {
			t.Fatal(err)
		}
		ids = append(ids, row.ID)
	}
	return ids
}

func bytesLines(data []byte) [][]byte {
	out := [][]byte{}
	start := 0
	for i, b := range data {
		if b != '\n' {
			continue
		}
		out = append(out, data[start:i])
		start = i + 1
	}
	if start < len(data) {
		out = append(out, data[start:])
	}
	return out
}

func TestIntegrityBatchAppendsAreIdempotentAndOrdered(t *testing.T) {
	st, err := Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	rows := []domain.ScoreProvenance{
		{ID: "prov-1", RunID: "run-p", GeneratedAt: "2026-08-18T00:00:00Z"},
		{ID: "prov-2", RunID: "run-p", GeneratedAt: "2026-08-18T00:00:01Z"},
		{ID: "prov-1", RunID: "run-p", GeneratedAt: "2026-08-18T00:00:02Z"},
	}
	if err := st.AppendScoreProvenances(rows); err != nil {
		t.Fatal(err)
	}
	ledger := filepath.Join(st.Root(), "history", "score_provenance.jsonl")
	ids := rawLedgerIDs(t, ledger)
	if got, want := len(ids), 2; got != want {
		t.Fatalf("ids=%v len=%d want=%d", ids, got, want)
	}
	if ids[0] != "prov-1" || ids[1] != "prov-2" {
		t.Fatalf("caller order not preserved: %v", ids)
	}
	if err := st.AppendScoreProvenances(nil); err != nil {
		t.Fatal(err)
	}
	if got := len(rawLedgerIDs(t, ledger)); got != 2 {
		t.Fatalf("empty batch changed ledger: %d", got)
	}

	qualities := []domain.DataQualityAssessment{{ID: "q-1"}, {ID: "q-2"}, {ID: "q-1"}}
	if err := st.AppendDataQualityAssessments(qualities); err != nil {
		t.Fatal(err)
	}
	if got := len(rawLedgerIDs(t, filepath.Join(st.Root(), "history", "data_quality_assessments.jsonl"))); got != 2 {
		t.Fatalf("quality rows=%d want=2", got)
	}

	indices := []domain.MarketIndexSnapshot{{ID: "idx-1"}, {ID: "idx-2"}, {ID: "idx-1"}}
	if err := st.AppendMarketIndexSnapshots(indices); err != nil {
		t.Fatal(err)
	}
	if got := len(rawLedgerIDs(t, filepath.Join(st.Root(), "history", "market_index_snapshots.jsonl"))); got != 2 {
		t.Fatalf("index rows=%d want=2", got)
	}
}

func TestUniqueLedgerIndexRebuildsAfterExternalGrowth(t *testing.T) {
	st, err := Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	first := domain.ScoreProvenance{ID: "prov-1", RunID: "run-p", GeneratedAt: "2026-08-18T00:00:00Z"}
	if err := st.AppendScoreProvenances([]domain.ScoreProvenance{first}); err != nil {
		t.Fatal(err)
	}
	ledger := filepath.Join(st.Root(), "history", "score_provenance.jsonl")
	external := domain.ScoreProvenance{ID: "external-1", RunID: "run-p", GeneratedAt: "2026-08-18T00:00:01Z"}
	b, err := json.Marshal(external)
	if err != nil {
		t.Fatal(err)
	}
	f, err := os.OpenFile(ledger, os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.Write(append(b, '\n')); err != nil {
		f.Close()
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}

	second := domain.ScoreProvenance{ID: "prov-2", RunID: "run-p", GeneratedAt: "2026-08-18T00:00:02Z"}
	if err := st.AppendScoreProvenances([]domain.ScoreProvenance{external, second}); err != nil {
		t.Fatal(err)
	}
	ids := rawLedgerIDs(t, ledger)
	if got, want := len(ids), 3; got != want {
		t.Fatalf("ids=%v len=%d want=%d", ids, got, want)
	}
	if ids[0] != "prov-1" || ids[1] != "external-1" || ids[2] != "prov-2" {
		t.Fatalf("unexpected ledger order after rebuild: %v", ids)
	}
}

type phasePBadUniqueRow struct {
	ID  string   `json:"id"`
	Bad chan int `json:"bad"`
}

func TestUniqueLedgerInvalidatesCacheOnMarshalFailure(t *testing.T) {
	st, err := Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	rows := []phasePBadUniqueRow{{ID: "bad-1", Bad: make(chan int)}}
	err = appendUniqueJSONLBatch(st, "phase_p_bad.jsonl", rows, func(row phasePBadUniqueRow) string { return row.ID })
	if err == nil {
		t.Fatal("expected marshal failure")
	}
	if _, ok := st.uniqueIDIndexes["phase_p_bad.jsonl"]; ok {
		t.Fatal("failed append left a trusted unique-ID cache")
	}
}

func TestIntegrityBatchDoesNotMutateCallerRowsWhenGeneratingIDs(t *testing.T) {
	st, err := Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	rows := []domain.ScoreProvenance{{RunID: "run-p", GeneratedAt: "2026-08-18T00:00:00Z"}}
	if err := st.AppendScoreProvenances(rows); err != nil {
		t.Fatal(err)
	}
	if rows[0].ID != "" {
		t.Fatalf("batch mutated caller ID: %q", rows[0].ID)
	}
	ledger := filepath.Join(st.Root(), "history", "score_provenance.jsonl")
	ids := rawLedgerIDs(t, ledger)
	if len(ids) != 1 || ids[0] == "" {
		t.Fatalf("persisted generated ID invalid: %v", ids)
	}
}
