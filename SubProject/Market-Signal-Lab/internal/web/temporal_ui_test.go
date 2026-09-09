package web

import (
	"strings"
	"testing"
)

func TestTemporalProductUIShowsReleaseTrendAndHistoryContracts(t *testing.T) {
	for _, want := range []string{
		`id="marketMapHistoryRows"`,
		`data-i18n="temporal.market_map_history"`,
		`temporal.first_release`,
		`temporal.last_seen_in_trend`,
		`temporal.release_unavailable`,
		`temporal.release_conflict`,
		`formatTemporalDate`,
		`renderProductTemporal`,
		`/api/autopilot/history`,
		`7D`, `30D`, `90D`,
	} {
		if !strings.Contains(uiSource, want) {
			t.Fatalf("missing temporal UI contract %q", want)
		}
	}
}

func TestTemporalDateFormatterUsesDayMonthYearAndDoesNotInventTimeForDateOnly(t *testing.T) {
	js := []string{"", appJS}
	for _, want := range []string{"padStart(2,'0')", "getDate()", "getMonth()+1", "getFullYear()", "precision==='date'"} {
		if !strings.Contains(js[1], want) {
			t.Fatalf("temporal formatter missing %q", want)
		}
	}
}
