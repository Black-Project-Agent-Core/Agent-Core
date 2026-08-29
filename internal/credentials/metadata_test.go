package credentials

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMetadataReadAbsentReturnsZeroValue(t *testing.T) {
	store := NewMetadataStore(t.TempDir())
	got, err := store.Read()
	if err != nil {
		t.Fatal(err)
	}
	if got.Configured || got.Provider != "" || got.CredentialFingerprint != "" || got.LastVerifiedAt != "" || got.LastStatus != "" {
		t.Fatalf("metadata=%+v", got)
	}
}

func TestMetadataWriteReadRoundTrip(t *testing.T) {
	root := t.TempDir()
	store := NewMetadataStore(root)
	want := Metadata{
		Provider:              "envato",
		Configured:            true,
		CredentialFingerprint: "A91F-27C4",
		LastVerifiedAt:        "2026-08-18T03:40:00+07:00",
		LastStatus:            "healthy",
	}
	if err := store.Write(want); err != nil {
		t.Fatal(err)
	}
	got, err := store.Read()
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("got=%+v want=%+v", got, want)
	}
	if gotPath := store.Path(); gotPath != filepath.Join(root, "config", "connection.json") {
		t.Fatalf("path=%q", gotPath)
	}
}

func TestMetadataReadCorruptJSONReturnsError(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "config", "connection.json")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(`{"provider":`), 0o600); err != nil {
		t.Fatal(err)
	}
	store := NewMetadataStore(root)
	if _, err := store.Read(); err == nil {
		t.Fatal("expected corrupt metadata error")
	}
}

func TestMetadataFileDoesNotContainCanaryToken(t *testing.T) {
	const canary = "MSL_TEST_SECRET_DO_NOT_LEAK_7F83C91A5E2D"
	root := t.TempDir()
	store := NewMetadataStore(root)
	metadata := Metadata{
		Provider:              "envato",
		Configured:            true,
		CredentialFingerprint: Fingerprint(canary),
		LastVerifiedAt:        "2026-08-18T03:40:00+07:00",
		LastStatus:            "healthy",
	}
	if err := store.Write(metadata); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(store.Path())
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), canary) {
		t.Fatalf("metadata leaked canary: %s", raw)
	}
}
