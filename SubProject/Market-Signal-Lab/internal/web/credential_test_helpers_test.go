package web

import (
	"marketsignallab/internal/app"
	envatoconn "marketsignallab/internal/connectors/envato"
	credentialspkg "marketsignallab/internal/credentials"
	"marketsignallab/internal/storage"
	"path/filepath"
	"strings"
	"testing"
)

type webCredentialStore struct {
	secret string
	found  bool
}

func (s *webCredentialStore) Read(string) (string, bool, error) { return s.secret, s.found, nil }
func (s *webCredentialStore) Write(_ string, secret string) error {
	s.secret = secret
	s.found = true
	return nil
}
func (s *webCredentialStore) Delete(string) error {
	s.secret = ""
	s.found = false
	return nil
}

func newCredentialWebService(t *testing.T, client *envatoconn.Client, token string) (*app.Service, *storage.Store, *webCredentialStore) {
	t.Helper()
	st, err := storage.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	vault := &webCredentialStore{secret: strings.TrimSpace(token), found: strings.TrimSpace(token) != ""}
	manager := credentialspkg.NewManager(vault, st.Root(), func(string) string { return "" }, credentialspkg.DefaultEnvName)
	svc := app.NewWithEnvatoClientAndAnalyticsEngineAndCredentials(st, client, webHealthyAnalyticsEngine{}, manager)
	t.Cleanup(func() { _ = svc.Close() })
	return svc, st, vault
}
