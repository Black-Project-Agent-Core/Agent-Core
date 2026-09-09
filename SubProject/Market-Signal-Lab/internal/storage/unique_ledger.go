package storage

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type ledgerIDIndex struct {
	ids          map[string]struct{}
	observedSize int64
}

func (s *Store) rebuildUniqueIDIndexLocked(name string) (*ledgerIDIndex, error) {
	path := filepath.Join(s.root, "history", name)
	info, err := os.Stat(path)
	if errors.Is(err, os.ErrNotExist) {
		idx := &ledgerIDIndex{ids: map[string]struct{}{}, observedSize: 0}
		s.uniqueIDIndexes[name] = idx
		return idx, nil
	}
	if err != nil {
		return nil, err
	}
	idx := &ledgerIDIndex{ids: map[string]struct{}{}, observedSize: info.Size()}
	if info.Size() == 0 {
		s.uniqueIDIndexes[name] = idx
		return idx, nil
	}
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 1024), 10*1024*1024)
	for scanner.Scan() {
		line := bytes.TrimSpace(scanner.Bytes())
		if len(line) == 0 {
			continue
		}
		var row struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(line, &row); err != nil {
			return nil, fmt.Errorf("rebuild unique index %s: %w", name, err)
		}
		if strings.TrimSpace(row.ID) != "" {
			idx.ids[row.ID] = struct{}{}
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	s.uniqueIDIndexes[name] = idx
	return idx, nil
}

func (s *Store) uniqueIDIndexLocked(name string) (*ledgerIDIndex, error) {
	path := filepath.Join(s.root, "history", name)
	size := int64(0)
	info, err := os.Stat(path)
	if err == nil {
		size = info.Size()
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	if idx, ok := s.uniqueIDIndexes[name]; ok && idx.observedSize == size {
		return idx, nil
	}
	delete(s.uniqueIDIndexes, name)
	return s.rebuildUniqueIDIndexLocked(name)
}

func appendUniqueJSONLBatch[T any](s *Store, name string, rows []T, getID func(T) string) error {
	if len(rows) == 0 {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	idx, err := s.uniqueIDIndexLocked(name)
	if err != nil {
		delete(s.uniqueIDIndexes, name)
		return err
	}
	accepted := make([]T, 0, len(rows))
	acceptedIDs := make([]string, 0, len(rows))
	batchSeen := make(map[string]struct{}, len(rows))
	for _, row := range rows {
		id := strings.TrimSpace(getID(row))
		if id == "" {
			delete(s.uniqueIDIndexes, name)
			return errors.New("unique JSONL record ID is required")
		}
		if _, exists := idx.ids[id]; exists {
			continue
		}
		if _, exists := batchSeen[id]; exists {
			continue
		}
		batchSeen[id] = struct{}{}
		accepted = append(accepted, row)
		acceptedIDs = append(acceptedIDs, id)
	}
	if len(accepted) == 0 {
		return nil
	}

	path := filepath.Join(s.root, "history", name)
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		delete(s.uniqueIDIndexes, name)
		return err
	}
	writer := bufio.NewWriterSize(f, 256*1024)
	fail := func(err error) error {
		_ = f.Close()
		delete(s.uniqueIDIndexes, name)
		return err
	}
	for _, row := range accepted {
		b, err := json.Marshal(row)
		if err != nil {
			return fail(err)
		}
		if _, err := writer.Write(b); err != nil {
			return fail(err)
		}
		if err := writer.WriteByte('\n'); err != nil {
			return fail(err)
		}
	}
	if err := writer.Flush(); err != nil {
		return fail(err)
	}
	if err := f.Close(); err != nil {
		delete(s.uniqueIDIndexes, name)
		return err
	}
	info, err := os.Stat(path)
	if err != nil {
		delete(s.uniqueIDIndexes, name)
		return err
	}
	for _, id := range acceptedIDs {
		idx.ids[id] = struct{}{}
	}
	idx.observedSize = info.Size()
	return nil
}
