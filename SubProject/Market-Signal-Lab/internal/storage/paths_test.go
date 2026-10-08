package storage

import (
	"path/filepath"
	"testing"
)

func TestResolveDataDirPrefersExplicitThenLocalAppData(t *testing.T) {
	got := ResolveDataDirFrom("C:/custom", "C:/Users/A/AppData/Local", "C:/fallback")
	if got != filepath.Clean("C:/custom") {
		t.Fatalf("explicit=%q", got)
	}
	got = ResolveDataDirFrom("", "C:/Users/A/AppData/Local", "C:/fallback")
	if got != filepath.Join(filepath.Clean("C:/Users/A/AppData/Local"), "MarketSignalLab") {
		t.Fatalf("local=%q", got)
	}
}
