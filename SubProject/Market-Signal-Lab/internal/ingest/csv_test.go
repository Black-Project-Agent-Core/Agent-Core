package ingest

import (
	"strings"
	"testing"
)

func TestParseEvidenceCSV(t *testing.T) {
	in := `identity_id,observed_at,source_type,source_label,metric,value,unit,query,sample_size,reliability,method,notes
id1,2026-08-15T03:00:00Z,external_csv,Google Trends export,external_trend,79,score_0_100,fashion show,90,medium,manual_csv_import,Indonesia 90d
id1,2026-08-15T03:00:00Z,manual_research,Competitor review,supply_gap,64,score_0_100,fashion magazine,42,medium,manual_review,peer set
`
	xs, err := ParseEvidenceCSV(strings.NewReader(in))
	if err != nil {
		t.Fatal(err)
	}
	if len(xs) != 2 {
		t.Fatalf("records=%d", len(xs))
	}
	if xs[0].Metric != "external_trend" || xs[0].SampleSize != 90 || xs[1].Value != 64 {
		t.Fatalf("records=%+v", xs)
	}
}

func TestParseEvidenceCSVRejectsMissingRequiredHeader(t *testing.T) {
	in := `identity_id,metric,value
id1,demand_proxy,70
`
	if _, err := ParseEvidenceCSV(strings.NewReader(in)); err == nil {
		t.Fatal("expected missing header error")
	}
}

func TestParseEvidenceCSVRejectsInvalidScoreRange(t *testing.T) {
	in := `identity_id,observed_at,source_type,source_label,metric,value,unit,query,sample_size,reliability,method,notes
id1,2026-08-15T03:00:00Z,manual,x,demand_proxy,101,score_0_100,q,1,medium,test,n
`
	if _, err := ParseEvidenceCSV(strings.NewReader(in)); err == nil {
		t.Fatal("expected score range error")
	}
}
