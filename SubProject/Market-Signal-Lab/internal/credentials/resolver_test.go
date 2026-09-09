package credentials

import (
	"errors"
	"strings"
	"testing"
)

type fakeSecretStore struct {
	secret string
	found  bool
	err    error
	reads  int
}

func (s *fakeSecretStore) Read(string) (string, bool, error) {
	s.reads++
	return s.secret, s.found, s.err
}
func (s *fakeSecretStore) Write(string, string) error { return nil }
func (s *fakeSecretStore) Delete(string) error        { return nil }

func TestResolverEnvironmentOverrideWins(t *testing.T) {
	store := &fakeSecretStore{secret: "stored-secret", found: true}
	resolver := NewResolver(store, func(name string) string {
		if name != DefaultEnvName {
			t.Fatalf("env name=%q", name)
		}
		return "  env-secret  "
	}, "", "")

	got, err := resolver.Resolve()
	if err != nil {
		t.Fatal(err)
	}
	if got.Token != "env-secret" || got.Source != SourceEnvironment {
		t.Fatalf("resolved=%+v", got)
	}
	if got.Fingerprint != Fingerprint("env-secret") {
		t.Fatalf("fingerprint=%q", got.Fingerprint)
	}
	if store.reads != 0 {
		t.Fatalf("store reads=%d; environment override must short-circuit", store.reads)
	}
}

func TestResolverEmptyEnvironmentFallsThroughToCredentialStore(t *testing.T) {
	store := &fakeSecretStore{secret: "  stored-secret  ", found: true}
	resolver := NewResolver(store, func(string) string { return "  " }, "CUSTOM_ENV", "Custom/Target")

	got, err := resolver.Resolve()
	if err != nil {
		t.Fatal(err)
	}
	if got.Token != "stored-secret" || got.Source != SourceCredentialManager {
		t.Fatalf("resolved=%+v", got)
	}
	if store.reads != 1 {
		t.Fatalf("store reads=%d", store.reads)
	}
}

func TestResolverMissingStoreReturnsErrNotConfigured(t *testing.T) {
	resolver := NewResolver(&fakeSecretStore{}, func(string) string { return "" }, "", "")
	_, err := resolver.Resolve()
	if !errors.Is(err, ErrNotConfigured) {
		t.Fatalf("err=%v", err)
	}
}

func TestResolverStoreErrorIsPropagated(t *testing.T) {
	boom := errors.New("vault read failed")
	resolver := NewResolver(&fakeSecretStore{err: boom}, func(string) string { return "" }, "", "")
	_, err := resolver.Resolve()
	if !errors.Is(err, boom) {
		t.Fatalf("err=%v", err)
	}
}

func TestFingerprintIsStableAndDoesNotContainTokenSubstring(t *testing.T) {
	token := "MSL_TEST_SECRET_7F83C91A"
	a := Fingerprint(token)
	b := Fingerprint("  " + token + "  ")
	if a != b {
		t.Fatalf("fingerprints differ: %q != %q", a, b)
	}
	if len(a) != 9 || a[4] != '-' {
		t.Fatalf("fingerprint format=%q", a)
	}
	if strings.Contains(strings.ToUpper(a), strings.ToUpper(token[:4])) || strings.Contains(a, token) {
		t.Fatalf("fingerprint leaks token substring: %q", a)
	}
}

func TestResolverEnvironmentOverrideBypassesStoreError(t *testing.T) {
	store := &fakeSecretStore{err: errors.New("credential store unavailable")}
	resolver := NewResolver(store, func(string) string { return "env-secret" }, "", "")
	got, err := resolver.Resolve()
	if err != nil {
		t.Fatal(err)
	}
	if got.Token != "env-secret" || got.Source != SourceEnvironment {
		t.Fatalf("resolved=%+v", got)
	}
	if store.reads != 0 {
		t.Fatalf("store reads=%d; environment override must bypass store errors", store.reads)
	}
}
