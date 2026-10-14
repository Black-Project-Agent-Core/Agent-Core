package storage

import (
	"marketsignallab/internal/domain"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func openConsensusTempStore(t *testing.T) *Store {
	t.Helper()
	s, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestConsensusRecordsAreAppendOnlyAndIdempotentByID(t *testing.T) {
	store := openConsensusTempStore(t)
	ctx := domain.ObservationContext{ID: "ctx-1", ContextKey: "key-1", Platform: "envato_subscription", Experience: "public_web", AccessState: "anonymous", SourceMethod: "clipboard_import", SourceSite: "elements.envato.com", CatalogPath: "/graphic-templates", SortMode: "popular", Locale: "en", PageSizeOrTopK: 30, CapturedAt: "2026-08-16T10:00:00Z", ContextVersion: "observation-context-v0.1"}
	if err := store.AppendObservationContext(ctx); err != nil {
		t.Fatal(err)
	}
	ctx.ContextLabel = "mutated label"
	if err := store.AppendObservationContext(ctx); err != nil {
		t.Fatal(err)
	}
	rows, err := store.ObservationContexts(domain.ObservationContextFilter{ID: "ctx-1"})
	if err != nil || len(rows) != 1 {
		t.Fatalf("rows=%+v err=%v", rows, err)
	}
	if rows[0].ContextLabel == "mutated label" {
		t.Fatal("append-only record was overwritten")
	}
}

func TestSurfaceSnapshotItemsRemainOrderedByRank(t *testing.T) {
	store := openConsensusTempStore(t)
	for _, row := range []domain.SurfaceSnapshotItem{{ID: "i2", SnapshotID: "s1", Rank: 2, CanonicalIdentityKey: "b"}, {ID: "i1", SnapshotID: "s1", Rank: 1, CanonicalIdentityKey: "a"}} {
		if err := store.AppendSurfaceSnapshotItem(row); err != nil {
			t.Fatal(err)
		}
	}
	rows, err := store.SurfaceSnapshotItems(domain.SurfaceSnapshotItemFilter{SnapshotID: "s1"})
	if err != nil || len(rows) != 2 || rows[0].Rank != 1 {
		t.Fatalf("rows=%+v err=%v", rows, err)
	}
}

func TestConsensusExportStorageContainsNoSecretFields(t *testing.T) {
	store := openConsensusTempStore(t)
	audit := domain.CaptureImportAudit{ID: "a1", CaptureBatchID: "b1", SourceMethod: "user_initiated_page_capture", ImportedAt: "2026-08-16T10:00:00Z", Accepted: true}
	if err := store.AppendCaptureImportAudit(audit); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(filepath.Join(store.Root(), "history", "capture_import_audits.jsonl"))
	lower := strings.ToLower(string(data))
	for _, forbidden := range []string{"cookie", "authorization", "password", "personal_token", "raw_html", "sessionid"} {
		if strings.Contains(lower, forbidden) {
			t.Fatalf("forbidden persistence marker %q", forbidden)
		}
	}
}
