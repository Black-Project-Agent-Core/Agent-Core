package credentials

import (
	"errors"
	"os"
	"testing"
)

type memorySecretStore struct {
	secret     string
	found      bool
	readErr    error
	writeErr   error
	deleteErr  error
	writeCount int
}

func (s *memorySecretStore) Read(string) (string, bool, error) {
	if s.readErr != nil {
		return "", false, s.readErr
	}
	return s.secret, s.found, nil
}
func (s *memorySecretStore) Write(_ string, secret string) error {
	s.writeCount++
	if s.writeErr != nil {
		return s.writeErr
	}
	s.secret, s.found = secret, true
	return nil
}
func (s *memorySecretStore) Delete(string) error {
	if s.deleteErr != nil {
		return s.deleteErr
	}
	s.secret, s.found = "", false
	return nil
}

func TestManagerReplacePersistentWritesSecretAndMetadata(t *testing.T) {
	root := t.TempDir()
	vault := &memorySecretStore{}
	manager := NewManager(vault, root, func(string) string { return "" }, DefaultEnvName)
	meta := Metadata{Provider: "envato", LastVerifiedAt: "2026-08-18T01:00:00Z", LastStatus: "healthy"}

	got, err := manager.ReplacePersistent(" new-token ", meta)
	if err != nil {
		t.Fatal(err)
	}
	if got.Token != "new-token" || got.Source != SourceCredentialManager || got.Fingerprint != Fingerprint("new-token") {
		t.Fatalf("resolved=%+v", got)
	}
	if vault.secret != "new-token" || !vault.found {
		t.Fatalf("vault found=%v secret=%q", vault.found, vault.secret)
	}
	stored, err := manager.Metadata()
	if err != nil {
		t.Fatal(err)
	}
	if !stored.Configured || stored.CredentialFingerprint != Fingerprint("new-token") || stored.Provider != "envato" || stored.LastStatus != "healthy" {
		t.Fatalf("metadata=%+v", stored)
	}
}

func TestManagerFailedMetadataReplacementRestoresOldSecretAndMetadata(t *testing.T) {
	root := t.TempDir()
	vault := &memorySecretStore{secret: "old-token", found: true}
	manager := NewManager(vault, root, func(string) string { return "" }, DefaultEnvName)
	oldMeta := Metadata{Provider: "envato", Configured: true, CredentialFingerprint: Fingerprint("old-token"), LastStatus: "healthy"}
	if err := manager.metadata.Write(oldMeta); err != nil {
		t.Fatal(err)
	}
	manager.metadata.rename = func(string, string) error { return errors.New("injected metadata rename failure") }

	_, err := manager.ReplacePersistent("new-token", Metadata{Provider: "envato", LastStatus: "healthy"})
	if err == nil {
		t.Fatal("expected metadata failure")
	}
	if vault.secret != "old-token" || !vault.found {
		t.Fatalf("rollback failed: found=%v secret=%q", vault.found, vault.secret)
	}
	manager.metadata.rename = os.Rename
	gotMeta, readErr := manager.Metadata()
	if readErr != nil {
		t.Fatal(readErr)
	}
	if gotMeta != oldMeta {
		t.Fatalf("metadata changed after failed replacement: got=%+v want=%+v", gotMeta, oldMeta)
	}
}

func TestManagerFailedSecretWritePreservesOldSecret(t *testing.T) {
	boom := errors.New("vault write failed")
	vault := &memorySecretStore{secret: "old-token", found: true, writeErr: boom}
	manager := NewManager(vault, t.TempDir(), func(string) string { return "" }, DefaultEnvName)
	_, err := manager.ReplacePersistent("new-token", Metadata{Provider: "envato", LastStatus: "healthy"})
	if !errors.Is(err, boom) {
		t.Fatalf("err=%v", err)
	}
	if vault.secret != "old-token" {
		t.Fatalf("secret changed=%q", vault.secret)
	}
}

func TestManagerReadPersistentAndRemove(t *testing.T) {
	root := t.TempDir()
	vault := &memorySecretStore{secret: "stored-token", found: true}
	manager := NewManager(vault, root, func(string) string { return "" }, DefaultEnvName)
	if err := manager.metadata.Write(Metadata{Provider: "envato", Configured: true, CredentialFingerprint: Fingerprint("stored-token"), LastStatus: "healthy"}); err != nil {
		t.Fatal(err)
	}
	got, found, err := manager.ReadPersistent()
	if err != nil {
		t.Fatal(err)
	}
	if !found || got.Token != "stored-token" || got.Source != SourceCredentialManager {
		t.Fatalf("resolved=%+v found=%v", got, found)
	}
	if err := manager.RemovePersistent(); err != nil {
		t.Fatal(err)
	}
	if _, found, err := manager.ReadPersistent(); err != nil || found {
		t.Fatalf("persistent remains found=%v err=%v", found, err)
	}
	if _, err := os.Stat(manager.metadata.Path()); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("metadata still present err=%v", err)
	}
}

func TestManagerResolveUsesEnvironmentOverrideWithoutPersisting(t *testing.T) {
	vault := &memorySecretStore{secret: "stored-token", found: true}
	manager := NewManager(vault, t.TempDir(), func(string) string { return "override-token" }, DefaultEnvName)
	got, err := manager.Resolve()
	if err != nil {
		t.Fatal(err)
	}
	if got.Token != "override-token" || got.Source != SourceEnvironment {
		t.Fatalf("resolved=%+v", got)
	}
	if vault.secret != "stored-token" {
		t.Fatalf("persistent credential overwritten=%q", vault.secret)
	}
}

func TestManagerFailedMetadataReplacementTreatsEmptyOldCredentialAsAbsent(t *testing.T) {
	root := t.TempDir()
	vault := &memorySecretStore{secret: "", found: true}
	manager := NewManager(vault, root, func(string) string { return "" }, DefaultEnvName)
	manager.metadata.rename = func(string, string) error { return errors.New("injected metadata rename failure") }

	_, err := manager.ReplacePersistent("new-token", Metadata{Provider: "envato", LastStatus: "healthy"})
	if err == nil {
		t.Fatal("expected metadata failure")
	}
	if vault.found || vault.secret != "" {
		t.Fatalf("new secret was not removed: found=%v secret=%q", vault.found, vault.secret)
	}
}

func TestManagerWriteMetadataDoesNotRewriteSecret(t *testing.T) {
	vault := &memorySecretStore{secret: "stored-token", found: true}
	manager := NewManager(vault, t.TempDir(), func(string) string { return "" }, DefaultEnvName)
	meta := Metadata{Provider: "envato", Configured: true, CredentialFingerprint: Fingerprint("stored-token"), LastStatus: "needs_attention"}
	if err := manager.WriteMetadata(meta); err != nil {
		t.Fatal(err)
	}
	if vault.writeCount != 0 || vault.secret != "stored-token" {
		t.Fatalf("secret rewritten count=%d secret=%q", vault.writeCount, vault.secret)
	}
	got, err := manager.Metadata()
	if err != nil {
		t.Fatal(err)
	}
	if got != meta {
		t.Fatalf("metadata=%+v want=%+v", got, meta)
	}
}
