package web

import (
	"marketsignallab/internal/i18n"
	"net/http"
	"strings"
)

func (s *Server) locales(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	jsonOut(w, http.StatusOK, map[string]any{
		"default": i18n.Default(),
		"locales": i18n.Supported(),
	})
}

func (s *Server) localeDictionary(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	code := strings.TrimPrefix(r.URL.Path, "/api/locales/")
	code = strings.TrimSpace(code)
	if code == "" || strings.Contains(code, "/") {
		errOut(w, http.StatusBadRequest, errUnsupportedLocale(code))
		return
	}
	messages, err := i18n.Dictionary(code)
	if err != nil {
		errOut(w, http.StatusBadRequest, err)
		return
	}
	jsonOut(w, http.StatusOK, map[string]any{
		"code":     code,
		"fallback": i18n.Default(),
		"messages": messages,
	})
}

type unsupportedLocaleError string

func (e unsupportedLocaleError) Error() string { return "unsupported locale " + string(e) }
func errUnsupportedLocale(code string) error   { return unsupportedLocaleError(code) }
