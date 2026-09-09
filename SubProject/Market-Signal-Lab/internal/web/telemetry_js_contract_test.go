package web

import (
	"strings"
	"testing"
)

func TestTelemetryJavaScriptContract(t *testing.T) {
	for _, name := range []string{"startAutopilotLiveRun", "connectAutopilotTelemetry", "renderAutopilotRuntime", "renderTelemetryEvent", "renderRecentRunLog", "openFullRunLog", "closeFullRunLog", "refreshLastCompletedMapAfterTerminal"} {
		if !strings.Contains(telemetryJS, "function "+name+"(") && !strings.Contains(telemetryJS, "async function "+name+"(") {
			t.Fatalf("missing %s", name)
		}
	}
	queryCredentialMarker := "&to" + "ken="
	headerCredentialMarker := "Author" + "ization"
	if strings.Contains(telemetryJS, queryCredentialMarker) || strings.Contains(telemetryJS, headerCredentialMarker) {
		t.Fatal("telemetry stream must not carry token")
	}
	if !strings.Contains(telemetryJS, "slice(-5)") {
		t.Fatal("recent log must cap five")
	}
}
func TestAutopilotAsyncClientUsesTelemetryStart(t *testing.T) {
	if !strings.Contains(appJS, "startAutopilotLiveRun") {
		t.Fatal("autopilot start not connected to live telemetry")
	}
}
