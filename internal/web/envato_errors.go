package web

import (
	"errors"
	"marketsignallab/internal/app"
	envatoconn "marketsignallab/internal/connectors/envato"
	"net/http"
)

func writeEnvatoConnectorError(w http.ResponseWriter, err error) bool {
	if err == nil {
		return false
	}

	var connectionErr *app.EnvatoConnectionError
	if errors.As(err, &connectionErr) {
		status := http.StatusBadGateway
		switch connectionErr.State {
		case app.EnvatoConnectionNotConfigured:
			status = http.StatusBadRequest
		case app.EnvatoConnectionNeedsAttention:
			status = http.StatusUnauthorized
		case app.EnvatoConnectionRateLimited:
			status = http.StatusTooManyRequests
		case app.EnvatoConnectionNetworkUnavailable, app.EnvatoConnectionCredentialStoreError:
			status = http.StatusServiceUnavailable
		case app.EnvatoConnectionProviderError, app.EnvatoConnectionProviderResponseError:
			status = http.StatusBadGateway
		}
		jsonOut(w, status, map[string]any{"error": connectionErr.Error(), "code": connectionErr.Code})
		return true
	}

	var permissionErr *envatoconn.TokenPermissionError
	if errors.As(err, &permissionErr) {
		jsonOut(w, http.StatusForbidden, map[string]any{
			"error": permissionErr.Error(),
			"code":  "envato_token_missing_catalog_permission",
			"details": map[string]any{
				"requiredPermissions": []string{"View and search Envato sites", "View your Envato Account username"},
			},
		})
		return true
	}

	var statusErr *envatoconn.HTTPStatusError
	if !errors.As(err, &statusErr) {
		return false
	}
	code := "envato_api_request_failed"
	status := http.StatusBadGateway
	switch statusErr.StatusCode {
	case http.StatusUnauthorized:
		code = "envato_token_invalid"
		status = http.StatusUnauthorized
	case http.StatusForbidden:
		code = "envato_access_forbidden"
		status = http.StatusForbidden
	case http.StatusTooManyRequests:
		code = "envato_rate_limited"
		status = http.StatusTooManyRequests
	default:
		if statusErr.StatusCode >= 500 {
			code = "envato_service_unavailable"
		}
	}
	jsonOut(w, status, map[string]any{
		"error": statusErr.Error(),
		"code":  code,
		"details": map[string]any{
			"upstreamStatus": statusErr.StatusCode,
			"endpoint":       statusErr.Path,
		},
	})
	return true
}
