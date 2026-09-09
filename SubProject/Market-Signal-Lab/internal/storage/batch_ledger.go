package storage

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
)

func appendJSONLBatch[T any](s *Store, name string, rows []T) error {
	if len(rows) == 0 {
		return nil
	}
	encoded := make([][]byte, len(rows))
	for i, row := range rows {
		b, err := json.Marshal(row)
		if err != nil {
			return err
		}
		encoded[i] = b
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	path := filepath.Join(s.root, "history", name)
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	writer := bufio.NewWriterSize(f, 256*1024)
	for _, b := range encoded {
		if _, err := writer.Write(b); err != nil {
			_ = f.Close()
			return err
		}
		if err := writer.WriteByte('\n'); err != nil {
			_ = f.Close()
			return err
		}
	}
	if err := writer.Flush(); err != nil {
		_ = f.Close()
		return err
	}
	return f.Close()
}
