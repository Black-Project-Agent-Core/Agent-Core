package web

import (
	"strings"
	"testing"
)

func TestC2RankingAndExplorerUseDefensibleSemanticLabels(t *testing.T) {
	required := []string{
		"semantic.product_insight_score", "semantic.catalog_insight_score",
		"semantic.peer_relative_rank", "semantic.directional_breadth",
		"semantic.observed_new_supply_momentum", "semantic.competition_momentum",
	}
	for _, key := range required {
		if !strings.Contains(uiSource, key) {
			t.Fatalf("missing C2 UI key %q", key)
		}
	}
	for _, forbidden := range []string{
		"percent(row.snapshot.opportunityScore)",
		"percent(row.snapshot.relativeStrength)",
		"percent(row.snapshot.exposureBreadth)",
	} {
		if strings.Contains(appJS, forbidden) {
			t.Fatalf("legacy ranking presentation remains: %s", forbidden)
		}
	}
}

func TestC2CompetitionMomentumFallbackUsesCompetitionAcceleration(t *testing.T) {
	want := `semanticValue(row,'competitionMomentumPercent',row.snapshot.competitionAcceleration)`
	if !strings.Contains(appJS, want) {
		t.Fatalf("competitionMomentumPercent must fall back to snapshot.competitionAcceleration: missing %s", want)
	}
	forbidden := `semanticValue(row,'competitionMomentumPercent',row.snapshot.competitionMomentumIndex)`
	if strings.Contains(appJS, forbidden) {
		t.Fatalf("competitionMomentumPercent fallback must not use snapshot.competitionMomentumIndex: %s", forbidden)
	}
}

func TestC2ExplorerMinimumOpportunityFilterIDsPreserved(t *testing.T) {
	for _, want := range []string{
		`id="productExplorerMinOpportunity"`,
		`id="catalogExplorerMinOpportunity"`,
	} {
		if !strings.Contains(indexHTML, want) {
			t.Fatalf("machine filter id missing after semantic relabel: %s", want)
		}
	}
}

func TestC2SemanticValueHelperPrefersContractV2AndFallsBackToLegacy(t *testing.T) {
	if !strings.Contains(appJS, "SEMANTIC_CONTRACT_V2") || !strings.Contains(appJS, "function semanticValue(") {
		t.Fatal("app.js missing deterministic semanticValue helper")
	}
}

func TestC2OpportunitySectionNavigationAndCopyUntouched(t *testing.T) {
	for _, want := range []string{
		`id="opportunity"`,
		`data-i18n="static.market_opportunity"`,
		`data-i18n="static.opportunity_board"`,
	} {
		if !strings.Contains(indexHTML, want) {
			t.Fatalf("Market Opportunity subsystem marker missing: %s", want)
		}
	}
}

func TestC2ExplorerAndAutopilotRankingSurfacesUseInsightScoreLabels(t *testing.T) {
	for _, want := range []string{
		`<th class="priority-3" data-i18n="semantic.catalog_insight_score">Catalog Insight Score</th><th class="priority-3" data-i18n="static.direction">Direction</th><th class="priority-4" data-i18n="static.confidence">Confidence</th><th class="priority-4" data-i18n="static.coverage">Coverage</th><th class="priority-1" data-i18n="static.actions">Actions</th></tr></thead><tbody id="catalogExplorerRows">`,
		`<th class="priority-3" data-i18n="semantic.product_insight_score">Product Insight Score</th><th class="priority-4" data-i18n="static.direction">Direction</th><th class="priority-4" data-i18n="static.confidence">Confidence</th><th class="priority-1" data-i18n="static.actions">Actions</th></tr></thead><tbody id="productExplorerRows">`,
		`<select id="catalogExplorerSort"><option data-i18n="static.sort_name" value="name">Name</option><option data-i18n="static.sort_trend" selected="" value="trend">Trend</option><option data-i18n="semantic.catalog_insight_score" value="opportunity">Catalog Insight Score</option>`,
		`<select id="productExplorerSort"><option data-i18n="static.sort_name" value="name">Name</option><option data-i18n="static.sort_exposure" selected="" value="exposure">Exposure</option><option data-i18n="semantic.product_insight_score" value="opportunity">Product Insight Score</option>`,
		`<th class="priority-2" data-i18n="semantic.catalog_insight_score">Catalog Insight Score</th><th class="priority-2" data-i18n="static.direction">Direction</th><th class="priority-3" data-i18n="static.coverage">Coverage</th><th class="priority-1" data-i18n="static.actions">Action</th></tr></thead><tbody id="autopilotCatalogRows">`,
	} {
		if !strings.Contains(indexHTML, want) {
			t.Fatalf("missing C2 relabeled surface: %s", want)
		}
	}
	for _, forbidden := range []string{
		`data-i18n="static.opportunity">Opportunity</th><th class="priority-3" data-i18n="static.direction">Direction</th><th class="priority-4" data-i18n="static.confidence">Confidence</th><th class="priority-4" data-i18n="static.coverage">Coverage</th><th class="priority-1" data-i18n="static.actions">Actions</th></tr></thead><tbody id="catalogExplorerRows">`,
		`data-i18n="static.opportunity">Opportunity</th><th class="priority-4" data-i18n="static.direction">Direction</th><th class="priority-4" data-i18n="static.confidence">Confidence</th><th class="priority-1" data-i18n="static.actions">Actions</th></tr></thead><tbody id="productExplorerRows">`,
		`data-i18n="static.sort_opportunity" value="opportunity">Opportunity</option>`,
		`data-i18n="static.opportunity">Opportunity</th><th class="priority-2" data-i18n="static.direction">Direction</th><th class="priority-3" data-i18n="static.coverage">Coverage</th><th class="priority-1" data-i18n="static.actions">Action</th></tr></thead><tbody id="autopilotCatalogRows">`,
	} {
		if strings.Contains(indexHTML, forbidden) {
			t.Fatalf("legacy Opportunity label remains: %s", forbidden)
		}
	}
	// Legitimate separate Market Opportunity subsystem surfaces must keep static.opportunity.
	for _, want := range []string{
		`<th class="priority-2" data-i18n="static.opportunity">Opportunity</th><th class="priority-2" data-i18n="static.confidence">Confidence</th><th class="priority-3" data-i18n="static.direction">Direction</th><th class="priority-1" data-i18n="static.evidence">Evidence</th></tr></thead><tbody id="overviewRows">`,
		`<th class="priority-2" data-i18n="static.opportunity">Opportunity</th><th class="priority-2" data-i18n="static.confidence">Confidence</th><th class="priority-2" data-i18n="static.direction">Direction</th><th class="priority-3" data-i18n="static.model">Model</th><th class="priority-1" data-i18n="static.coverage">Coverage</th></tr></thead><tbody id="historyRows">`,
	} {
		if !strings.Contains(indexHTML, want) {
			t.Fatalf("legitimate Market Opportunity subsystem label was wrongly changed, missing: %s", want)
		}
	}
}

func TestC2RenderSourceProductRowUsesProductInsightScoreLabel(t *testing.T) {
	want := `esc(t('semantic.product_insight_score'))+': '+formatPercent(product.opportunityScore||0)`
	if !strings.Contains(appJS, want) {
		t.Fatalf("renderSourceProductRow must label product.opportunityScore with semantic.product_insight_score: missing %s", want)
	}
	forbidden := `esc(t('static.opportunity'))+': '+formatPercent(product.opportunityScore||0)`
	if strings.Contains(appJS, forbidden) {
		t.Fatalf("renderSourceProductRow must not use legacy static.opportunity label: %s", forbidden)
	}
	// renderProductDirectionCard's separate ProductDirectionCluster opportunity value must remain untouched.
	preserved := `formatPercent(row.opportunity)+'</b><span>'+esc(t('static.opportunity'))+'</span>`
	if !strings.Contains(appJS, preserved) {
		t.Fatalf("legitimate ProductDirectionCluster static.opportunity use was wrongly changed: missing %s", preserved)
	}
}

func TestC2RankingSectionFallbackCopyMatchesCorrectedEnglishLocale(t *testing.T) {
	const corrected = `Compare adjacent 7D, 30D, or 90D research windows. A high Trend Score means attention is moving. Product Insight Score and Catalog Insight Score are composite observed-market ranking signals — not entry timing or success probability.`
	marker := `data-i18n="static.compare_adjacent_7d_30d_or_90d_research_windows_a_high_trend_sco_308e810">`
	idx := strings.Index(indexHTML, marker)
	if idx == -1 {
		t.Fatal("ranking section fallback marker not found in indexHTML")
	}
	rest := indexHTML[idx+len(marker):]
	end := strings.Index(rest, "</p>")
	if end == -1 {
		t.Fatal("ranking section fallback closing </p> not found")
	}
	got := rest[:end]
	if got != corrected {
		t.Fatalf("ranking section fallback copy mismatch:\n got:  %q\n want: %q", got, corrected)
	}
	if strings.Contains(indexHTML, "entry conditions remain comparatively attractive") {
		t.Fatal("prohibited entry-conditions wording still present in indexHTML")
	}
}
