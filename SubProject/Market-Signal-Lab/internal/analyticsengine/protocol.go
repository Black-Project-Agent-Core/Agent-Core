package analyticsengine

import (
	"encoding/json"
	"fmt"
	"strings"
)

const (
	OpCapabilities           = "capabilities"
	OpDistributionSimilarity = "distribution_similarity"
	OpItemVolatility         = "item_volatility"
	OpClusterVolatility      = "cluster_volatility"
	OpSelectionProbability   = "selection_probability"
)

type ProtocolRequest struct {
	Protocol string          `json:"protocol"`
	ID       string          `json:"id"`
	Op       string          `json:"op"`
	Input    json.RawMessage `json:"input"`
}

type ProtocolError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *ProtocolError) Error() string {
	if e == nil {
		return ""
	}
	return e.Code + ": " + e.Message
}

type ProtocolResponse struct {
	Protocol       string          `json:"protocol"`
	ID             string          `json:"id"`
	OK             bool            `json:"ok"`
	Engine         string          `json:"engine"`
	EngineVersion  string          `json:"engineVersion"`
	DurationMicros uint64          `json:"durationMicros"`
	Result         json.RawMessage `json:"result,omitempty"`
	Error          *ProtocolError  `json:"error,omitempty"`
}

func validProtocolOp(op string) bool {
	switch op {
	case OpCapabilities, OpDistributionSimilarity, OpItemVolatility, OpClusterVolatility, OpSelectionProbability:
		return true
	default:
		return false
	}
}

func ValidateProtocolRequest(req ProtocolRequest) *ProtocolError {
	if req.Protocol != ProtocolV1 {
		return &ProtocolError{Code: "unsupported_protocol", Message: fmt.Sprintf("unsupported analytics protocol %q", req.Protocol)}
	}
	if strings.TrimSpace(req.ID) == "" {
		return &ProtocolError{Code: "missing_request_id", Message: "analytics request id is required"}
	}
	if !validProtocolOp(req.Op) {
		return &ProtocolError{Code: "unsupported_operation", Message: fmt.Sprintf("unsupported analytics operation %q", req.Op)}
	}
	return nil
}

func ValidateProtocolResponse(requestID string, resp ProtocolResponse) *ProtocolError {
	if resp.Protocol != ProtocolV1 {
		return &ProtocolError{Code: "unsupported_protocol", Message: fmt.Sprintf("unsupported analytics protocol %q", resp.Protocol)}
	}
	if strings.TrimSpace(resp.ID) == "" {
		return &ProtocolError{Code: "missing_response_id", Message: "analytics response id is required"}
	}
	if resp.ID != requestID {
		return &ProtocolError{Code: "response_id_mismatch", Message: fmt.Sprintf("response id %q does not match request id %q", resp.ID, requestID)}
	}
	if strings.TrimSpace(resp.Engine) == "" {
		return &ProtocolError{Code: "missing_engine", Message: "analytics response engine is required"}
	}
	if !resp.OK && resp.Error == nil {
		return &ProtocolError{Code: "missing_error", Message: "failed analytics response is missing error details"}
	}
	return nil
}
