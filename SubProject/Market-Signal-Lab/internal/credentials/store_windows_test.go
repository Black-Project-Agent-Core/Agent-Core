//go:build windows

package credentials

import (
	"fmt"
	"os"
	"testing"
	"time"
)

func TestWindowsCredentialManager(t *testing.T) {
	if os.Getenv("MSL_TEST_WINDOWS_CREDENTIAL_MANAGER") != "1" {
		t.Skip("set MSL_TEST_WINDOWS_CREDENTIAL_MANAGER=1 to run native Credential Manager round-trip")
	}
	store := NewSystemStore()
	target := fmt.Sprintf("MarketSignalLab/Test/%d", time.Now().UnixNano())
	defer func() { _ = store.Delete(target) }()
	const canary = "MSL_TEST_WINDOWS_CREDENTIAL_CANARY_7F83"

	if err := store.Write(target, canary); err != nil {
		t.Fatal(err)
	}
	got, found, err := store.Read(target)
	if err != nil {
		t.Fatal(err)
	}
	if !found || got != canary {
		t.Fatalf("found=%v secret matches=%v", found, got == canary)
	}
	if err := store.Delete(target); err != nil {
		t.Fatal(err)
	}
	_, found, err = store.Read(target)
	if err != nil {
		t.Fatal(err)
	}
	if found {
		t.Fatal("credential still present after delete")
	}
}
