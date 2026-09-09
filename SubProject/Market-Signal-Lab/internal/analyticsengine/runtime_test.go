package analyticsengine

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestProductionRuntimeHasOneRustAnalyticsIdentity(t *testing.T) {
	rt := NewProductionRuntime(context.Background(), filepath.Join(t.TempDir(), "missing-worker"), time.Second)
	defer rt.Close()

	if got := rt.Engine().Name(); got != "rust-production" {
		t.Fatalf("engine=%q want rust-production", got)
	}
	h := rt.Health(context.Background())
	if h.Status != EngineUnavailable || h.Protocol != ProtocolV2 {
		t.Fatalf("health=%+v", h)
	}
}

func TestProductionRuntimeUnavailableHealthUsesProtocolV2(t *testing.T) {
	var rt *ProductionRuntime
	h := rt.Health(context.Background())
	if h.Status != EngineUnavailable || h.Engine != "rust-production" || h.Protocol != ProtocolV2 {
		t.Fatalf("health=%+v", h)
	}
}

func TestProductionRuntimeContractHasNoModeSelection(t *testing.T) {
	b, err := os.ReadFile("runtime.go")
	if err != nil {
		t.Fatal(err)
	}
	text := string(b)
	for _, forbidden := range []string{"EngineMode", "ModeGoNative", "ModeRustNative", "ModeShadow", "NewGoEngine", "NewRegistry"} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("runtime.go contains forbidden production selector %q", forbidden)
		}
	}
}
