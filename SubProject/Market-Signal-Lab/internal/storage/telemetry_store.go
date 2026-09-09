package storage

import (
	"encoding/json"
	"marketsignallab/internal/domain"
	"sort"
)

const telemetryEventsLedger = "scan_telemetry_events.jsonl"
const telemetryRuntimeLedger = "scan_runtime_summaries.jsonl"

func (s *Store) AppendScanTelemetryEvent(v domain.ScanTelemetryEvent) error {
	return s.appendJSONL(telemetryEventsLedger, v)
}

func (s *Store) ScanTelemetryEvents(runID string, offset, limit int) ([]domain.ScanTelemetryEvent, int, error) {
	rows := []domain.ScanTelemetryEvent{}
	err := s.readJSONL(telemetryEventsLedger, func(b []byte) error {
		var v domain.ScanTelemetryEvent
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		if runID == "" || v.RunID == runID {
			rows = append(rows, v)
		}
		return nil
	})
	if err != nil {
		return nil, 0, err
	}
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].Sequence < rows[j].Sequence })
	total := len(rows)
	if offset < 0 {
		offset = 0
	}
	if offset > total {
		offset = total
	}
	if limit <= 0 {
		limit = total
	}
	end := offset + limit
	if end > total {
		end = total
	}
	return append([]domain.ScanTelemetryEvent(nil), rows[offset:end]...), total, nil
}

func (s *Store) SaveScanRuntimeSummary(v domain.ScanRuntimeSummary) error {
	return s.appendJSONL(telemetryRuntimeLedger, v)
}

func (s *Store) ScanRuntimeSummaries() ([]domain.ScanRuntimeSummary, error) {
	latest := map[string]domain.ScanRuntimeSummary{}
	order := []string{}
	err := s.readJSONL(telemetryRuntimeLedger, func(b []byte) error {
		var v domain.ScanRuntimeSummary
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		if _, ok := latest[v.RunID]; !ok {
			order = append(order, v.RunID)
		}
		latest[v.RunID] = v
		return nil
	})
	if err != nil {
		return nil, err
	}
	out := make([]domain.ScanRuntimeSummary, 0, len(latest))
	for _, id := range order {
		out = append(out, latest[id])
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].StartedAt > out[j].StartedAt })
	return out, nil
}

func (s *Store) ScanRuntimeSummaryByRunID(runID string) (domain.ScanRuntimeSummary, bool, error) {
	rows, err := s.ScanRuntimeSummaries()
	if err != nil {
		return domain.ScanRuntimeSummary{}, false, err
	}
	for _, v := range rows {
		if v.RunID == runID {
			return v, true, nil
		}
	}
	return domain.ScanRuntimeSummary{}, false, nil
}
