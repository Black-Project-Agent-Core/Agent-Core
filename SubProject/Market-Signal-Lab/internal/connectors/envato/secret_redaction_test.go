package envato

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHTTPStatusErrorRedactsCredentialEchoedByProvider(t *testing.T) {
	canary := "MSL_TEST_" + "SECRET_DO_NOT_LEAK_" + "7F83C91A5E2D"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"credential rejected: ` + canary + `"}`))
	}))
	defer srv.Close()
	client := NewClient(WithBaseURL(srv.URL))
	_, err := client.TotalItems(context.Background(), canary)
	if err == nil { t.Fatal("expected provider error") }
	message := err.Error()
	if strings.Contains(message, canary) { t.Fatal("provider error leaked credential") }
	if !strings.Contains(message, "[REDACTED]") { t.Fatalf("redacted marker missing: %q", message) }
	if !strings.Contains(message, "HTTP 401") || !strings.Contains(message, "/v1/market/total-items.json") {
		t.Fatalf("useful status/path diagnostic was lost: %q", message)
	}
}
