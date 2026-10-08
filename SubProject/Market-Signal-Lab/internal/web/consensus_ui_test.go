package web

import (
	"strings"
	"testing"
)

func TestConsensusPageContainsRequiredResponsiveSurfaces(t *testing.T) {
	required := []string{`id="consensus"`, `id="consensusContextHealth"`, `id="consensusOverall"`, `id="consensusAmbiguity"`, `id="consensusItemScore"`, `id="consensusConceptScore"`, `id="consensusVolatility"`, `id="consensusMatrix"`, `id="pairComparisonDialog"`, `id="capturePreviewDialog"`}
	for _, marker := range required {
		if !strings.Contains(uiSource, marker) {
			t.Fatalf("missing %s", marker)
		}
	}
}
func TestConsensusNavigationIsInMarketIntelligenceGroup(t *testing.T) {
	if !strings.Contains(indexHTML, `href="#consensus"`) || !strings.Contains(indexHTML, `consensus.market_consensus`) {
		t.Fatal("consensus navigation missing")
	}
}
func TestConsensusUIUsesTranslationKeysInsteadOfHardcodedBilingualCopy(t *testing.T) {
	for _, forbidden := range []string{"Konsensus Pasar</", "Ambiguitas Pasar</", "Probabilitas Seleksi Teramati</"} {
		if strings.Contains(indexHTML, forbidden) {
			t.Fatalf("hardcoded localized copy %s", forbidden)
		}
	}
}
