package storage

import (
	"bufio"
	"encoding/json"
	"errors"
	"marketsignallab/internal/domain"
	"os"
	"path/filepath"
	"sort"
)

type ledgerFileSignature struct {
	exists        bool
	size          int64
	modifiedNanos int64
}

type productSnapshotReadIndex struct {
	signature ledgerFileSignature
	rows      []domain.ProductSnapshot
}

func fileSignature(path string) (ledgerFileSignature, error) {
	info, err := os.Stat(path)
	if errors.Is(err, os.ErrNotExist) {
		return ledgerFileSignature{}, nil
	}
	if err != nil {
		return ledgerFileSignature{}, err
	}
	return ledgerFileSignature{exists: true, size: info.Size(), modifiedNanos: info.ModTime().UnixNano()}, nil
}

func (s *Store) productSnapshotRowsIndexed() ([]domain.ProductSnapshot, error) {
	path := filepath.Join(s.root, "history", productSnapshotsFile)
	s.mu.Lock()
	defer s.mu.Unlock()

	sig, err := fileSignature(path)
	if err != nil {
		return nil, err
	}
	if s.productSnapshotIndex != nil && s.productSnapshotIndex.signature == sig {
		return append([]domain.ProductSnapshot(nil), s.productSnapshotIndex.rows...), nil
	}
	if !sig.exists {
		s.productSnapshotIndex = &productSnapshotReadIndex{signature: sig, rows: []domain.ProductSnapshot{}}
		return []domain.ProductSnapshot{}, nil
	}

	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	latest := map[string]domain.ProductSnapshot{}
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 1024), 10*1024*1024)
	for scanner.Scan() {
		if len(scanner.Bytes()) == 0 {
			continue
		}
		var row domain.ProductSnapshot
		if err := json.Unmarshal(scanner.Bytes(), &row); err != nil {
			return nil, err
		}
		latest[row.ID] = row
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	rows := make([]domain.ProductSnapshot, 0, len(latest))
	for _, row := range latest {
		rows = append(rows, row)
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].Window.CurrentEnd != rows[j].Window.CurrentEnd {
			return rows[i].Window.CurrentEnd < rows[j].Window.CurrentEnd
		}
		if rows[i].ProductID != rows[j].ProductID {
			return rows[i].ProductID < rows[j].ProductID
		}
		return rows[i].ModelVersion < rows[j].ModelVersion
	})
	s.productSnapshotIndex = &productSnapshotReadIndex{signature: sig, rows: rows}
	return append([]domain.ProductSnapshot(nil), rows...), nil
}
