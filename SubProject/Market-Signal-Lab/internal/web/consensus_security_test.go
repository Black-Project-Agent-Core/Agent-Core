package web

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCaptureEndpointRejectsNonLocalHostAndPrivateFields(t *testing.T) {
	server := captureTestServer(t)
	req := httptest.NewRequest(http.MethodPost, "http://example.test/api/consensus/capture-preview", bytes.NewReader(captureTestJSON(t)))
	req.Host = "example.test"
	req.Header.Set("X-MSL-Explicit-Capture", "1")
	req.Header.Set("Cookie", "secret=1")
	rr := httptest.NewRecorder()
	server.Handler().ServeHTTP(rr, req)
	if rr.Code != http.StatusForbidden && rr.Code != http.StatusBadRequest {
		t.Fatalf("code=%d body=%s", rr.Code, rr.Body.String())
	}
}
func TestCapturePreviewRequiresExplicitCaptureHeader(t *testing.T) {
	server := captureTestServer(t)
	req := httptest.NewRequest(http.MethodPost, "http://127.0.0.1:17771/api/consensus/capture-preview", bytes.NewReader(captureTestJSON(t)))
	req.Host = "127.0.0.1:17771"
	rr := httptest.NewRecorder()
	server.Handler().ServeHTTP(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("code=%d body=%s", rr.Code, rr.Body.String())
	}
}
