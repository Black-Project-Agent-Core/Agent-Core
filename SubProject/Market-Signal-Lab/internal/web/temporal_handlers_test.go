package web

import (
	"net/http"
	"testing"

	"marketsignallab/internal/app"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/storage"
)

func TestAutopilotHistoryEndpointReturnsTemporalRunRows(t *testing.T) {
	st, err := storage.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if err := st.AppendMarketMapRun(domain.MarketMapRun{ID: "run-1", Mode: domain.MarketMapModeStandard, StartedAt: "2026-08-01T00:00:00Z", CompletedAt: "2026-08-01T00:10:00Z", Status: domain.MarketMapRunCompleted, ProductsObserved: 10, Coverage: 90}); err != nil {
		t.Fatal(err)
	}
	srv := New(app.New(st))
	var rows []domain.MarketMapHistoryRow
	w := requestJSON(t, srv, http.MethodGet, "/api/autopilot/history", nil, &rows)
	if w.Code != http.StatusOK || len(rows) != 1 || rows[0].RunID != "run-1" || rows[0].CompletedAt == "" {
		t.Fatalf("status=%d rows=%+v body=%s", w.Code, rows, w.Body.String())
	}
}
