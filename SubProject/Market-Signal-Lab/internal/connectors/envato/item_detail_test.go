package envato

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestItemDetailAcceptsOnlyExplicitReleaseFields(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v3/market/catalog/item" || r.URL.Query().Get("id") != "123" {
			t.Fatalf("request=%s?%s", r.URL.Path, r.URL.RawQuery)
		}
		_, _ = w.Write([]byte(`{"id":123,"name":"Product","url":"https://graphicriver.net/item/product/123","published_at":"2025-03-14T10:20:30+10:00","updated_at":"2026-08-16T12:00:00+10:00"}`))
	}))
	defer srv.Close()

	got, err := NewClient(WithBaseURL(srv.URL)).ItemDetail(context.Background(), "secret", "123", 1)
	if err != nil {
		t.Fatal(err)
	}
	if got.ReleasedAt != "2025-03-14T00:20:30Z" || got.ReleasePrecision != "datetime" || got.ReleaseField != "published_at" || got.HTTPRequests != 1 {
		t.Fatalf("got=%+v", got)
	}
}

func TestItemDetailNeverUsesUpdatedAtAsRelease(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"id":123,"name":"Product","updated_at":"2026-08-16T12:00:00+10:00"}`))
	}))
	defer srv.Close()

	got, err := NewClient(WithBaseURL(srv.URL)).ItemDetail(context.Background(), "secret", "123", 1)
	if err != nil {
		t.Fatal(err)
	}
	if got.ReleasedAt != "" || got.ReleaseField != "" || got.ReleasePrecision != "" {
		t.Fatalf("updated_at poisoned release date: %+v", got)
	}
}

func TestSurfaceParsesPublishedDateWhenOfficialResponseIncludesIt(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"items":[{"id":123,"name":"Product","published_at":"2025-03-14"}]}`))
	}))
	defer srv.Close()

	got, err := NewClient(WithBaseURL(srv.URL)).PopularItems(context.Background(), "secret", SurfaceRequest{Site: "graphicriver.net"}, 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Items) != 1 || got.Items[0].ReleasedAt != "2025-03-14" || got.Items[0].ReleasePrecision != "date" || got.Items[0].ReleaseField != "published_at" {
		t.Fatalf("items=%+v", got.Items)
	}
}
