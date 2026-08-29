package web

import (
	"bytes"
	"encoding/json"
	"marketsignallab/internal/app"
	"marketsignallab/internal/storage"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func newLocaleTestServer(t *testing.T) *Server {
	t.Helper()
	st, err := storage.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	return New(app.New(st))
}

func TestLocalesEndpointReturnsEnglishThenIndonesiaAndDefault(t *testing.T) {
	srv := newLocaleTestServer(t)
	r := httptest.NewRequest(http.MethodGet, "/api/locales", nil)
	w := httptest.NewRecorder()
	srv.Handler().ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	var payload struct {
		Default string `json:"default"`
		Locales []struct {
			Code  string `json:"code"`
			Label string `json:"label"`
		} `json:"locales"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload.Default != "en" {
		t.Fatalf("default=%q", payload.Default)
	}
	if len(payload.Locales) != 2 || payload.Locales[0].Code != "en" || payload.Locales[0].Label != "English" || payload.Locales[1].Code != "id" || payload.Locales[1].Label != "Indonesia" {
		t.Fatalf("locales=%#v", payload.Locales)
	}
}

func TestLocaleDictionaryEndpointReturnsMessages(t *testing.T) {
	srv := newLocaleTestServer(t)
	for _, code := range []string{"en", "id"} {
		r := httptest.NewRequest(http.MethodGet, "/api/locales/"+code, nil)
		w := httptest.NewRecorder()
		srv.Handler().ServeHTTP(w, r)
		if w.Code != http.StatusOK {
			t.Fatalf("code=%s status=%d body=%s", code, w.Code, w.Body.String())
		}
		if !bytes.Contains(w.Body.Bytes(), []byte(`"messages"`)) || !bytes.Contains(w.Body.Bytes(), []byte(`"dynamic.imported_rows"`)) {
			t.Fatalf("code=%s body=%s", code, w.Body.String())
		}
	}
}

func TestLocaleDictionaryEndpointRejectsUnknownLocale(t *testing.T) {
	srv := newLocaleTestServer(t)
	r := httptest.NewRequest(http.MethodGet, "/api/locales/fr", nil)
	w := httptest.NewRecorder()
	srv.Handler().ServeHTTP(w, r)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	if !bytes.Contains(w.Body.Bytes(), []byte("unsupported locale")) {
		t.Fatalf("body=%s", w.Body.String())
	}
}

func TestLocaleEndpointsAreReadOnly(t *testing.T) {
	srv := newLocaleTestServer(t)
	for _, path := range []string{"/api/locales", "/api/locales/en"} {
		r := httptest.NewRequest(http.MethodPost, path, bytes.NewBufferString(`{}`))
		w := httptest.NewRecorder()
		srv.Handler().ServeHTTP(w, r)
		if w.Code != http.StatusMethodNotAllowed {
			t.Fatalf("path=%s status=%d", path, w.Code)
		}
	}
}
