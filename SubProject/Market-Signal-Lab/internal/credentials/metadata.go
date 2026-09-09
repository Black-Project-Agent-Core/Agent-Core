package credentials

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

type Metadata struct {
	Provider              string `json:"provider"`
	Configured            bool   `json:"configured"`
	CredentialFingerprint string `json:"credentialFingerprint,omitempty"`
	LastVerifiedAt        string `json:"lastVerifiedAt,omitempty"`
	LastStatus            string `json:"lastStatus"`
}

type MetadataStore struct {
	path   string
	rename func(string, string) error
}

func NewMetadataStore(dataRoot string) *MetadataStore {
	return &MetadataStore{path: filepath.Join(dataRoot, "config", "connection.json"), rename: os.Rename}
}

func (s *MetadataStore) Path() string { return s.path }

func (s *MetadataStore) Read() (Metadata, error) {
	raw, err := os.ReadFile(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return Metadata{}, nil
	}
	if err != nil {
		return Metadata{}, err
	}
	var metadata Metadata
	if err := json.Unmarshal(raw, &metadata); err != nil {
		return Metadata{}, err
	}
	return metadata, nil
}

func (s *MetadataStore) Write(metadata Metadata) error {
	dir := filepath.Dir(s.path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		return err
	}
	raw = append(raw, '\n')

	tmp, err := os.CreateTemp(dir, ".connection-*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	cleanup := true
	defer func() {
		_ = tmp.Close()
		if cleanup {
			_ = os.Remove(tmpPath)
		}
	}()
	if _, err := tmp.Write(raw); err != nil {
		return err
	}
	if err := tmp.Sync(); err != nil {
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	rename := s.rename
	if rename == nil {
		rename = os.Rename
	}
	if err := rename(tmpPath, s.path); err != nil {
		return err
	}
	cleanup = false
	return nil
}

func (s *MetadataStore) Delete() error {
	err := os.Remove(s.path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}
