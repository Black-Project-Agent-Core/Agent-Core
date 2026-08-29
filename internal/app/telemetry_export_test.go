package app

import (
	"marketsignallab/internal/domain"
	"marketsignallab/internal/storage"
	"path/filepath"
	"strings"
	"testing"
)

func TestTelemetryExportIncludesSanitizedRuntimeHistory(t *testing.T) {
	st, _ := storage.Open(filepath.Join(t.TempDir(), "d"))
	_ = st.AppendScanTelemetryEvent(domain.ScanTelemetryEvent{RunID: "r", Sequence: 1, Code: "safe", Detail: "[redacted]"})
	_ = st.SaveScanRuntimeSummary(domain.ScanRuntimeSummary{RunID: "r", Status: domain.MarketMapRunCompleted})
	svc := New(st)
	b, err := svc.Export()
	if err != nil {
		t.Fatal(err)
	}
	if b.Version != "0.3.0-alpha.6.5.3-preview.1" || len(b.ScanTelemetryEvents) != 1 || len(b.ScanRuntimeSummaries) != 1 {
		t.Fatalf("version=%s events=%d summaries=%d", b.Version, len(b.ScanTelemetryEvents), len(b.ScanRuntimeSummaries))
	}
	raw := strings.ToLower(b.ScanTelemetryEvents[0].Detail)
	if strings.Contains(raw, "bearer") || strings.Contains(raw, "secret") {
		t.Fatal("unsafe export")
	}
}
