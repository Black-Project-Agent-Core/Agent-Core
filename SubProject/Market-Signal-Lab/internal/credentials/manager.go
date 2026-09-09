package credentials

import (
	"errors"
	"fmt"
	"os"
	"strings"
)

type Manager struct {
	resolver *Resolver
	store    SecretStore
	metadata *MetadataStore
	target   string
}

func NewManager(store SecretStore, dataRoot string, getenv func(string) string, envName string) *Manager {
	target := DefaultTarget
	return &Manager{
		resolver: NewResolver(store, getenv, envName, target),
		store:    store,
		metadata: NewMetadataStore(dataRoot),
		target:   target,
	}
}

func NewDefaultManager(dataRoot, envName string) *Manager {
	return NewManager(NewSystemStore(), dataRoot, os.Getenv, envName)
}

func (m *Manager) Resolve() (Resolved, error) {
	return m.resolver.Resolve()
}

func (m *Manager) ReadPersistent() (Resolved, bool, error) {
	secret, found, err := m.store.Read(m.target)
	if err != nil {
		return Resolved{}, false, err
	}
	secret = strings.TrimSpace(secret)
	if !found || secret == "" {
		return Resolved{}, false, nil
	}
	return Resolved{Token: secret, Source: SourceCredentialManager, Fingerprint: Fingerprint(secret)}, true, nil
}

func (m *Manager) ReplacePersistent(token string, metadata Metadata) (Resolved, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return Resolved{}, errors.New("credential secret is required")
	}
	oldSecret, oldFound, err := m.store.Read(m.target)
	if err != nil {
		return Resolved{}, err
	}
	oldUsable := oldFound && strings.TrimSpace(oldSecret) != ""
	oldMetadata, err := m.metadata.Read()
	if err != nil {
		return Resolved{}, err
	}
	_, statErr := os.Stat(m.metadata.Path())
	metadataExisted := statErr == nil
	if statErr != nil && !errors.Is(statErr, os.ErrNotExist) {
		return Resolved{}, statErr
	}

	if err := m.store.Write(m.target, token); err != nil {
		return Resolved{}, err
	}
	metadata.Configured = true
	metadata.CredentialFingerprint = Fingerprint(token)
	if err := m.metadata.Write(metadata); err != nil {
		rollbackErr := error(nil)
		if oldUsable {
			rollbackErr = m.store.Write(m.target, oldSecret)
		} else {
			rollbackErr = m.store.Delete(m.target)
		}
		var metadataRollbackErr error
		if metadataExisted {
			metadataRollbackErr = m.metadata.Write(oldMetadata)
		} else {
			metadataRollbackErr = m.metadata.Delete()
		}
		return Resolved{}, errors.Join(
			fmt.Errorf("persist credential metadata: %w", err),
			rollbackErr,
			metadataRollbackErr,
		)
	}
	return Resolved{Token: token, Source: SourceCredentialManager, Fingerprint: metadata.CredentialFingerprint}, nil
}

func (m *Manager) RemovePersistent() error {
	if err := m.store.Delete(m.target); err != nil {
		return err
	}
	return m.metadata.Delete()
}

func (m *Manager) WriteMetadata(metadata Metadata) error {
	return m.metadata.Write(metadata)
}

func (m *Manager) Metadata() (Metadata, error) {
	return m.metadata.Read()
}
