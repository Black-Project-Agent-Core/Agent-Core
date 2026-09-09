package repository

import "marketsignallab/internal/domain"

type TelemetryRepository interface {
	AppendScanTelemetryEvent(domain.ScanTelemetryEvent) error
	ScanTelemetryEvents(runID string, offset, limit int) ([]domain.ScanTelemetryEvent, int, error)
	SaveScanRuntimeSummary(domain.ScanRuntimeSummary) error
	ScanRuntimeSummaries() ([]domain.ScanRuntimeSummary, error)
	ScanRuntimeSummaryByRunID(runID string) (domain.ScanRuntimeSummary, bool, error)
}
