package app

import (
	envatoconn "marketsignallab/internal/connectors/envato"
	credentialspkg "marketsignallab/internal/credentials"
	"marketsignallab/internal/storage"
	"strings"
	"testing"
)

func newServiceWithCredentialForTest(t *testing.T, st *storage.Store, client *envatoconn.Client, engine *appTestEngine, token string) *Service {
	t.Helper()
	vault := &credentialMemoryStore{secret: strings.TrimSpace(token), found: strings.TrimSpace(token) != ""}
	manager := credentialspkg.NewManager(vault, st.Root(), func(string) string { return "" }, credentialspkg.DefaultEnvName)
	svc := NewWithEnvatoClientAndAnalyticsEngineAndCredentials(st, client, engine, manager)
	t.Cleanup(func() { _ = svc.Close() })
	return svc
}
