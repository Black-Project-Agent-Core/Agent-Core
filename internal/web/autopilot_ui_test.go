package web

import (
	"strings"
	"testing"
)

func TestMarketAutopilotIsPrimaryWorkflowAndScannerIsAdvanced(t *testing.T) {
	html := uiSource
	nav := strings.Index(html, `href="#autopilot"`)
	explorer := strings.Index(html, `href="#explorer"`)
	if nav < 0 || explorer < 0 || nav > explorer {
		t.Fatalf("Market Autopilot must be first navigation item")
	}
	panel := strings.Index(html, `id="autopilot"`)
	settings := strings.Index(html, `id="sourceSettings"`)
	scanner := strings.Index(html, `id="advancedResearch"`)
	if panel < 0 || settings < 0 || scanner < 0 || panel > settings || panel > scanner {
		t.Fatal("Autopilot must be the first workflow panel before Settings and Advanced Research")
	}
	for _, want := range []string{`id="sourceSettings"`, `id="autopilotMode"`, `data-i18n="static.alpha_6_market_autopilot"`, `id="autopilotSchedule"`, `data-i18n="autopilot.weekly_via_headless" disabled`, `data-i18n="autopilot.schedule_note"`, `id="mapMarketButton"`, `Market Direction`, `Trends Catalog`, `Product Directions`, `Production Insights`, `Saturation Warnings`, `Advanced Research`} {
		if !strings.Contains(html, want) {
			t.Fatalf("missing %q", want)
		}
	}
	if strings.Contains(html, `id="scannerToken"`) {
		t.Fatal("manual scanner must use the configured Go credential boundary")
	}
	if strings.Contains(html, "Load Synthetic") || strings.Contains(html, "SYNTHETIC DEMO DATA") {
		t.Fatal("demo path present")
	}
}

func TestEnvatoCredentialUIUsesPersistentGoBoundary(t *testing.T) {
	html := uiSource
	for _, forbidden := range []string{
		`id="sourceToken"`,
		"let sessionEnvatoToken='';",
		"sessionEnvatoToken=",
		"token:sessionEnvatoToken",
		"const token=sessionEnvatoToken",
		"token:form.get('token')",
		"captureSourceToken()",
		"clearSourceToken()",
		"JSON.stringify({token,",
	} {
		if strings.Contains(html, forbidden) {
			t.Fatalf("obsolete browser credential state remains: found %q", forbidden)
		}
	}
	if strings.Contains(html, "localStorage.setItem('envato") || strings.Contains(html, "localStorage.setItem(\"envato") || strings.Contains(html, "sessionStorage.setItem('envato") || strings.Contains(html, "sessionStorage.setItem(\"envato") {
		t.Fatal("Envato credential must not use browser storage")
	}
	for _, want := range []string{
		"let envatoConnectionReady=false;",
		"let envatoConnectionStatus=null;",
		"/api/connections/envato",
		"/api/connections/envato/test",
		"loadEnvatoConnectionStatus",
		"saveEnvatoCredentialFromInput",
		"testEnvatoConnection",
		"removeEnvatoCredential",
		"renderEnvatoConnection",
		"updateEnvatoDependentActions",
		`id="envatoSetupDialog"`,
		`id="envatoSetupToken"`,
		`id="envatoReplaceToken"`,
	} {
		if !strings.Contains(html, want) {
			t.Fatalf("missing secure credential UI contract %q", want)
		}
	}
}

func TestAutopilotFailureUsesInlineDiagnosticsInsteadOfBrowserAlert(t *testing.T) {
	html := uiSource
	start := strings.Index(html, "async function runMarketAutopilot()")
	if start < 0 {
		t.Fatal("autopilot function not found")
	}
	relEnd := strings.Index(html[start:], "async function loadAutopilotLatest()")
	if relEnd < 0 {
		t.Fatal("autopilot function boundary not found")
	}
	function := html[start : start+relEnd]
	if strings.Contains(function, "showError(error)") || strings.Contains(function, "alert(") {
		t.Fatalf("autopilot failure still uses a blocking browser alert: %s", function)
	}
	if !strings.Contains(html, `id="autopilotDiagnostics"`) {
		t.Fatal("missing inline autopilot diagnostics container")
	}
}

func TestSourceConnectionFailureUsesInlineDiagnosticsInsteadOfBrowserAlert(t *testing.T) {
	html := uiSource
	start := strings.Index(html, "async function testEnvatoConnection()")
	if start < 0 {
		t.Fatal("source connection function not found")
	}
	relEnd := strings.Index(html[start:], "function envatoFailureCopy")
	if relEnd < 0 {
		t.Fatal("source connection function boundary not found")
	}
	function := html[start : start+relEnd]
	if strings.Contains(function, "showError(error)") || strings.Contains(function, "alert(") {
		t.Fatalf("source connection failure still uses a blocking browser alert: %s", function)
	}
	if !strings.Contains(function, "renderSourceConnectionFailure") {
		t.Fatal("source connection failure does not use the inline diagnostic renderer")
	}
}

func TestAutopilotDiagnosticsHandleForbiddenAndRateLimitCodes(t *testing.T) {
	html := uiSource
	for _, code := range []string{"envato_authentication_failed", "envato_rate_limited", "envato_provider_error", "envato_network_unavailable", "credential_store_error"} {
		if !strings.Contains(html, code) {
			t.Fatalf("missing UI handling for %s", code)
		}
	}
}

func TestAutopilotProductDirectionsExposeSafeEnvatoNavigation(t *testing.T) {
	for _, want := range []string{
		`id="productSourceModal"`,
		`renderProductDirectionCard`,
		`row.primaryProduct`,
		`row.sourceProducts`,
		`target="_blank"`,
		`rel="noopener noreferrer"`,
		`autopilot.open_on_envato`,
		`autopilot.view_products`,
		`autopilot.product_link_unavailable`,
		`autopilot.investigate`,
		`safeProductSourceURL`,
		`/api/autopilot/direction-products`,
	} {
		if !strings.Contains(uiSource, want) {
			t.Fatalf("missing product source-link UI contract %q", want)
		}
	}
}
