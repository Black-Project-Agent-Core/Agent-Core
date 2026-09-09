package web

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"testing"
)

func requestJSON(t *testing.T, srv *Server, method, path string, body, out any) *httptest.ResponseRecorder {
	t.Helper()
	var payload []byte
	if body != nil {
		var err error
		payload, err = json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(payload))
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	recorder := httptest.NewRecorder()
	srv.Handler().ServeHTTP(recorder, req)
	if out != nil && recorder.Body.Len() > 0 {
		if err := json.Unmarshal(recorder.Body.Bytes(), out); err != nil {
			t.Fatalf("decode response: %v; body=%s", err, recorder.Body.String())
		}
	}
	return recorder
}
