package web

import (
	"encoding/json"
	"os"
	"sort"
	"strings"
	"testing"
)

func TestEvidenceQualificationUIWiring(t *testing.T) {
	for _, want := range []string{
		`id="evidenceQualification"`,
		`id="evidenceRunId"`,
		`id="evidenceBuildButton"`,
		`onclick="buildEvidenceAssessments()"`,
		`id="evidenceRefreshButton"`,
		`onclick="loadEvidenceAssessments()"`,
		`id="evidenceAssessmentRows"`,
		`data-i18n="evidence.qualification"`,
		`data-i18n="evidence.stage"`,
		`data-i18n="evidence.eligibility"`,
		`data-i18n="evidence.reasons"`,
	} {
		if !strings.Contains(indexHTML, want) {
			t.Fatalf("evidence qualification UI marker missing: %s", want)
		}
	}
	section := sourceBetween(t, indexHTML, `id="evidenceQualification"`, `id="explorer"`)
	if got := strings.Count(section, `<th `); got != 6 {
		t.Fatalf("evidence table columns=%d want 6", got)
	}
	for _, want := range []string{
		"function evidenceNarrative(",
		"function renderEvidenceAssessments(",
		"async function loadEvidenceAssessments(",
		"async function buildEvidenceAssessments(",
		"/api/evidence/assessments",
	} {
		if !strings.Contains(appJS, want) {
			t.Fatalf("app.js evidence wiring missing: %s", want)
		}
	}
}

func TestEvidenceNarrativeSuppressionGatePrecedesStageAndNeverReadsLegacyScores(t *testing.T) {
	fn := javascriptFunction(t, appJS, "function evidenceNarrative(")
	suppressed := strings.Index(fn, "eligibility==='SUPPRESSED'")
	stage := strings.Index(fn, "evidenceStage")
	if suppressed == -1 || stage == -1 || suppressed > stage {
		t.Fatalf("SUPPRESSED must be evaluated before stage formatting:\n%s", fn)
	}
	for _, forbidden := range []string{
		"opportunityScore", "relativeStrength", "exposureBreadth", "competitionAcceleration",
		"trendScore", "row.value", "snapshot", "legacy", "Coverage", "Confidence",
	} {
		if strings.Contains(fn, forbidden) {
			t.Fatalf("narrative gate reads forbidden legacy/score source %q:\n%s", forbidden, fn)
		}
	}
	for _, required := range []string{
		"evidence.narrative_suppressed",
		"evidence.narrative_movement_degraded",
		"evidence.narrative_composition",
	} {
		if !strings.Contains(fn, required) {
			t.Fatalf("narrative branch missing %s:\n%s", required, fn)
		}
	}
}

func TestEvidenceConfidenceReadsOnlyC3AssessmentConfidence(t *testing.T) {
	fn := javascriptFunction(t, appJS, "function evidenceConfidence(")
	if !strings.Contains(fn, "assessment.confidence") || !strings.Contains(fn, "evidence.uncalibrated") {
		t.Fatalf("C3 evidence confidence source missing:\n%s", fn)
	}
	for _, forbidden := range []string{"row.confidence", "snapshot.confidence", "autopilotConfidence", "integrityConfidence", ".coverage", "Coverage"} {
		if strings.Contains(fn, forbidden) {
			t.Fatalf("evidence confidence falls back to legacy source %q:\n%s", forbidden, fn)
		}
	}
}

func TestEvidenceLocaleCopyExactAndParity(t *testing.T) {
	en := readLocaleMessages(t, "../i18n/locales/en.json")
	id := readLocaleMessages(t, "../i18n/locales/id.json")

	wantEN := map[string]string{
		"evidence.qualification":               "Evidence Qualification",
		"evidence.stage":                       "Evidence Stage",
		"evidence.eligibility":                 "Signal Eligibility",
		"evidence.uncalibrated":                "Uncalibrated (no score)",
		"evidence.narrative_composition":       "Current observed composition only.",
		"evidence.narrative_movement_degraded": "Early observed movement indication; evidence limitations apply.",
		"evidence.narrative_suppressed":        "Directional signal withheld because required evidence is unavailable or incompatible.",
	}
	wantID := map[string]string{
		"evidence.qualification":               "Kualifikasi Evidence",
		"evidence.stage":                       "Tahap Evidence",
		"evidence.eligibility":                 "Kelayakan Sinyal",
		"evidence.uncalibrated":                "Belum dikalibrasi (tanpa skor)",
		"evidence.narrative_composition":       "Hanya komposisi teramati saat ini.",
		"evidence.narrative_movement_degraded": "Indikasi awal pergerakan teramati; terdapat keterbatasan evidence.",
		"evidence.narrative_suppressed":        "Sinyal arah ditahan karena evidence wajib tidak tersedia atau tidak kompatibel.",
	}
	for key, want := range wantEN {
		if got := en[key]; got != want {
			t.Fatalf("English %s=%q want=%q", key, got, want)
		}
	}
	for key, want := range wantID {
		if got := id[key]; got != want {
			t.Fatalf("Indonesian %s=%q want=%q", key, got, want)
		}
	}

	enKeys := localePrefixKeys(en, "evidence.")
	idKeys := localePrefixKeys(id, "evidence.")
	if strings.Join(enKeys, "\n") != strings.Join(idKeys, "\n") {
		t.Fatalf("evidence locale key parity mismatch\nen=%v\nid=%v", enKeys, idKeys)
	}
}

func TestEvidenceRefreshIsReadOnlyAndBuildIsExplicitPOST(t *testing.T) {
	load := javascriptFunction(t, appJS, "async function loadEvidenceAssessments(")
	// The load call may include a query string; enforce GET semantics by endpoint presence and absence of method:POST.
	if !strings.Contains(load, "/api/evidence/assessments") {
		t.Fatalf("loadEvidenceAssessments missing GET endpoint:\n%s", load)
	}
	if strings.Contains(load, "method:'POST'") || strings.Contains(load, `method:"POST"`) {
		t.Fatalf("Refresh path must remain read-only:\n%s", load)
	}

	build := javascriptFunction(t, appJS, "async function buildEvidenceAssessments(")
	if !strings.Contains(build, "/api/evidence/assessments") || !strings.Contains(build, "method:'POST'") {
		t.Fatalf("explicit build POST missing:\n%s", build)
	}
	if !strings.Contains(build, "runId") || !strings.Contains(build, "loadEvidenceAssessments") {
		t.Fatalf("build must require runId and refresh after persistence:\n%s", build)
	}
}

func readLocaleMessages(t *testing.T, path string) map[string]string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var messages map[string]string
	if err := json.Unmarshal(b, &messages); err != nil {
		t.Fatal(err)
	}
	return messages
}

func localePrefixKeys(messages map[string]string, prefix string) []string {
	keys := make([]string, 0)
	for key := range messages {
		if strings.HasPrefix(key, prefix) {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	return keys
}

func sourceBetween(t *testing.T, source, startMarker, endMarker string) string {
	t.Helper()
	start := strings.Index(source, startMarker)
	if start == -1 {
		t.Fatalf("start marker not found: %s", startMarker)
	}
	end := strings.Index(source[start:], endMarker)
	if end == -1 {
		t.Fatalf("end marker not found after %s: %s", startMarker, endMarker)
	}
	return source[start : start+end]
}

func javascriptFunction(t *testing.T, source, marker string) string {
	t.Helper()
	start := strings.Index(source, marker)
	if start == -1 {
		t.Fatalf("function marker not found: %s", marker)
	}
	rest := source[start+len(marker):]
	nextSync := strings.Index(rest, "\nfunction ")
	nextAsync := strings.Index(rest, "\nasync function ")
	next := -1
	switch {
	case nextSync >= 0 && nextAsync >= 0 && nextSync < nextAsync:
		next = nextSync
	case nextAsync >= 0:
		next = nextAsync
	case nextSync >= 0:
		next = nextSync
	}
	if next == -1 {
		return source[start:]
	}
	return source[start : start+len(marker)+next]
}
