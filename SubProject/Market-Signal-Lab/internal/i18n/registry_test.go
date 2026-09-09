package i18n

import (
	"reflect"
	"testing"
)

func TestSupportedLocalesOrderAndDefault(t *testing.T) {
	got := Supported()
	want := []Locale{
		{Code: "en", Label: "English", HTMLLang: "en"},
		{Code: "id", Label: "Indonesia", HTMLLang: "id"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("supported=%#v want=%#v", got, want)
	}
	if Default() != "en" {
		t.Fatalf("default=%q", Default())
	}
}

func TestNormalizeUsesEnglishFallback(t *testing.T) {
	cases := map[string]string{
		"":        "en",
		"EN":      "en",
		"en-US":   "en",
		"id":      "id",
		"id-ID":   "id",
		"unknown": "en",
	}
	for input, want := range cases {
		if got := Normalize(input); got != want {
			t.Fatalf("Normalize(%q)=%q want=%q", input, got, want)
		}
	}
}

func TestDictionaryRejectsUnknownLocale(t *testing.T) {
	if _, err := Dictionary("fr"); err == nil {
		t.Fatal("expected unknown locale error")
	}
}

func TestEnglishAndIndonesiaHaveExactKeyParity(t *testing.T) {
	en, err := Dictionary("en")
	if err != nil {
		t.Fatal(err)
	}
	id, err := Dictionary("id")
	if err != nil {
		t.Fatal(err)
	}
	if len(en) == 0 {
		t.Fatal("english dictionary is empty")
	}
	if len(en) != len(id) {
		t.Fatalf("key counts differ: en=%d id=%d", len(en), len(id))
	}
	for key := range en {
		if _, ok := id[key]; !ok {
			t.Fatalf("indonesia missing key %q", key)
		}
	}
	for key := range id {
		if _, ok := en[key]; !ok {
			t.Fatalf("english missing key %q", key)
		}
	}
}

func TestTranslateFallsBackToEnglishAndInterpolates(t *testing.T) {
	got := Translate("id", "dynamic.imported_rows", map[string]string{"count": "7"})
	if got != "7 baris berhasil diimpor." {
		t.Fatalf("translated=%q", got)
	}
	fallback := Translate("id", "dynamic.english_only_test", nil)
	if fallback != "English fallback works" {
		t.Fatalf("fallback=%q", fallback)
	}
	missing := Translate("id", "missing.key", nil)
	if missing != "missing.key" {
		t.Fatalf("missing=%q", missing)
	}
}

func TestConsensusTerminologyExistsInBothLocales(t *testing.T) {
	keys := []string{"consensus.market_consensus", "consensus.market_ambiguity", "consensus.item_consensus", "consensus.concept_consensus", "consensus.ranking_volatility", "consensus.selection_probability", "consensus.capture_visible_ranking", "consensus.public_context", "consensus.subscriber_context", "consensus.pair_not_comparable"}
	for _, lang := range []string{"en", "id"} {
		dict, err := Dictionary(lang)
		if err != nil {
			t.Fatal(err)
		}
		for _, key := range keys {
			if dict[key] == "" {
				t.Fatalf("lang=%s missing=%s", lang, key)
			}
		}
	}
}

func TestSecureCredentialTerminologyExistsInBothLocales(t *testing.T) {
	keys := []string{
		"autopilot.configured",
		"autopilot.runtime_override",
		"autopilot.credential_id",
		"autopilot.last_verified",
		"autopilot.replace_api_key",
		"autopilot.connect_or_replace",
		"autopilot.remove_credential",
		"autopilot.first_setup_title",
		"autopilot.first_setup_desc",
		"autopilot.verify_continue",
		"autopilot.network_unavailable_desc",
		"autopilot.credential_store_desc",
		"autopilot.provider_response_desc",
		"autopilot.observe_uses_saved_credential",
	}
	for _, lang := range []string{"en", "id"} {
		dict, err := Dictionary(lang)
		if err != nil {
			t.Fatal(err)
		}
		for _, key := range keys {
			if dict[key] == "" {
				t.Fatalf("lang=%s missing secure credential key %q", lang, key)
			}
		}
	}
}

func TestC2SemanticTerminologyExactValuesInBothLocales(t *testing.T) {
	en := map[string]string{
		"semantic.capped_composition_concentration":  "Capped Composition Concentration",
		"semantic.catalog_insight_score":             "Catalog Insight Score",
		"semantic.competition_momentum":              "Competition Momentum",
		"semantic.composition_weighting_gap":         "Composition Weighting Gap",
		"semantic.directional_breadth":               "Directional Breadth",
		"semantic.legacy_no_comparable_direction":    "Legacy v0.1 value; no comparable products are available for directional interpretation.",
		"semantic.mean_eligible_segment_composition": "Mean Eligible Segment Composition",
		"semantic.minimum_catalog_insight_score":     "Minimum Catalog Insight Score",
		"semantic.minimum_product_insight_score":     "Minimum Product Insight Score",
		"semantic.observed_new_supply_growth":        "Observed New-Supply Growth",
		"semantic.observed_new_supply_momentum":      "Observed New-Supply Momentum",
		"semantic.observed_segment_composition":      "Observed Segment Composition",
		"semantic.peer_relative_rank":                "Peer Relative Rank",
		"semantic.product_insight_score":             "Product Insight Score",
	}
	id := map[string]string{
		"semantic.capped_composition_concentration":  "Konsentrasi Komposisi Berbatas",
		"semantic.catalog_insight_score":             "Skor Insight Katalog",
		"semantic.competition_momentum":              "Momentum Persaingan Teramati",
		"semantic.composition_weighting_gap":         "Selisih Pembobotan Komposisi",
		"semantic.directional_breadth":               "Keluasan Arah Produk",
		"semantic.legacy_no_comparable_direction":    "Nilai kompatibilitas v0.1; belum ada produk pembanding untuk interpretasi arah.",
		"semantic.mean_eligible_segment_composition": "Rata-rata Komposisi Segmen Layak",
		"semantic.minimum_catalog_insight_score":     "Skor Insight Katalog Minimum",
		"semantic.minimum_product_insight_score":     "Skor Insight Produk Minimum",
		"semantic.observed_new_supply_growth":        "Pertumbuhan Pasokan Baru Teramati",
		"semantic.observed_new_supply_momentum":      "Momentum Pasokan Baru Teramati",
		"semantic.observed_segment_composition":      "Komposisi Segmen Teramati",
		"semantic.peer_relative_rank":                "Peringkat Relatif Kelompok Pembanding",
		"semantic.product_insight_score":             "Skor Insight Produk",
	}
	if len(en) != 14 {
		t.Fatalf("expected 14 canonical semantic.* keys, got %d", len(en))
	}
	cases := []struct {
		lang string
		want map[string]string
	}{{"en", en}, {"id", id}}
	for _, c := range cases {
		dict, err := Dictionary(c.lang)
		if err != nil {
			t.Fatal(err)
		}
		for key, want := range c.want {
			if got := dict[key]; got != want {
				t.Fatalf("lang=%s key=%s: got %q want %q", c.lang, key, got, want)
			}
		}
	}
}
