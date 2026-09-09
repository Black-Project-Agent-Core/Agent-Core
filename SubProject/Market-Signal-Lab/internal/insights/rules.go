package insights

import "marketsignallab/internal/domain"

type ScanInsight struct {
	Code     string `json:"code"`
	Severity string `json:"severity"`
}

// EvaluateScan converts deterministic session facts into a stable machine code.
// It does not generate prose and does not use an AI model.
func EvaluateScan(session domain.ResearchSession, rankingBuilt bool) ScanInsight {
	switch session.Status {
	case domain.ResearchSessionFailed:
		return ScanInsight{Code: "SCAN_FAILED", Severity: "error"}
	case domain.ResearchSessionCancelled:
		return ScanInsight{Code: "SCAN_CANCELLED", Severity: "warning"}
	case domain.ResearchSessionPartial:
		return ScanInsight{Code: "PARTIAL_SCOPE", Severity: "warning"}
	case domain.ResearchSessionCompleted:
		if session.CoverageEstimate < 60 {
			return ScanInsight{Code: "LOW_COVERAGE", Severity: "warning"}
		}
		if rankingBuilt {
			return ScanInsight{Code: "RANKING_READY", Severity: "good"}
		}
		return ScanInsight{Code: "INSUFFICIENT_HISTORY", Severity: "info"}
	default:
		return ScanInsight{Code: "SCAN_RUNNING", Severity: "info"}
	}
}
