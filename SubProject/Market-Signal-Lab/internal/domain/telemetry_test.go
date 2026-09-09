package domain

import (
	"bytes"
	"encoding/json"
	"reflect"
	"testing"
)

func TestScanTelemetryContractsExposeCanonicalStagesAndSafeJSON(t *testing.T) {
	want := []ScanStage{
		StagePreparingScanPlan,
		StageValidatingSources,
		StageLoadingCatalogStructure,
		StageMappingMarketSurfaces,
		StageNormalizingProducts,
		StageDeduplicating,
		StageTaxonomySegmentation,
		StageSignalQualityAudit,
		StageRankingConsensus,
		StagePersistingHistory,
		StageFinalizingMarketMap,
	}
	if !reflect.DeepEqual(CanonicalScanStages(), want) {
		t.Fatalf("stages=%v", CanonicalScanStages())
	}
	event := ScanTelemetryEvent{RunID: "run-1", Stage: StageMappingMarketSurfaces, Severity: TelemetryWarning, Code: "rate_limit_retry"}
	b, err := json.Marshal(event)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(bytes.ToLower(b), []byte("authorization")) || bytes.Contains(bytes.ToLower(b), []byte("personaltoken")) {
		t.Fatalf("unsafe event JSON: %s", b)
	}
}
