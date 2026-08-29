package web

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestFrontendBuildContract(t *testing.T) {
	packageJSONBytes, err := os.ReadFile("../../package.json")
	if err != nil {
		t.Fatalf("read package.json: %v", err)
	}

	var packageJSON struct {
		PackageManager  string            `json:"packageManager"`
		Scripts         map[string]string `json:"scripts"`
		DevDependencies map[string]string `json:"devDependencies"`
	}
	if err := json.Unmarshal(packageJSONBytes, &packageJSON); err != nil {
		t.Fatalf("parse package.json: %v", err)
	}

	if packageJSON.PackageManager != "bun@1.4.0" {
		t.Fatalf("packageManager = %q, want %q", packageJSON.PackageManager, "bun@1.4.0")
	}
	if packageJSON.DevDependencies["typescript"] != "5.9.3" {
		t.Fatalf("typescript devDependency = %q, want %q", packageJSON.DevDependencies["typescript"], "5.9.3")
	}
	if len(packageJSON.Scripts) != 4 {
		t.Fatalf("script count = %d, want 4", len(packageJSON.Scripts))
	}

	for _, script := range []string{"typecheck", "build:frontend", "test:frontend", "verify:frontend-generated"} {
		if _, ok := packageJSON.Scripts[script]; !ok {
			t.Fatalf("missing script %q", script)
		}
	}

	tsconfigBytes, err := os.ReadFile("../../frontend/tsconfig.json")
	if err != nil {
		t.Fatalf("read frontend/tsconfig.json: %v", err)
	}

	var tsconfig struct {
		CompilerOptions struct {
			Strict  bool   `json:"strict"`
			Module  string `json:"module"`
			OutDir  string `json:"outDir"`
			NewLine string `json:"newLine"`
		} `json:"compilerOptions"`
	}
	if err := json.Unmarshal(tsconfigBytes, &tsconfig); err != nil {
		t.Fatalf("parse frontend/tsconfig.json: %v", err)
	}

	if !tsconfig.CompilerOptions.Strict {
		t.Fatal("tsconfig strict must be true")
	}
	if tsconfig.CompilerOptions.Module != "None" {
		t.Fatalf("tsconfig module = %q, want %q", tsconfig.CompilerOptions.Module, "None")
	}
	if tsconfig.CompilerOptions.OutDir != "../internal/web/assets/js" {
		t.Fatalf("tsconfig outDir = %q, want %q", tsconfig.CompilerOptions.OutDir, "../internal/web/assets/js")
	}
	if tsconfig.CompilerOptions.NewLine != "lf" {
		t.Fatalf("tsconfig newLine = %q, want %q", tsconfig.CompilerOptions.NewLine, "lf")
	}

	gitattributesBytes, err := os.ReadFile("../../.gitattributes")
	if err != nil {
		t.Fatalf("read .gitattributes: %v", err)
	}

	const generatedAssetEOLRule = "internal/web/assets/js/analytics_engine.js text eol=lf"
	activeRules := []string{}
	for _, line := range strings.Split(string(gitattributesBytes), "\n") {
		rule := strings.TrimSpace(line)
		if rule == "" || strings.HasPrefix(rule, "#") {
			continue
		}
		activeRules = append(activeRules, rule)
	}
	if len(activeRules) != 1 || activeRules[0] != generatedAssetEOLRule {
		t.Fatalf(".gitattributes active rules = %q, want only %q", activeRules, generatedAssetEOLRule)
	}

	workflowBytes, err := os.ReadFile("../../.github/workflows/frontend-contract-ci.yml")
	if err != nil {
		t.Fatalf("read .github/workflows/frontend-contract-ci.yml: %v", err)
	}
	workflow := string(workflowBytes)

	for _, required := range []string{
		"oven-sh/setup-bun@v2",
		"bun-version: 1.4.0",
		"bun install --frozen-lockfile",
		"bun run typecheck",
		"bun run test:frontend",
		"bun run verify:frontend-generated",
	} {
		if !strings.Contains(workflow, required) {
			t.Fatalf("frontend-contract-ci.yml missing %q", required)
		}
	}
}
