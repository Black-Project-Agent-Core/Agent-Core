package ranking

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"marketsignallab/internal/domain"
	"time"
)

func NewWindow(asOf time.Time, days int) (domain.RankingWindow, error) {
	if days < 7 || days > 365 {
		return domain.RankingWindow{}, errors.New("windowDays must be between 7 and 365")
	}
	asOf = asOf.UTC()
	currentStart := asOf.AddDate(0, 0, -days)
	previousStart := currentStart.AddDate(0, 0, -days)
	return domain.RankingWindow{
		Days:          days,
		CurrentStart:  currentStart.Format(time.RFC3339),
		CurrentEnd:    asOf.Format(time.RFC3339),
		PreviousStart: previousStart.Format(time.RFC3339),
		PreviousEnd:   currentStart.Format(time.RFC3339),
	}, nil
}

func parseTimestamp(raw string) (time.Time, bool) {
	t, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return time.Time{}, false
	}
	return t.UTC(), true
}

func InCurrentWindow(raw string, w domain.RankingWindow) bool {
	t, ok := parseTimestamp(raw)
	if !ok {
		return false
	}
	start, errStart := time.Parse(time.RFC3339, w.CurrentStart)
	end, errEnd := time.Parse(time.RFC3339, w.CurrentEnd)
	if errStart != nil || errEnd != nil {
		return false
	}
	return (t.After(start) || t.Equal(start)) && (t.Before(end) || t.Equal(end))
}

func InPreviousWindow(raw string, w domain.RankingWindow) bool {
	t, ok := parseTimestamp(raw)
	if !ok {
		return false
	}
	start, errStart := time.Parse(time.RFC3339, w.PreviousStart)
	end, errEnd := time.Parse(time.RFC3339, w.PreviousEnd)
	if errStart != nil || errEnd != nil {
		return false
	}
	return (t.After(start) || t.Equal(start)) && t.Before(end)
}

func SnapshotID(subjectType, subjectID string, w domain.RankingWindow, modelVersion string) string {
	sum := sha256.Sum256([]byte(subjectType + "|" + subjectID + "|" + w.CurrentStart + "|" + w.CurrentEnd + "|" + modelVersion))
	return hex.EncodeToString(sum[:16])
}
