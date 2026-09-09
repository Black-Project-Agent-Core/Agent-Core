package web

import (
	"strings"
	"testing"
)

func TestIndexContainsAlpha65SignalIntegritySurfaces(t *testing.T) {
	required := []string{
		"integrity-overview", "volume-weighted-index", "equal-sector-index", "data-quality-grade",
		"signal-quality-panel", "surface-breakdown", "segment-explorer", "score-provenance-modal", "why-this-score",
	}
	for _, value := range required {
		if !strings.Contains(uiSource, value) {
			t.Fatalf("missing %q", value)
		}
	}
}

func TestIndexDoesNotRenderSurfaceNamesAsCatalogRows(t *testing.T) {
	if strings.Contains(uiSource, `catalogName: row.surface`) {
		t.Fatal("surface must not be assigned as catalog name")
	}
}

func TestIndexUsesIntegrityReadEndpoints(t *testing.T) {
	for _, endpoint := range []string{
		"/api/integrity/sample-audit", "/api/integrity/indices", "/api/integrity/quality",
		"/api/integrity/surfaces", "/api/integrity/provenance", "/api/integrity/legacy-reviews",
	} {
		if !strings.Contains(uiSource, endpoint) {
			t.Fatalf("missing endpoint %q", endpoint)
		}
	}
}

func TestIntegrityScoreButtonsUseDefinedHelper(t *testing.T) {
	if strings.Contains(uiSource, "whyScoreButton(") {
		t.Fatal("UI calls undefined whyScoreButton helper; use integrityScoreButton")
	}
	if !strings.Contains(uiSource, "function integrityScoreButton(") {
		t.Fatal("integrityScoreButton helper is missing")
	}
}

func TestC2IntegrityUIUsesCompositionSemantics(t *testing.T) {
	for _, key := range []string{
		"semantic.observed_segment_composition",
		"semantic.capped_composition_concentration",
		"semantic.mean_eligible_segment_composition",
		"semantic.composition_weighting_gap",
	} {
		if !strings.Contains(uiSource, key) {
			t.Fatalf("missing structural semantic key %q", key)
		}
	}
	if strings.Contains(appJS, "formatPercent(row.opportunityScore||0)") {
		t.Fatal("structural UI still promotes legacy OpportunityScore")
	}
}

func TestC2IntegrityUIRendersLegacyNoteWhenNoComparableProducts(t *testing.T) {
	guarded := "row.snapshot.comparableProducts===0?esc(t('semantic.legacy_no_comparable_direction')):percent(semanticValue(row,'directionalBreadth',row.snapshot.exposureBreadth))"
	if !strings.Contains(appJS, guarded) {
		t.Fatalf("ranking rows must render semantic.legacy_no_comparable_direction when comparableProducts===0 before falling back to directionalBreadth; missing %q", guarded)
	}
}

func TestIndexLabelsFirstRunAsCurrentCompositionNotMarketDirection(t *testing.T) {
	for _, marker := range []string{
		`id="autopilotTemperatureLabel"`,
		`id="marketDirectionHeading"`,
		`direction.compositionOnly?t('integrity_ui.current_composition_index'):t('autopilot.market_direction')`,
	} {
		if !strings.Contains(uiSource, marker) {
			t.Fatalf("missing composition-stage marker %q", marker)
		}
	}
}
