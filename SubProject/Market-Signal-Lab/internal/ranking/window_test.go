package ranking

import (
	"testing"
	"time"
)

func TestNewWindowBuildsAdjacentEqualPeriods(t *testing.T) {
	asOf := time.Date(2026, 8, 15, 0, 0, 0, 0, time.UTC)
	got, err := NewWindow(asOf, 30)
	if err != nil {
		t.Fatal(err)
	}

	if got.CurrentStart != "2026-07-16T00:00:00Z" || got.CurrentEnd != "2026-08-15T00:00:00Z" {
		t.Fatalf("current=%+v", got)
	}
	if got.PreviousStart != "2026-06-16T00:00:00Z" || got.PreviousEnd != "2026-07-16T00:00:00Z" {
		t.Fatalf("previous=%+v", got)
	}
	if !InCurrentWindow("2026-08-01T12:00:00Z", got) {
		t.Fatal("expected current observation")
	}
	if !InCurrentWindow("2026-07-16T00:00:00Z", got) {
		t.Fatal("current start must belong to current window")
	}
	if !InPreviousWindow("2026-07-15T23:59:59Z", got) {
		t.Fatal("expected previous observation")
	}
}

func TestNewWindowRejectsUnsafeRange(t *testing.T) {
	asOf := time.Date(2026, 8, 15, 0, 0, 0, 0, time.UTC)
	if _, err := NewWindow(asOf, 6); err == nil {
		t.Fatal("expected days >= 7 error")
	}
	if _, err := NewWindow(asOf, 366); err == nil {
		t.Fatal("expected days <= 365 error")
	}
}
