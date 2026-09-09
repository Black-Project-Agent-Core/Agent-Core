package web

import (
	"strings"
	"testing"
)

func TestC31EvidenceUISelectsRequirementsVersionAndKeepsSingleQualificationSurface(t *testing.T) {
	if strings.Count(indexHTML, `id="evidenceQualification"`) != 1 {
		t.Fatal("Evidence Qualification surface must remain singular")
	}
	for _, want := range []string{`id="evidenceRequirementsVersion"`, `value="msl-evidence-requirements/1"`, `value="msl-evidence-requirements/2"`} {
		if !strings.Contains(indexHTML, want) {
			t.Fatalf("missing UI marker %s", want)
		}
	}
	load := javascriptFunction(t, appJS, "async function loadEvidenceAssessments(")
	if !strings.Contains(load, "requirementsVersion") || strings.Contains(load, "method:'POST'") {
		t.Fatalf("refresh version/read-only contract missing:\n%s", load)
	}
	build := javascriptFunction(t, appJS, "async function buildEvidenceAssessments(")
	if !strings.Contains(build, "requirementsVersion") || !strings.Contains(build, "method:'POST'") {
		t.Fatalf("build version contract missing:\n%s", build)
	}
}

func TestC31EvidenceSignalLabelsAreLocalizedWithoutChangingNarrativeGate(t *testing.T) {
	fn := javascriptFunction(t, appJS, "function evidenceSignalLabel(")
	for _, signalID := range []string{
		"catalog.competition_acceleration.v0.2",
		"catalog.odmi.v0.2",
		"catalog.momentum_magnitude.v0.2",
		"catalog.peer_relative_rank_odmi.v0.2",
		"catalog.author_concentration_change.v0.2",
		"structural.product_mass_weighted_movement.v0.2",
		"structural.equal_segment_movement.v0.2",
		"structural.signed_movement_divergence.v0.2",
		"structural.divergence_magnitude.v0.2",
	} {
		if !strings.Contains(fn, signalID) {
			t.Fatalf("signal label missing %s", signalID)
		}
	}
	narrative := javascriptFunction(t, appJS, "function evidenceNarrative(")
	if strings.Index(narrative, "eligibility==='SUPPRESSED'") > strings.Index(narrative, "evidenceStage") {
		t.Fatal("suppression gate order changed")
	}
	for _, forbidden := range []string{"row.value", "opportunityScore", "trendScore", "Coverage", "Confidence"} {
		if strings.Contains(narrative, forbidden) {
			t.Fatalf("narrative leaked score source %s", forbidden)
		}
	}
}

func TestC31EvidenceSignalLocaleParity(t *testing.T) {
	en := readLocaleMessages(t, "../i18n/locales/en.json")
	id := readLocaleMessages(t, "../i18n/locales/id.json")
	keys := []string{
		"evidence.requirements_version", "evidence.version_c30", "evidence.version_c31",
		"evidence.signal_competition_acceleration_v02", "evidence.signal_odmi_v02", "evidence.signal_momentum_magnitude_v02",
		"evidence.signal_peer_relative_rank_odmi_v02", "evidence.signal_author_concentration_change_v02",
		"evidence.signal_product_mass_weighted_movement_v02", "evidence.signal_equal_segment_movement_v02",
		"evidence.signal_signed_movement_divergence_v02", "evidence.signal_divergence_magnitude_v02",
	}
	for _, key := range keys {
		if strings.TrimSpace(en[key]) == "" || strings.TrimSpace(id[key]) == "" {
			t.Fatalf("locale missing %s en=%q id=%q", key, en[key], id[key])
		}
	}
}
