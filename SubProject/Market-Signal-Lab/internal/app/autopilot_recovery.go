package app

import (
	"marketsignallab/internal/domain"
	"time"
)

// InterruptedMarketMapReason is the stable error text appended to a persisted
// market map run that was still `running` when the owning application exited.
const InterruptedMarketMapReason = "market map interrupted by previous application exit"

// ReconcileInterruptedAutopilotRuns terminalizes persisted market map runs that
// are still `running` after the owning process exited. A stale run cannot be
// resumed, so it is marked `failed` with a recovery completion time and the
// stable interruption reason. All persisted counters, ledgers, and existing
// errors are preserved and no analytics output is synthesized.
//
// Callers must own the runtime for this data root before calling. The method is
// idempotent: already terminal runs are left untouched.
func (s *Service) ReconcileInterruptedAutopilotRuns() (int, error) {
	runs, err := s.autopilot.MarketMapRuns()
	if err != nil {
		return 0, err
	}
	recoveredAt := time.Now().UTC().Format(time.RFC3339)
	reconciled := 0
	for _, run := range runs {
		if run.Status != domain.MarketMapRunRunning {
			continue
		}
		run.Status = domain.MarketMapRunFailed
		run.CompletedAt = recoveredAt
		if !containsString(run.Errors, InterruptedMarketMapReason) {
			run.Errors = append(append([]string{}, run.Errors...), InterruptedMarketMapReason)
		}
		if err := s.autopilot.AppendMarketMapRun(run); err != nil {
			return reconciled, err
		}
		reconciled++
	}
	return reconciled, nil
}

func containsString(xs []string, want string) bool {
	for _, v := range xs {
		if v == want {
			return true
		}
	}
	return false
}
