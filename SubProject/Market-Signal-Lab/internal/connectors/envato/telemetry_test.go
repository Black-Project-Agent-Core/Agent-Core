package envato

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

func TestRequestTelemetryReportsSuccessAndRetry(t *testing.T) {
	var mu sync.Mutex
	events := []RequestTelemetry{}
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if calls == 1 {
			w.Header().Set("Retry-After", "2")
			w.WriteHeader(429)
			return
		}
		w.Write([]byte(`{"items":[{"id":"1","name":"A"}]}`))
	}))
	defer srv.Close()
	c := NewClient(WithBaseURL(srv.URL), WithSleep(func(time.Duration) {}))
	ctx := WithRequestTelemetry(context.Background(), "graphicriver.net", "popular", func(v RequestTelemetry) { mu.Lock(); events = append(events, v); mu.Unlock() })
	_, _, err := c.doGET(ctx, "SECRET", "/x", nil, 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(events) < 2 {
		t.Fatalf("events=%+v", events)
	}
	if events[0].HTTPStatus != 429 || events[0].RetryDelay != 2*time.Second || events[0].RetryCount != 1 {
		t.Fatalf("first=%+v", events[0])
	}
	if events[len(events)-1].HTTPStatus != 200 || events[len(events)-1].Site != "graphicriver.net" {
		t.Fatalf("last=%+v", events[len(events)-1])
	}
}
