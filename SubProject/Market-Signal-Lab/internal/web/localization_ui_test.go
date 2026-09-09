package web

import (
	"bytes"
	"marketsignallab/internal/app"
	"marketsignallab/internal/storage"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func TestHomeContainsEnglishFirstLanguageSelector(t *testing.T) {
	st, _ := storage.Open(filepath.Join(t.TempDir(), "data"))
	srv := New(app.New(st))
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	w := httptest.NewRecorder()
	srv.Handler().ServeHTTP(w, r)
	body := append(w.Body.Bytes(), []byte(appJS)...)
	for _, want := range []string{
		`id="languageSelect"`,
		`data-i18n="ui.language"`,
		`data-i18n="static.english" value="en">English</option>`,
		`data-i18n="static.indonesia" value="id">Indonesia</option>`,
	} {
		if !bytes.Contains(body, []byte(want)) {
			t.Fatalf("home missing %q", want)
		}
	}
	if bytes.Index(body, []byte(`value="en">English</option>`)) > bytes.Index(body, []byte(`value="id">Indonesia</option>`)) {
		t.Fatal("English must be listed before Indonesia")
	}
}

func TestHomeContainsPersistedLocalizationRuntime(t *testing.T) {
	st, _ := storage.Open(filepath.Join(t.TempDir(), "data"))
	srv := New(app.New(st))
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	w := httptest.NewRecorder()
	srv.Handler().ServeHTTP(w, r)
	body := append(w.Body.Bytes(), []byte(appJS)...)
	for _, want := range []string{
		`const LANGUAGE_STORAGE_KEY='msl.language'`,
		`const FALLBACK_LANGUAGE='en'`,
		`async function loadLocale`,
		`async function setLanguage`,
		`function t(`,
		`function applyTranslations`,
		`function formatNumber`,
		`function formatPercent`,
		`function formatDate`,
		`localStorage.setItem(LANGUAGE_STORAGE_KEY`,
		`document.documentElement.lang=`,
	} {
		if !bytes.Contains(body, []byte(want)) {
			t.Fatalf("home missing localization runtime marker %q", want)
		}
	}
}

func TestHomeContainsBilingualAdvancedResearch(t *testing.T) {
	st, _ := storage.Open(filepath.Join(t.TempDir(), "data"))
	srv := New(app.New(st))
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	w := httptest.NewRecorder()
	srv.Handler().ServeHTTP(w, r)
	body := append(w.Body.Bytes(), []byte(appJS)...)
	for _, want := range []string{
		`id="advancedResearch"`,
		`id="scannerKeywords"`,
		`id="scannerSite"`,
		`id="scannerCategory"`,
		`id="scannerMaxPages"`,
		`id="scannerPageSize"`,
		`id="scannerRequestBudget"`,
		`id="scannerAutoRanking"`,
		`onclick="testEnvatoConnection()"`,
		`id="scannerForm"`,
		`id="scannerSessionRows"`,
		`/api/connections/envato/test`,
		`/api/scanner/envato/run`,
		`/api/scanner/sessions`,
		`data-i18n="autopilot.advanced_research"`,
		`data-i18n="static.alpha_6_advanced_research"`,
		`data-i18n="autopilot.uses_settings_token"`,
	} {
		if !bytes.Contains(body, []byte(want)) {
			t.Fatalf("home missing Alpha 6 Advanced Research marker %q", want)
		}
	}
	if bytes.Contains(body, []byte(`id="sourceToken"`)) || bytes.Contains(body, []byte(`name="token"`)) {
		t.Fatal("advanced research must use stored credentials instead of a plaintext token field")
	}
}
