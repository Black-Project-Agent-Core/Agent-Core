package web

import (
	"strings"
	"testing"
)

func TestComputeSettingsShowsComponentHealthWithoutModeSelector(t *testing.T) {
	for _, id := range []string{
		"computeEnginePanel", "applicationHostHealth", "productionAnalyticsHealth",
		"analyticsProtocol", "workerVersion", "lastWorkerError",
		"quantResearchHealth", "nativeAcceleratorHealth",
	} {
		if !strings.Contains(indexHTML, `id="`+id+`"`) {
			t.Fatalf("missing UI id %s", id)
		}
	}
	for _, forbidden := range []string{
		"computeEngineMode", "Go Native", "Rust Native", "Shadow Verification",
		"computeEngineFallbackCount", "computeEngineCircuitState", "runComputeEngineDiagnostics",
	} {
		if strings.Contains(indexHTML, forbidden) {
			t.Fatalf("legacy compute engine control remains: %s", forbidden)
		}
	}
	if !strings.Contains(analyticsEngineJS, "GENERATED FILE NOTICE: internal/web/assets/js/analytics_engine.js is generated from frontend/src/analytics_engine.ts; edit only the TypeScript source.") {
		t.Fatal("missing generated-file notice")
	}
	if !strings.Contains(analyticsEngineJS, "async function loadAnalyticsEngineDiagnostics") {
		t.Fatal("missing diagnostics loader")
	}
	for _, forbidden := range []string{"setAnalyticsEngineMode", "runAnalyticsEngineDiagnostics", "activeMode", "fallbackCount"} {
		if strings.Contains(analyticsEngineJS, forbidden) {
			t.Fatalf("legacy analytics JS remains: %s", forbidden)
		}
	}
	if !strings.Contains(indexHTML, `data-i18n="analytics_engine.component_health"`) {
		t.Fatal("missing localized component health heading")
	}
}

func TestRuntimeUIContainsNoLegacyDemoControls(t *testing.T) {
	for _, source := range []string{indexHTML, appJS} {
		for _, forbidden := range []string{"Purge Legacy Demo Data", "purgeLegacyDemoData", "legacyDemoIntegrity", "/api/system/purge-legacy-demo", "/api/system/demo-integrity"} {
			if strings.Contains(source, forbidden) {
				t.Fatalf("legacy demo runtime control remains: %s", forbidden)
			}
		}
	}
}
