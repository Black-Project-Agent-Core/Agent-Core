package storage

import (
	"os"
	"path/filepath"
)

func ResolveDataDirFrom(explicit, localAppData, fallback string) string {
	if explicit != "" {
		return filepath.Clean(explicit)
	}
	if localAppData != "" {
		return filepath.Join(filepath.Clean(localAppData), "MarketSignalLab")
	}
	return filepath.Join(filepath.Clean(fallback), "MarketSignalLab")
}

func ResolveDataDir(explicit string) string {
	fallback, err := os.UserConfigDir()
	if err != nil || fallback == "" {
		fallback = "."
	}
	return ResolveDataDirFrom(explicit, os.Getenv("LOCALAPPDATA"), fallback)
}
