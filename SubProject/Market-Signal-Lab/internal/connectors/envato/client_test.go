package envato

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestSearchUsesBearerAuthAndRetries429Once(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if got := r.Header.Get("Authorization"); got != "Bearer secret" {
			t.Fatalf("auth=%q", got)
		}
		if r.URL.Path != "/v1/discovery/search/search/item" {
			t.Fatalf("path=%s", r.URL.Path)
		}
		if r.URL.Query().Get("term") != "fashion show" || r.URL.Query().Get("site") != "graphicriver.net" {
			t.Fatalf("query=%s", r.URL.RawQuery)
		}
		if calls == 1 {
			w.Header().Set("Retry-After", "0")
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"total_hits":1234,"matches":[{"id":1},{"id":2}],"took":12}`))
	}))
	defer srv.Close()
	c := NewClient(WithBaseURL(srv.URL), WithSleep(func(time.Duration) {}))
	got, err := c.Search(context.Background(), "secret", SearchRequest{Term: "fashion show", Site: "graphicriver.net", PageSize: 2})
	if err != nil {
		t.Fatal(err)
	}
	if calls != 2 {
		t.Fatalf("calls=%d", calls)
	}
	if got.TotalHits != 1234 || got.Returned != 2 || !got.TotalHitsExact {
		t.Fatalf("aggregate=%+v", got)
	}
}

func TestSearchExtractsPaginationTotalResults(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"pagination":{"total_results":345},"matches":[]}`))
	}))
	defer srv.Close()
	c := NewClient(WithBaseURL(srv.URL))
	got, err := c.Search(context.Background(), "secret", SearchRequest{Term: "magazine", Site: "graphicriver.net"})
	if err != nil {
		t.Fatal(err)
	}
	if got.TotalHits != 345 {
		t.Fatalf("total=%d", got.TotalHits)
	}
}

func TestTotalItemsParsesOfficialAggregateShape(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasSuffix(r.URL.Path, "/v1/market/total-items.json") {
			t.Fatalf("path=%s", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"total-items":{"total_items":"7411418"}}`))
	}))
	defer srv.Close()
	c := NewClient(WithBaseURL(srv.URL))
	got, err := c.TotalItems(context.Background(), "secret")
	if err != nil {
		t.Fatal(err)
	}
	if got.TotalItems != 7411418 {
		t.Fatalf("total=%d", got.TotalItems)
	}
}

func TestSearchRejectsMissingToken(t *testing.T) {
	c := NewClient(WithBaseURL("http://127.0.0.1:1"))
	if _, err := c.Search(context.Background(), "", SearchRequest{Term: "x", Site: "graphicriver.net"}); err == nil {
		t.Fatal("expected missing token error")
	}
}

func TestSearchMarksFallbackSampleCountAsInexact(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"matches":[{"id":1},{"id":2}]}`))
	}))
	defer srv.Close()
	c := NewClient(WithBaseURL(srv.URL))
	got, err := c.Search(context.Background(), "secret", SearchRequest{Term: "x", Site: "graphicriver.net", PageSize: 2})
	if err != nil {
		t.Fatal(err)
	}
	if got.TotalHits != 2 || got.TotalHitsExact {
		t.Fatalf("aggregate=%+v", got)
	}
}

func TestVerifyConnectionChecksAggregateAndCatalogPermission(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.Header.Get("Authorization") != "Bearer verify-secret" {
			t.Fatalf("auth=%q", r.Header.Get("Authorization"))
		}
		switch r.URL.Path {
		case "/v1/market/total-items.json":
			_, _ = w.Write([]byte(`{"total-items":{"total_items":"7411418"}}`))
		case "/v1/discovery/search/search/item":
			if r.URL.Query().Get("term") == "" || r.URL.Query().Get("site") != "graphicriver.net" {
				t.Fatalf("catalog probe query=%s", r.URL.RawQuery)
			}
			_, _ = w.Write([]byte(`{"total_hits":1,"matches":[{"id":99,"name":"Probe"}]}`))
		default:
			t.Fatalf("path=%s", r.URL.Path)
		}
	}))
	defer srv.Close()
	client := NewClient(WithBaseURL(srv.URL))
	status, err := client.VerifyConnection(context.Background(), "verify-secret")
	if err != nil {
		t.Fatal(err)
	}
	if calls != 2 || !status.OK || !status.CatalogAccess || status.TotalItems != 7411418 || status.Source != "envato_market_api" {
		t.Fatalf("calls=%d status=%+v", calls, status)
	}
	encoded := fmt.Sprintf("%+v", status)
	if strings.Contains(encoded, "verify-secret") {
		t.Fatalf("token leaked: %s", encoded)
	}
}

func TestVerifyConnectionExplainsMissingCatalogScope(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/market/total-items.json":
			_, _ = w.Write([]byte(`{"total-items":{"total_items":"7411418"}}`))
		case "/v1/discovery/search/search/item":
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte(`{"reason":"scope-missing","description":"default scope is required"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	client := NewClient(WithBaseURL(srv.URL))
	status, err := client.VerifyConnection(context.Background(), "verify-secret")
	if err == nil {
		t.Fatal("expected catalog permission error")
	}
	var permission *TokenPermissionError
	if !errors.As(err, &permission) {
		t.Fatalf("err=%T %v", err, err)
	}
	if status.OK || status.CatalogAccess || !strings.Contains(err.Error(), "View and search Envato sites") || !strings.Contains(err.Error(), "View your Envato Account username") {
		t.Fatalf("status=%+v err=%v", status, err)
	}
	if strings.Contains(err.Error(), "verify-secret") {
		t.Fatal("token leaked")
	}
}

func TestSurfaceHTTPStatusErrorIncludesSafeEndpointAndDescription(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"reason":"scope-missing","description":"catalog permission denied"}`))
	}))
	defer srv.Close()
	client := NewClient(WithBaseURL(srv.URL))
	_, err := client.Search(context.Background(), "super-secret-token", SearchRequest{Term: "probe", Site: "graphicriver.net"})
	if err == nil {
		t.Fatal("expected status error")
	}
	var status *HTTPStatusError
	if !errors.As(err, &status) {
		t.Fatalf("err=%T %v", err, err)
	}
	if status.StatusCode != http.StatusForbidden || status.Path != "/v1/discovery/search/search/item" || status.Description == "" {
		t.Fatalf("status=%+v", status)
	}
	if strings.Contains(err.Error(), "super-secret-token") {
		t.Fatal("token leaked")
	}
}
