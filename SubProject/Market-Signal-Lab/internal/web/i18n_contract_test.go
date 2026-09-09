package web

import (
	"marketsignallab/internal/i18n"
	"regexp"
	"strings"
	"testing"
)

func TestAllHTMLTranslationKeysExistInBothLocales(t *testing.T) {
	en, err := i18n.Dictionary("en")
	if err != nil {
		t.Fatal(err)
	}
	id, err := i18n.Dictionary("id")
	if err != nil {
		t.Fatal(err)
	}
	pattern := regexp.MustCompile(`data-i18n(?:-placeholder|-title)?="([^"]+)"`)
	staticHTML := indexHTML
	matches := pattern.FindAllStringSubmatch(staticHTML, -1)
	if len(matches) < 150 {
		t.Fatalf("only %d localized HTML markers; expected the complete dashboard", len(matches))
	}
	for _, match := range matches {
		key := match[1]
		if _, ok := en[key]; !ok {
			t.Errorf("English dictionary missing HTML key %q", key)
		}
		if _, ok := id[key]; !ok {
			t.Errorf("Indonesia dictionary missing HTML key %q", key)
		}
	}
}

func TestCommonStaticUICopyRequiresTranslationMarker(t *testing.T) {
	staticHTML := indexHTML
	// After mixed-content text is wrapped, these common leaf tags should carry
	// data-i18n whenever they contain human-readable copy.
	tags := []string{"h1", "h2", "h3", "p", "label", "button", "th", "option", "a", "small", "span", "div"}
	numericOnly := regexp.MustCompile(`^[\d—–-]+%?$`)
	for _, tagName := range tags {
		pattern := regexp.MustCompile(`(?is)<` + tagName + `([^>]*)>([^<]+)</` + tagName + `>`)
		for _, match := range pattern.FindAllStringSubmatch(staticHTML, -1) {
			attrs := match[1]
			text := strings.TrimSpace(match[2])
			if text == "" || text == ":" || numericOnly.MatchString(text) {
				continue
			}
			if strings.Contains(attrs, "data-i18n") || strings.Contains(attrs, "data-market-data") || strings.Contains(attrs, "data-i18n-dynamic") {
				continue
			}
			t.Errorf("static UI copy lacks localization marker: <%s%s>%s", tagName, attrs, text)
		}
	}
}

func TestAllPlaceholdersAreLocalizedOrExplicitlySourceLanguage(t *testing.T) {
	staticHTML := indexHTML
	pattern := regexp.MustCompile(`<[^>]+placeholder="([^"]+)"[^>]*>`)
	for _, match := range pattern.FindAllStringSubmatch(staticHTML, -1) {
		tag := match[0]
		if strings.Contains(tag, "data-i18n-placeholder=") || strings.Contains(tag, "data-source-language-placeholder=") {
			continue
		}
		t.Errorf("placeholder %q lacks localization or source-language marker", match[1])
	}
}

func TestDynamicUICopyUsesTranslationKeys(t *testing.T) {
	js := appJS
	forbidden := []string{
		"Create an identity first",
		"Create a catalog first",
		"No analyses yet.",
		"No queries yet.",
		"No observed products in this scope.",
		"No catalog ranking exists for this window.",
		"Observed ranking built",
		"Choose a CSV file first.",
		"Benchmark saved separately from the independent score.",
		"Comparison complete",
		"No history yet.",
	}
	for _, raw := range forbidden {
		if strings.Contains(js, raw) {
			t.Errorf("raw dynamic UI copy remains in JavaScript: %q", raw)
		}
	}
	for _, key := range []string{
		"dynamic.create_identity_first",
		"dynamic.no_analyses",
		"dynamic.ranking_built",
		"dynamic.choose_csv",
		"dynamic.comparison_complete",
		"warning.proxy_only",
	} {
		if !strings.Contains(js, "t('"+key+"'") && !strings.Contains(js, "t(\""+key+"\"") {
			t.Errorf("JavaScript missing translation-key usage %q", key)
		}
	}
	if !strings.Contains(js, "translatedEnum('direction'") {
		t.Error("JavaScript must resolve direction labels through the translation registry")
	}
}

func TestLocalizedSelectOptionsPreserveMachineValues(t *testing.T) {
	for _, marker := range []string{
		`<option data-i18n="static.envato_elements" value="Envato Elements">`,
		`<option data-i18n="static.envato_market" value="Envato Market">`,
		`<option data-i18n="static.demand_proxy" value="demand_proxy">`,
		`<option data-i18n="static.supply_gap" value="supply_gap">`,
		`<option data-i18n="static.market_momentum" value="market_momentum">`,
		`<option data-i18n="static.medium" value="medium">`,
		`<option data-i18n="static.rising" value="rising">`,
	} {
		if !strings.Contains(indexHTML, marker) {
			t.Errorf("localized option must preserve machine value: %s", marker)
		}
	}
}

func TestAutopilotInsightCardsTranslateLocaleNeutralCodes(t *testing.T) {
	js := appJS
	for _, want := range []string{
		"translatedEnum('autopilot_insight'",
		"translatedEnum('recommendation'",
		"translatedEnum('saturation'",
		"translatedEnum('severity'",
	} {
		if !strings.Contains(js, want) {
			t.Errorf("Autopilot UI missing translated code mapping %q", want)
		}
	}
	for _, forbidden := range []string{"esc(row.code)", "esc(row.recommendation)", "esc(row.severity)"} {
		if strings.Contains(js, forbidden) {
			t.Errorf("Autopilot UI still exposes locale-neutral code directly: %s", forbidden)
		}
	}
}
