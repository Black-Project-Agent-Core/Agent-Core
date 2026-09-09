package storage

import (
	"encoding/json"
	"marketsignallab/internal/domain"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestScanTelemetryAppendReadPaginationAndIsolation(t *testing.T) {
	s, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range []domain.ScanTelemetryEvent{
		{RunID: "a", Sequence: 2, Code: "two"}, {RunID: "b", Sequence: 1, Code: "other"}, {RunID: "a", Sequence: 1, Code: "one"},
	} {
		if err := s.AppendScanTelemetryEvent(e); err != nil {
			t.Fatal(err)
		}
	}
	rows, total, err := s.ScanTelemetryEvents("a", 0, 1)
	if err != nil {
		t.Fatal(err)
	}
	if total != 2 || len(rows) != 1 || rows[0].Sequence != 1 {
		t.Fatalf("total=%d rows=%+v", total, rows)
	}
}

func TestScanRuntimeSummaryLatestRecordPerRun(t *testing.T) {
	s, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if err := s.SaveScanRuntimeSummary(domain.ScanRuntimeSummary{RunID: "r", Status: domain.MarketMapRunRunning, CompletedWorkUnits: 2}); err != nil {
		t.Fatal(err)
	}
	if err := s.SaveScanRuntimeSummary(domain.ScanRuntimeSummary{RunID: "r", Status: domain.MarketMapRunCompleted, CompletedWorkUnits: 5}); err != nil {
		t.Fatal(err)
	}
	got, ok, err := s.ScanRuntimeSummaryByRunID("r")
	if err != nil || !ok {
		t.Fatalf("ok=%v err=%v", ok, err)
	}
	if got.Status != domain.MarketMapRunCompleted || got.CompletedWorkUnits != 5 {
		t.Fatalf("got=%+v", got)
	}
	all, err := s.ScanRuntimeSummaries()
	if err != nil || len(all) != 1 {
		t.Fatalf("len=%d err=%v", len(all), err)
	}
}

func TestTelemetryStoreDoesNotPersistSecretSentinel(t *testing.T) {
	dir := t.TempDir()
	s, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	e := domain.ScanTelemetryEvent{RunID: "r", Sequence: 1, Code: "safe", Detail: "[redacted]"}
	if err := s.AppendScanTelemetryEvent(e); err != nil {
		t.Fatal(err)
	}
	b, err := os.ReadFile(filepath.Join(dir, "history", "scan_telemetry_events.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(b), "SECRET_SENTINEL") {
		t.Fatalf("secret leaked: %s", b)
	}
	var out domain.ScanTelemetryEvent
	if err := json.Unmarshal([]byte(strings.TrimSpace(string(b))), &out); err != nil {
		t.Fatal(err)
	}
}
