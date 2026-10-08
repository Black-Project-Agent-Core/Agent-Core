package storage

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type PurgeReport struct {
	FilesRewritten int `json:"filesRewritten"`
	RemovedRecords int `json:"removedRecords"`
}

func legacyDemoIdentitySignature(v map[string]any) bool {
	return stringField(v, "theme") == "Fashion" &&
		stringField(v, "productType") == "Magazine Template" &&
		stringField(v, "subNiche") == "Fashion Show" &&
		stringField(v, "useCase") == "Event / Editorial" &&
		stringField(v, "audience") == "Fashion Brand / Designer"
}

func legacyDemoAnalysisSignature(v map[string]any, candidateIDs map[string]bool) string {
	id := stringField(v, "identityId")
	if !candidateIDs[id] || stringField(v, "modelVersion") != "0.1.0-preview" {
		return ""
	}
	n, ok := numberField(v, "opportunity")
	if !ok || n < 61.69 || n > 61.71 {
		return ""
	}
	return id
}

func stringField(v map[string]any, key string) string {
	s, _ := v[key].(string)
	return strings.TrimSpace(s)
}

func numberField(v map[string]any, key string) (float64, bool) {
	switch n := v[key].(type) {
	case float64:
		return n, true
	case json.Number:
		f, err := n.Float64()
		return f, err == nil
	default:
		return 0, false
	}
}

func decodeObject(line []byte) (map[string]any, bool) {
	dec := json.NewDecoder(bytes.NewReader(line))
	dec.UseNumber()
	var v map[string]any
	if err := dec.Decode(&v); err != nil {
		return nil, false
	}
	return v, true
}

func hasKnownDemoMarker(v any) bool {
	switch x := v.(type) {
	case map[string]any:
		for _, value := range x {
			if hasKnownDemoMarker(value) {
				return true
			}
		}
	case []any:
		for _, value := range x {
			if hasKnownDemoMarker(value) {
				return true
			}
		}
	case string:
		s := strings.TrimSpace(x)
		lower := strings.ToLower(s)
		return s == "Synthetic Demo" || lower == "synthetic_demo" ||
			strings.HasPrefix(lower, "demo-") ||
			strings.HasPrefix(lower, "synthetic-demo/") ||
			strings.HasPrefix(s, "DEMO —") ||
			strings.HasPrefix(s, "Demo Author")
	}
	return false
}

func containsAnyIdentity(v any, ids map[string]bool) bool {
	switch x := v.(type) {
	case map[string]any:
		for _, value := range x {
			if containsAnyIdentity(value, ids) {
				return true
			}
		}
	case []any:
		for _, value := range x {
			if containsAnyIdentity(value, ids) {
				return true
			}
		}
	case string:
		return ids[strings.TrimSpace(x)]
	}
	return false
}

func readObjectLines(path string) []map[string]any {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()
	out := []map[string]any{}
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 1024), 10*1024*1024)
	for sc.Scan() {
		if v, ok := decodeObject(sc.Bytes()); ok {
			out = append(out, v)
		}
	}
	return out
}

func (s *Store) confirmedLegacyDemoIdentityIDs() map[string]bool {
	candidates := map[string]bool{}
	for _, v := range readObjectLines(filepath.Join(s.root, "history", "identities.jsonl")) {
		if legacyDemoIdentitySignature(v) {
			if id := stringField(v, "id"); id != "" {
				candidates[id] = true
			}
		}
	}
	confirmed := map[string]bool{}
	for _, v := range readObjectLines(filepath.Join(s.root, "history", "analyses.jsonl")) {
		if id := legacyDemoAnalysisSignature(v, candidates); id != "" {
			confirmed[id] = true
		}
	}
	return confirmed
}

func rewriteWithoutSynthetic(path string, legacyIDs map[string]bool) (removed int, rewritten bool, err error) {
	input, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, err
	}

	kept := make([][]byte, 0)
	sc := bufio.NewScanner(input)
	sc.Buffer(make([]byte, 1024), 10*1024*1024)
	for sc.Scan() {
		raw := append([]byte(nil), sc.Bytes()...)
		v, ok := decodeObject(raw)
		if ok && (hasKnownDemoMarker(v) || containsAnyIdentity(v, legacyIDs)) {
			removed++
			continue
		}
		kept = append(kept, raw)
	}
	scanErr := sc.Err()
	closeErr := input.Close()
	if scanErr != nil {
		return 0, false, scanErr
	}
	if closeErr != nil {
		return 0, false, closeErr
	}
	if removed == 0 {
		return 0, false, nil
	}

	tmp := path + ".tmp"
	out, err := os.OpenFile(tmp, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
	if err != nil {
		return 0, false, err
	}
	for _, line := range kept {
		if _, err := out.Write(append(line, '\n')); err != nil {
			_ = out.Close()
			_ = os.Remove(tmp)
			return 0, false, err
		}
	}
	if err := out.Sync(); err != nil {
		_ = out.Close()
		_ = os.Remove(tmp)
		return 0, false, err
	}
	if err := out.Close(); err != nil {
		_ = os.Remove(tmp)
		return 0, false, err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return 0, false, err
	}
	return removed, true, nil
}

const migrationLegacySyntheticCleanupV1 = "legacy_synthetic_cleanup_v1"

func (s *Store) RunMigrations() (PurgeReport, error) {
	markerDir := filepath.Join(s.root, "config", "migrations")
	markerPath := filepath.Join(markerDir, migrationLegacySyntheticCleanupV1+".done")
	if _, err := os.Stat(markerPath); err == nil {
		return PurgeReport{}, nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return PurgeReport{}, err
	}
	report, err := s.purgeLegacySyntheticData()
	if err != nil {
		return report, err
	}
	if err := os.MkdirAll(markerDir, 0o755); err != nil {
		return report, err
	}
	tmp := markerPath + ".tmp"
	if err := os.WriteFile(tmp, []byte("completed\n"), 0o600); err != nil {
		return report, err
	}
	if err := os.Rename(tmp, markerPath); err != nil {
		_ = os.Remove(tmp)
		return report, err
	}
	return report, nil
}

func (s *Store) purgeLegacySyntheticData() (PurgeReport, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	legacyIDs := s.confirmedLegacyDemoIdentityIDs()
	paths := []string{}
	for _, dir := range []string{"history", "cache"} {
		entries, err := os.ReadDir(filepath.Join(s.root, dir))
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return PurgeReport{}, err
		}
		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(strings.ToLower(entry.Name()), ".jsonl") {
				continue
			}
			paths = append(paths, filepath.Join(s.root, dir, entry.Name()))
		}
	}
	sort.Strings(paths)

	report := PurgeReport{}
	for _, path := range paths {
		removed, rewritten, err := rewriteWithoutSynthetic(path, legacyIDs)
		if err != nil {
			return report, err
		}
		report.RemovedRecords += removed
		if rewritten {
			report.FilesRewritten++
		}
	}
	return report, nil
}

func (s *Store) legacySyntheticRecordCount() (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	legacyIDs := s.confirmedLegacyDemoIdentityIDs()
	count := 0
	for _, dir := range []string{"history", "cache"} {
		entries, err := os.ReadDir(filepath.Join(s.root, dir))
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return count, err
		}
		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(strings.ToLower(entry.Name()), ".jsonl") {
				continue
			}
			path := filepath.Join(s.root, dir, entry.Name())
			f, err := os.Open(path)
			if err != nil {
				return count, err
			}
			sc := bufio.NewScanner(f)
			sc.Buffer(make([]byte, 1024), 10*1024*1024)
			for sc.Scan() {
				if v, ok := decodeObject(sc.Bytes()); ok && (hasKnownDemoMarker(v) || containsAnyIdentity(v, legacyIDs)) {
					count++
				}
			}
			scanErr := sc.Err()
			_ = f.Close()
			if scanErr != nil {
				return count, scanErr
			}
		}
	}
	return count, nil
}
