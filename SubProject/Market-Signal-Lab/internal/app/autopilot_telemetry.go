package app

import (
	"context"
	"marketsignallab/internal/domain"
	"sort"
	"time"
)

func (s *Service) StartMarketAutopilot(ctx context.Context, mode domain.MarketMapMode) (domain.ScanRuntimeSnapshot, error) {
	if err := s.RequireAnalyticsRuntime(ctx); err != nil {
		return domain.ScanRuntimeSnapshot{}, err
	}
	return s.runManager.Start(mode)
}

func (s *Service) ActiveAutopilotRun() (domain.ScanRuntimeSnapshot, bool) {
	return s.runManager.Active()
}

func (s *Service) AutopilotRuntimeSnapshot(runID string) (domain.ScanRuntimeSnapshot, bool, error) {
	if snap, ok := s.telemetry.Snapshot(runID); ok {
		return snap, true, nil
	}
	sum, ok, err := s.store.ScanRuntimeSummaryByRunID(runID)
	if err != nil || !ok {
		return domain.ScanRuntimeSnapshot{}, ok, err
	}
	return domain.ScanRuntimeSnapshot{RunID: sum.RunID, Status: sum.Status, StartedAt: sum.StartedAt, UpdatedAt: sum.CompletedAt, PlannedWorkUnits: sum.PlannedWorkUnits, CompletedWorkUnits: sum.CompletedWorkUnits, ProgressDeterminate: sum.PlannedWorkUnits > 0, ProgressPercent: 100, ProductsDiscovered: sum.ProductsDiscovered, RequestsCompleted: sum.RequestsCompleted, ElapsedMs: sum.DurationMs, ETA: domain.ETAEstimate{Kind: domain.ETAPoint, Confidence: domain.ETAConfidenceHigh, Basis: "complete"}, WarningCount: sum.WarningCount, ErrorCount: sum.ErrorCount, RuntimeCompatibility: sum.Compatibility}, true, nil
}

func (s *Service) AutopilotRunLog(runID string, offset, limit int) ([]domain.ScanTelemetryEvent, int, error) {
	return s.store.ScanTelemetryEvents(runID, offset, limit)
}
func (s *Service) AutopilotRuntimeHistory(limit int) ([]domain.ScanRuntimeSummary, error) {
	rows, err := s.store.ScanRuntimeSummaries()
	if err != nil {
		return nil, err
	}
	sort.SliceStable(rows, func(i, j int) bool { return rows[i].StartedAt > rows[j].StartedAt })
	if limit > 0 && len(rows) > limit {
		rows = rows[:limit]
	}
	return rows, nil
}
func (s *Service) SubscribeAutopilotTelemetry(runID string) (<-chan domain.ScanTelemetryEvent, func(), error) {
	return s.telemetry.Subscribe(runID)
}
func terminalStatus(s domain.MarketMapRunStatus) bool {
	switch s {
	case domain.MarketMapRunCompleted, domain.MarketMapRunPartial, domain.MarketMapRunFailed, domain.MarketMapRunCancelled:
		return true
	}
	return false
}
func parseRFC(s string) time.Time { t, _ := time.Parse(time.RFC3339, s); return t }
