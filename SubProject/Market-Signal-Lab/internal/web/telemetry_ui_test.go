package web

import (
	"strings"
	"testing"
)

func TestLiveScanTelemetryUIContract(t *testing.T) {
	for _, id := range []string{"liveMarketMappingPanel", "liveRunStatus", "liveStageTracker", "liveProgressBar", "liveProgressPercent", "liveProductsDiscovered", "liveWorkUnits", "liveElapsed", "liveEtaRemaining", "liveExpectedFinish", "liveEtaConfidence", "liveRecentLog", "viewFullRunLog", "lastCompletedMapPanel", "runLogDialog", "runLogDialogBody"} {
		if !strings.Contains(indexHTML, `id="`+id+`"`) {
			t.Fatalf("missing %s", id)
		}
	}
	live := strings.Index(indexHTML, `id="liveMarketMappingPanel"`)
	last := strings.Index(indexHTML, `id="lastCompletedMapPanel"`)
	metrics := strings.Index(indexHTML, `id="autopilotTemperature"`)
	if live < 0 || last < live || metrics < last {
		t.Fatalf("ordering live=%d last=%d metrics=%d", live, last, metrics)
	}
}
