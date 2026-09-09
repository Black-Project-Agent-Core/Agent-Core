package app

import (
	"context"
	analyticsenginepkg "marketsignallab/internal/analyticsengine"
	envatoconn "marketsignallab/internal/connectors/envato"
	credentialspkg "marketsignallab/internal/credentials"
	"marketsignallab/internal/storage"
	"time"
)

// NewWithCredentialManager is production construction with an explicit
// credential resolver/store. Go remains the only secret-owning boundary;
// the packaged Rust analytics runtime is unchanged.
func NewWithCredentialManager(store *storage.Store, manager *credentialspkg.Manager) *Service {
	runtime := analyticsenginepkg.NewProductionRuntime(context.Background(), "", 2*time.Second)
	return newServiceBaseWithCredentials(store, envatoconn.NewClient(), runtime, manager)
}

// NewWithEnvatoClientAndCredentialManager is production construction with a
// custom Envato client (for development endpoint overrides) plus an explicit
// credential resolver/store.
func NewWithEnvatoClientAndCredentialManager(store *storage.Store, client *envatoconn.Client, manager *credentialspkg.Manager) *Service {
	runtime := analyticsenginepkg.NewProductionRuntime(context.Background(), "", 2*time.Second)
	return newServiceBaseWithCredentials(store, client, runtime, manager)
}
