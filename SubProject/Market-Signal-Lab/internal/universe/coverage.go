package universe

import (
	"marketsignallab/internal/domain"
	"math"
)

func CoveragePercent(planned int, completedIDs []string) float64 {
	if planned <= 0 {
		return 0
	}
	seen := map[string]bool{}
	for _, id := range completedIDs {
		if id != "" {
			seen[id] = true
		}
	}
	v := float64(len(seen)) / float64(planned) * 100
	if v > 100 {
		v = 100
	}
	return math.Round(v*10) / 10
}

func ResolveSessionStatus(planned, completed, budget, used int, cancelled, failed bool) domain.ResearchSessionStatus {
	if cancelled {
		return domain.ResearchSessionCancelled
	}
	if failed {
		return domain.ResearchSessionFailed
	}
	if planned > 0 && completed >= planned {
		return domain.ResearchSessionCompleted
	}
	if budget > 0 && used >= budget {
		return domain.ResearchSessionPartial
	}
	return domain.ResearchSessionRunning
}
