package ingest

import (
	"encoding/csv"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"marketsignallab/internal/domain"
)

var requiredEvidenceHeaders = []string{
	"identity_id", "observed_at", "source_type", "source_label", "metric", "value", "unit",
	"query", "sample_size", "reliability", "method", "notes",
}

func ParseEvidenceCSV(r io.Reader) ([]domain.EvidenceRecord, error) {
	cr := csv.NewReader(r)
	cr.TrimLeadingSpace = true
	header, err := cr.Read()
	if err != nil {
		return nil, fmt.Errorf("read header: %w", err)
	}
	idx := map[string]int{}
	for i, h := range header {
		idx[strings.TrimSpace(h)] = i
	}
	for _, h := range requiredEvidenceHeaders {
		if _, ok := idx[h]; !ok {
			return nil, fmt.Errorf("missing required header %q", h)
		}
	}

	out := []domain.EvidenceRecord{}
	rowNum := 1
	for {
		rowNum++
		row, err := cr.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("row %d: %w", rowNum, err)
		}
		get := func(name string) string {
			i := idx[name]
			if i >= len(row) {
				return ""
			}
			return strings.TrimSpace(row[i])
		}
		value, err := strconv.ParseFloat(get("value"), 64)
		if err != nil {
			return nil, fmt.Errorf("row %d: invalid value", rowNum)
		}
		sampleSize := 0
		if raw := get("sample_size"); raw != "" {
			sampleSize, err = strconv.Atoi(raw)
			if err != nil || sampleSize < 0 {
				return nil, fmt.Errorf("row %d: invalid sample_size", rowNum)
			}
		}
		observed := get("observed_at")
		if _, err := time.Parse(time.RFC3339, observed); err != nil {
			return nil, fmt.Errorf("row %d: observed_at must be RFC3339", rowNum)
		}
		unit := get("unit")
		if unit == "score_0_100" && (value < 0 || value > 100) {
			return nil, fmt.Errorf("row %d: score_0_100 out of range", rowNum)
		}
		e := domain.EvidenceRecord{
			ID: domain.NewID(), IdentityID: get("identity_id"), ObservedAt: observed,
			SourceType: get("source_type"), SourceLabel: get("source_label"), Metric: get("metric"),
			Value: value, Unit: unit, Query: get("query"), SampleSize: sampleSize,
			Reliability: get("reliability"), Method: get("method"), Notes: get("notes"),
		}
		if e.IdentityID == "" || e.SourceType == "" || e.SourceLabel == "" || e.Metric == "" || e.Unit == "" || e.Method == "" {
			return nil, fmt.Errorf("row %d: identity_id, source_type, source_label, metric, unit, and method are required", rowNum)
		}
		if e.Reliability == "" {
			e.Reliability = "unknown"
		}
		out = append(out, e)
	}
	return out, nil
}
