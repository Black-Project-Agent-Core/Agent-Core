package analyticsengine

import (
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"testing"
)

func TestRankingV01OperationIDsAreReserved(t *testing.T) {
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot resolve analyticsengine test source path")
	}
	protocolPath := filepath.Join(filepath.Dir(currentFile), "protocol_v2.go")
	raw, err := os.ReadFile(protocolPath)
	if err != nil {
		t.Fatalf("read protocol_v2.go: %v", err)
	}
	text := string(raw)
	want := map[string]string{
		"V2OpProductRankingV01":      `(?m)^\s*V2OpProductRankingV01\s+V2OperationID\s*=\s*5\s*$`,
		"V2OpCatalogRankingV01":      `(?m)^\s*V2OpCatalogRankingV01\s+V2OperationID\s*=\s*6\s*$`,
		"V2OpStructuralIndexV01":     `(?m)^\s*V2OpStructuralIndexV01\s+V2OperationID\s*=\s*7\s*$`,
		"V2OpStructuralDirectionV01": `(?m)^\s*V2OpStructuralDirectionV01\s+V2OperationID\s*=\s*8\s*$`,
	}
	for name, pattern := range want {
		if !regexp.MustCompile(pattern).MatchString(text) {
			t.Fatalf("%s must reserve the exact analytics v2 wire ID", name)
		}
	}
}

func TestRankingV01SchemaSurfaceIsSecretBlind(t *testing.T) {
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot resolve analyticsengine test source path")
	}
	schemaPath := filepath.Join(filepath.Dir(currentFile), "ranking_v01_schema.go")
	raw, err := os.ReadFile(schemaPath)
	if err != nil {
		t.Fatalf("ranking v0.1 schema missing: %v", err)
	}
	text := string(raw)

	requiredTypes := []string{
		"type ProductRankingV01Input struct",
		"type ProductRankingV01Result struct",
		"type CatalogRankingV01Input struct",
		"type CatalogRankingV01Result struct",
		"type StructuralIndexV01Input struct",
		"type StructuralIndexV01Result struct",
	}
	for _, required := range requiredTypes {
		if !strings.Contains(text, required) {
			t.Fatalf("ranking v0.1 schema must declare %q", required)
		}
	}

	identifier := regexp.MustCompile(`[A-Za-z_][A-Za-z0-9_]*`)
	forbidden := map[string]struct{}{
		"apikey": {}, "token": {}, "cookie": {}, "authorization": {},
		"browsersession": {}, "credential": {}, "password": {}, "secret": {},
	}
	for _, id := range identifier.FindAllString(text, -1) {
		if _, blocked := forbidden[strings.ToLower(id)]; blocked {
			t.Fatalf("ranking v0.1 schema contains forbidden secret-bearing identifier %q", id)
		}
	}
}

func TestStructuralSegmentEvidenceV01ExcludesDerivedAnalytics(t *testing.T) {
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("cannot resolve analyticsengine test source path")
	}

	schemaPath := filepath.Join(filepath.Dir(currentFile), "ranking_v01_schema.go")
	raw, err := os.ReadFile(schemaPath)
	if err != nil {
		t.Fatalf("read ranking_v01_schema.go: %v", err)
	}

	re := regexp.MustCompile(`(?s)type StructuralSegmentEvidenceV01 struct\s*\{(.*?)\}`)
	match := re.FindStringSubmatch(string(raw))
	if len(match) != 2 {
		t.Fatal("StructuralSegmentEvidenceV01 declaration not found")
	}
	block := match[1]

	// C1 canonical boundary carries only observed identity/count/quality facts.
	// Rust owns composition, eligibility, weighting, direction stage, and
	// legacy direction confidence.
	for _, forbidden := range []string{
		"Composition",
		"Eligible",
		"Coverage",
		"Confidence",
	} {
		if regexp.MustCompile(`(?m)^\s*` + forbidden + `\s+`).MatchString(block) {
			t.Fatalf(
				"StructuralSegmentEvidenceV01 must not carry derived Go field %s",
				forbidden,
			)
		}
	}

	for _, required := range []string{
		"SegmentKey",
		"ParentKey",
		"LevelCode",
		"ObservedProducts",
		"DataQualityScore",
		"DataQualityGrade",
	} {
		if !regexp.MustCompile(`(?m)^\s*` + required + `\s+`).MatchString(block) {
			t.Fatalf(
				"StructuralSegmentEvidenceV01 must preserve evidence field %s",
				required,
			)
		}
	}
}
