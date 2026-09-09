package analyticsengine

import (
	"encoding/json"
	"testing"
)

func TestProtocolRejectsInvalidRequests(t *testing.T) {
	cases := []struct {
		name string
		req  ProtocolRequest
		code string
	}{
		{"wrong protocol", ProtocolRequest{Protocol: "msl-analytics/0", ID: "req-1", Op: OpCapabilities}, "unsupported_protocol"},
		{"missing id", ProtocolRequest{Protocol: ProtocolV1, Op: OpCapabilities}, "missing_request_id"},
		{"unknown op", ProtocolRequest{Protocol: ProtocolV1, ID: "req-1", Op: "unknown"}, "unsupported_operation"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if err := ValidateProtocolRequest(tc.req); err == nil || err.Code != tc.code {
				t.Fatalf("err=%+v", err)
			}
		})
	}
}

func TestProtocolRejectsResponseIDMismatch(t *testing.T) {
	resp := ProtocolResponse{Protocol: ProtocolV1, ID: "req-2", OK: true, Engine: "rust-native", EngineVersion: "0.1.0"}
	if err := ValidateProtocolResponse("req-1", resp); err == nil || err.Code != "response_id_mismatch" {
		t.Fatalf("err=%+v", err)
	}
}

func TestProtocolWireNames(t *testing.T) {
	req := ProtocolRequest{Protocol: ProtocolV1, ID: "req-1", Op: OpCapabilities, Input: json.RawMessage(`{}`)}
	b, err := json.Marshal(req)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"protocol":"msl-analytics/1","id":"req-1","op":"capabilities","input":{}}`
	if string(b) != want {
		t.Fatalf("wire=%s want=%s", b, want)
	}
}
