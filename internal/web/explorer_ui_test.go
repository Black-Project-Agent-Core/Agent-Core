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

func TestHomeContainsAlpha6ExplorerWorkspace(t *testing.T) {
	st, _ := storage.Open(filepath.Join(t.TempDir(), "data"))
	srv := New(app.New(st))
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	w := httptest.NewRecorder()
	srv.Handler().ServeHTTP(w, r)
	body := append(w.Body.Bytes(), []byte(appJS)...)
	for _, want := range []string{
		`id="explorer"`, `id="explorerTabs"`, `data-explorer-tab="catalogs"`, `data-explorer-tab="products"`,
		`data-explorer-tab="authors"`, `data-explorer-tab="sessions"`, `data-explorer-tab="compare"`,
		`data-explorer-tab="watchlist"`, `data-explorer-tab="savedViews"`,
		`id="catalogExplorerText"`, `id="catalogExplorerDirection"`, `id="catalogExplorerMinTrend"`,
		`id="productExplorerText"`, `id="productExplorerCatalog"`, `id="productExplorerMinOpportunity"`,
		`id="authorExplorerText"`, `id="sessionExplorerStatus"`, `id="compareEntityType"`,
		`id="compareIds"`, `id="watchlistRows"`, `id="savedViewRows"`, `id="savedViewName"`,
		`/api/explorer/catalogs`, `/api/explorer/products`, `/api/explorer/authors`, `/api/explorer/sessions`,
		`/api/saved-views`, `/api/watchlist`, `/api/compare/catalogs`, `/api/compare/products`,
		`function switchExplorerTab`, `async function loadCatalogExplorer`, `async function loadProductExplorer`,
		`async function saveCurrentView`, `async function addToWatchlist`, `async function runComparison`,
	} {
		if !bytes.Contains(body, []byte(want)) {
			t.Fatalf("home missing Alpha 6 marker %q", want)
		}
	}
}

func TestAlpha6ExplorerStaticCopyIsLocalized(t *testing.T) {
	for _, marker := range []string{
		`data-i18n="static.explorer_watchlist"`, `data-i18n="static.alpha_6_explorer_watchlist"`, `data-i18n="static.catalog_explorer"`,
		`data-i18n="static.product_explorer"`, `data-i18n="static.author_structure"`,
		`data-i18n="static.research_session_explorer"`, `data-i18n="static.saved_views"`,
		`data-i18n="static.watchlist"`, `data-i18n="static.compare_items"`,
		`data-i18n="static.save_current_view"`, `t('static.add_to_watchlist')`,
	} {
		if !bytes.Contains([]byte(uiSource), []byte(marker)) {
			t.Fatalf("missing localized marker %q", marker)
		}
	}
}
