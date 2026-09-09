package web

import (
	"bytes"
	"encoding/json"
	"marketsignallab/internal/app"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/storage"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

func captureTestServer(t *testing.T) *Server {
	t.Helper()
	st, err := storage.Open(filepath.Join(t.TempDir(), "data"))
	if err != nil {
		t.Fatal(err)
	}
	return New(app.New(st))
}
func captureTestJSON(t *testing.T) []byte {
	t.Helper()
	p := domain.SurfaceCapturePayload{Context: domain.ObservationContextInput{Platform: "envato_subscription", Experience: "public_web", AccessState: "anonymous", SourceMethod: "user_initiated_page_capture", SourceSite: "elements.envato.com", CatalogPath: "/graphic-templates", ContentType: "graphic_templates", SortMode: "popular", Locale: "en", PageSizeOrTopK: 30}, PageURL: "https://elements.envato.com/graphic-templates", TopKRequested: 30, CaptureStatus: "complete", ExtractorVersion: "test", Items: []domain.SurfaceCaptureItem{{Rank: 1, ExternalItemID: "ABC123", SourceURL: "https://elements.envato.com/example-ABC123", Title: "Example"}}}
	b, _ := json.Marshal(p)
	return b
}
func TestCapturePreviewConfirmFlow(t *testing.T) {
	server := captureTestServer(t)
	req := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:17771/api/consensus/capture-preview", bytes.NewReader(captureTestJSON(t)))
	req.Host = "127.0.0.1:17771"
	req.Header.Set("X-MSL-Explicit-Capture", "1")
	rr := httptest.NewRecorder()
	server.Handler().ServeHTTP(rr, req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("preview code=%d body=%s", rr.Code, rr.Body.String())
	}
	var v map[string]any
	_ = json.Unmarshal(rr.Body.Bytes(), &v)
	id, _ := v["previewId"].(string)
	if id == "" {
		t.Fatal("missing preview id")
	}
	confirm, _ := json.Marshal(map[string]string{"previewId": id})
	req = httptest.NewRequest(http.MethodPost, "http://127.0.0.1:17771/api/consensus/capture-confirm", bytes.NewReader(confirm))
	req.Host = "127.0.0.1:17771"
	req.Header.Set("X-MSL-Explicit-Capture", "1")
	rr = httptest.NewRecorder()
	server.Handler().ServeHTTP(rr, req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("confirm code=%d body=%s", rr.Code, rr.Body.String())
	}
}
