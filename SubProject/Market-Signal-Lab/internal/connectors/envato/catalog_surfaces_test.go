package envato

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestCategoriesUsesSiteSpecificEndpointAndParsesNestedTree(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer secret" {
			t.Fatal("missing bearer")
		}
		if r.URL.Path != "/v1/market/categories:graphicriver.json" {
			t.Fatalf("path=%s", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"categories":[{"name":"Graphics","slug":"graphics","children":[{"name":"Presentation Templates","slug":"presentation-templates"}]}]}`))
	}))
	defer server.Close()
	client := NewClient(WithBaseURL(server.URL))
	got, err := client.Categories(context.Background(), "secret", "graphicriver.net", 2)
	if err != nil {
		t.Fatal(err)
	}
	if got.HTTPRequests != 1 || len(got.Categories) != 1 || len(got.Categories[0].Children) != 1 || got.Categories[0].Children[0].Path != "presentation-templates" {
		t.Fatalf("got=%+v", got)
	}
}

func TestMarketSiteSlugRemovesDomainSuffix(t *testing.T) {
	tests := map[string]string{
		"graphicriver.net": "graphicriver",
		"themeforest.net":  "themeforest",
		"codecanyon":       "codecanyon",
		" 3docean.net ":    "3docean",
	}
	for input, want := range tests {
		if got := marketSiteSlug(input); got != want {
			t.Fatalf("marketSiteSlug(%q)=%q want %q", input, got, want)
		}
	}
}

func TestSurfaceFallsBackFromSiteSpecific403ToColonJSONEndpoint(t *testing.T) {
	paths := []string{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.Path)
		if len(paths) == 1 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte(`{"error":"Forbidden","description":"route unavailable"}`))
			return
		}
		if r.URL.Query().Get("site") != "graphicriver.net" {
			t.Fatalf("fallback query=%s", r.URL.RawQuery)
		}
		_, _ = w.Write([]byte(`{"items":[{"id":1,"name":"Item One","author_username":"alice"}]}`))
	}))
	defer server.Close()
	client := NewClient(WithBaseURL(server.URL))
	got, err := client.PopularItems(context.Background(), "secret", SurfaceRequest{Site: "graphicriver.net"}, 2)
	if err != nil {
		t.Fatal(err)
	}
	if got.HTTPRequests != 2 || len(got.Items) != 1 {
		t.Fatalf("got=%+v", got)
	}
	if paths[0] != "/v1/market/popular:graphicriver.json" || paths[1] != "/v1/market/popular:json" {
		t.Fatalf("paths=%v", paths)
	}
}

func TestSurfaceFallsBackOn404AndDeduplicatesItems(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if calls == 1 {
			http.NotFound(w, r)
			return
		}
		if r.URL.Path != "/v1/market/popular:json" {
			t.Fatalf("fallback path=%s", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"popular":{"items_last_week":[{"id":1,"name":"Item One","author_username":"alice"},{"id":1,"name":"Duplicate"},{"id":2,"name":"Item Two","author_username":"bob"}]}}`))
	}))
	defer server.Close()
	client := NewClient(WithBaseURL(server.URL))
	got, err := client.PopularItems(context.Background(), "secret", SurfaceRequest{Site: "graphicriver.net", PageSize: 20}, 2)
	if err != nil {
		t.Fatal(err)
	}
	if got.HTTPRequests != 2 || len(got.Items) != 2 || got.Items[0].ExternalItemID != "1" {
		t.Fatalf("got=%+v", got)
	}
}

func TestFeaturedItemsUsesFeaturesEndpoint(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/market/features:graphicriver.json" {
			t.Fatalf("path=%s", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"features":{"featured_file":{"id":11,"item":"Featured Item","user":"featured-author"},"featured_author":{"id":22,"user":"author-profile"}}}`))
	}))
	defer server.Close()
	client := NewClient(WithBaseURL(server.URL))
	got, err := client.FeaturedItems(context.Background(), "secret", SurfaceRequest{Site: "graphicriver.net"}, 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Items) != 1 || got.Items[0].ExternalItemID != "11" || got.Items[0].Title != "Featured Item" || got.Items[0].AuthorKey != "featured-author" {
		t.Fatalf("got=%+v", got)
	}
}

func TestPopularItemsParsesDocumentedItemAndUserFields(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/market/popular:graphicriver.json" {
			t.Fatalf("path=%s", r.URL.Path)
		}
		_, _ = w.Write([]byte(`{"popular":{"items_last_week":[{"id":"2833226","item":"Editorial Presentation","user":"PublicAuthor","url":"https://graphicriver.net/item/editorial-presentation/2833226","thumbnail":"https://example.test/thumb.jpg","category":"presentation-templates/editorial"}]}}`))
	}))
	defer server.Close()

	client := NewClient(WithBaseURL(server.URL))
	got, err := client.PopularItems(context.Background(), "secret", SurfaceRequest{Site: "graphicriver.net"}, 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Items) != 1 {
		t.Fatalf("items=%+v", got.Items)
	}
	item := got.Items[0]
	if item.Title != "Editorial Presentation" || item.AuthorKey != "PublicAuthor" || item.CategoryText != "presentation-templates/editorial" || item.SourceURL == "" || item.PreviewRef == "" {
		t.Fatalf("item=%+v", item)
	}
}

func TestSurfaceHonors429RetryAndRejectsInvalidJSON(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if calls == 1 {
			w.Header().Set("Retry-After", "0")
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		_, _ = w.Write([]byte(`not-json`))
	}))
	defer server.Close()
	client := NewClient(WithBaseURL(server.URL), WithSleep(func(_ time.Duration) {}))
	_, err := client.FeaturedItems(context.Background(), "secret", SurfaceRequest{Site: "graphicriver.net"}, 2)
	if err == nil {
		t.Fatal("expected invalid JSON error")
	}
	if calls != 2 {
		t.Fatalf("calls=%d", calls)
	}
}
