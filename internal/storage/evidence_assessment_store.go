package storage

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"marketsignallab/internal/domain"
)

const signalEvidenceAssessmentsFile = "signal_evidence_assessments.jsonl"

func (s *Store) AppendSignalEvidenceAssessment(v domain.SignalEvidenceAssessmentRecord) error {
	return s.AppendSignalEvidenceAssessments([]domain.SignalEvidenceAssessmentRecord{v})
}

func (s *Store) AppendSignalEvidenceAssessments(rows []domain.SignalEvidenceAssessmentRecord) error {
	if len(rows) == 0 {
		return nil
	}
	for i := range rows {
		if err := validateSignalEvidenceAssessmentRecord(rows[i]); err != nil {
			return fmt.Errorf("signal evidence row %d: %w", i, err)
		}
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	path := filepath.Join(s.root, "history", signalEvidenceAssessmentsFile)
	existing, err := readSignalEvidenceAssessmentIDs(path)
	if err != nil {
		return err
	}
	batchSeen := make(map[string]struct{}, len(rows))
	accepted := make([]domain.SignalEvidenceAssessmentRecord, 0, len(rows))
	encoded := make([][]byte, 0, len(rows))
	for _, row := range rows {
		id := strings.TrimSpace(row.AssessmentID)
		if _, ok := existing[id]; ok {
			continue
		}
		if _, ok := batchSeen[id]; ok {
			continue
		}
		b, err := json.Marshal(row)
		if err != nil {
			return err
		}
		batchSeen[id] = struct{}{}
		accepted = append(accepted, row)
		encoded = append(encoded, b)
	}
	if len(accepted) == 0 {
		return nil
	}

	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	writer := bufio.NewWriterSize(f, 256*1024)
	fail := func(err error) error {
		_ = f.Close()
		return err
	}
	for _, b := range encoded {
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
	return f.Close()
}

func (s *Store) SignalEvidenceAssessments(filter domain.SignalEvidenceAssessmentFilter) ([]domain.SignalEvidenceAssessmentRecord, error) {
	out := []domain.SignalEvidenceAssessmentRecord{}
	err := s.readJSONL(signalEvidenceAssessmentsFile, func(b []byte) error {
		var v domain.SignalEvidenceAssessmentRecord
		if err := json.Unmarshal(b, &v); err != nil {
			return err
		}
		if filter.RunID != "" && v.RunID != filter.RunID {
			return nil
		}
		if filter.EntityType != "" && v.EntityType != filter.EntityType {
			return nil
		}
		if filter.EntityID != "" && v.EntityID != filter.EntityID {
			return nil
		}
		if filter.SignalID != "" && v.SignalID != filter.SignalID {
			return nil
		}
		if filter.SignalModelVersion != "" && v.SignalModelVersion != filter.SignalModelVersion {
			return nil
		}
		if filter.RequirementsVersion != "" && v.RequirementsVersion != filter.RequirementsVersion {
			return nil
		}
		out = append(out, v)
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].AssessedAt != out[j].AssessedAt {
			return out[i].AssessedAt < out[j].AssessedAt
		}
		return out[i].AssessmentID < out[j].AssessmentID
	})
	return limitRows(out, filter.Limit), nil
}

func (s *Store) LatestSignalEvidenceAssessment(filter domain.SignalEvidenceAssessmentFilter) (domain.SignalEvidenceAssessmentRecord, bool, error) {
	filter.Limit = 0
	rows, err := s.SignalEvidenceAssessments(filter)
	if err != nil {
		return domain.SignalEvidenceAssessmentRecord{}, false, err
	}
	if len(rows) == 0 {
		return domain.SignalEvidenceAssessmentRecord{}, false, nil
	}
	return rows[len(rows)-1], true, nil
}

func validateSignalEvidenceAssessmentRecord(v domain.SignalEvidenceAssessmentRecord) error {
	id := strings.TrimSpace(v.AssessmentID)
	if id == "" {
		return errors.New("assessmentId is required")
	}
	if nested := strings.TrimSpace(v.Assessment.AssessmentID); nested != "" && nested != id {
		return fmt.Errorf("assessmentId %q does not match nested assessmentId %q", id, nested)
	}
	return nil
}

func readSignalEvidenceAssessmentIDs(path string) (map[string]struct{}, error) {
	ids := map[string]struct{}{}
	f, err := os.Open(path)
	if errors.Is(err, os.ErrNotExist) {
		return ids, nil
	}
	if err != nil {
		return nil, err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 1024), 10*1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var row domain.SignalEvidenceAssessmentRecord
		if err := json.Unmarshal([]byte(line), &row); err != nil {
			return nil, fmt.Errorf("read %s: %w", signalEvidenceAssessmentsFile, err)
		}
		id := strings.TrimSpace(row.AssessmentID)
		if id == "" {
			return nil, fmt.Errorf("read %s: assessmentId is required", signalEvidenceAssessmentsFile)
		}
		ids[id] = struct{}{}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return ids, nil
}
