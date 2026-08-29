package envato

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestSearchPageNormalizesProductsAndCountsRetryRequests(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if calls == 1 {
			w.Header().Set("Retry-After", "0")
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		_, _ = w.Write([]byte(`{
          "total_hits":2,
          "matches":[
            {"id":123,"name":"Padel Sponsorship Deck","author_username":"alice","url":"https://example.test/123","category":"presentation-templates"},
            {"id":"456","name":"Sports Club Proposal","author_username":"bob","url":"https://example.test/456","category":"presentation-templates"}
          ]
        }`))
	}))
	defer srv.Close()
	c := NewClient(WithBaseURL(srv.URL), WithSleep(func(time.Duration) {}))
	got, err := c.SearchPage(context.Background(), "secret", SearchRequest{Term: "padel", Site: "graphicriver.net", Page: 1, PageSize: 20}, 2)
	if err != nil {
		t.Fatal(err)
	}
	if got.HTTPRequests != 2 || len(got.Items) != 2 {
		t.Fatalf("result=%+v", got)
	}
	if got.Items[0].ExternalItemID != "123" || got.Items[0].Position != 1 || got.Items[0].AuthorKey != "alice" {
		t.Fatalf("item=%+v", got.Items[0])
	}
}

func TestSearchPageDoesNotRetryWhenAllowanceIsOne(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()
	c := NewClient(WithBaseURL(srv.URL), WithSleep(func(time.Duration) {}))
	got, err := c.SearchPage(context.Background(), "secret", SearchRequest{Term: "x", Site: "graphicriver.net"}, 1)
	if err == nil || got.HTTPRequests != 1 || calls != 1 {
		t.Fatalf("got=%+v err=%v calls=%d", got, err, calls)
	}
}

func TestSearchPageSkipsMissingIDsAndNeverLeaksToken(t *testing.T) {
	persistenceCanary := "PERSISTENCE_CANARY_9371"
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"matches":[{"name":"missing"},{"id":9,"name":"kept","thumbnail":"https://example.test/t.jpg"}]}`))
	}))
	defer srv.Close()
	c := NewClient(WithBaseURL(srv.URL))
	got, err := c.SearchPage(context.Background(), persistenceCanary, SearchRequest{Term: "x", Site: "graphicriver.net"}, 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Items) != 1 || got.Items[0].ExternalItemID != "9" || got.Items[0].PreviewRef == "" {
		t.Fatalf("items=%+v", got.Items)
	}
	if strings.Contains(errString(err), persistenceCanary) {
		t.Fatal("token leaked")
	}
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}
