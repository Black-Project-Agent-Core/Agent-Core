package app

import (
	"context"
	"errors"
	envatoconn "marketsignallab/internal/connectors/envato"
	credentialspkg "marketsignallab/internal/credentials"
	"net"
	"net/http"
	"strings"
	"time"
)

type EnvatoConnectionState string

const (
	EnvatoConnectionNotConfigured         EnvatoConnectionState = "not_configured"
	EnvatoConnectionConfigured            EnvatoConnectionState = "configured"
	EnvatoConnectionConnected             EnvatoConnectionState = "connected"
	EnvatoConnectionNeedsAttention        EnvatoConnectionState = "needs_attention"
	EnvatoConnectionRateLimited           EnvatoConnectionState = "rate_limited"
	EnvatoConnectionNetworkUnavailable    EnvatoConnectionState = "network_unavailable"
	EnvatoConnectionProviderError         EnvatoConnectionState = "provider_error"
	EnvatoConnectionProviderResponseError EnvatoConnectionState = "provider_response_error"
	EnvatoConnectionCredentialStoreError  EnvatoConnectionState = "credential_store_error"
)

type EnvatoConnectionStatus struct {
	Provider              string                `json:"provider"`
	Configured            bool                  `json:"configured"`
	EffectiveSource       string                `json:"effectiveSource,omitempty"`
	CredentialFingerprint string                `json:"credentialFingerprint,omitempty"`
	Status                EnvatoConnectionState `json:"status"`
	LastVerifiedAt        string                `json:"lastVerifiedAt,omitempty"`
}

type EnvatoConnectionError struct {
	State   EnvatoConnectionState
	Code    string
	message string
	cause   error
}

func (e *EnvatoConnectionError) Error() string { return e.message }
func (e *EnvatoConnectionError) Unwrap() error { return e.cause }

func connectionError(state EnvatoConnectionState, code, message string, cause error) error {
	return &EnvatoConnectionError{State: state, Code: code, message: message, cause: cause}
}

func classifyEnvatoProviderError(err error) (EnvatoConnectionState, string, string) {
	if err == nil {
		return EnvatoConnectionConnected, "", ""
	}
	var permissionErr *envatoconn.TokenPermissionError
	if errors.As(err, &permissionErr) {
		return EnvatoConnectionNeedsAttention, "envato_authentication_failed", "Envato authentication requires attention"
	}
	var statusErr *envatoconn.HTTPStatusError
	if errors.As(err, &statusErr) {
		switch statusErr.StatusCode {
		case http.StatusUnauthorized, http.StatusForbidden:
			return EnvatoConnectionNeedsAttention, "envato_authentication_failed", "Envato authentication requires attention"
		case http.StatusTooManyRequests:
			return EnvatoConnectionRateLimited, "envato_rate_limited", "Envato API rate limit reached"
		default:
			if statusErr.StatusCode >= 500 {
				return EnvatoConnectionProviderError, "envato_provider_error", "Envato service is unavailable"
			}
		}
	}
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return EnvatoConnectionNetworkUnavailable, "envato_network_unavailable", "Envato network connection is unavailable"
	}
	var netErr net.Error
	if errors.As(err, &netErr) {
		return EnvatoConnectionNetworkUnavailable, "envato_network_unavailable", "Envato network connection is unavailable"
	}
	return EnvatoConnectionProviderResponseError, "envato_provider_response_error", "Envato returned an unexpected response"
}

func (s *Service) resolveEnvatoCredential() (credentialspkg.Resolved, error) {
	if s.credentials == nil {
		return credentialspkg.Resolved{}, credentialspkg.ErrNotConfigured
	}
	return s.credentials.Resolve()
}

func credentialResolutionError(err error) error {
	if errors.Is(err, credentialspkg.ErrNotConfigured) {
		return connectionError(EnvatoConnectionNotConfigured, "envato_not_configured", "Envato credential is not configured", err)
	}
	return connectionError(EnvatoConnectionCredentialStoreError, "credential_store_error", "Envato credential store is unavailable", err)
}

func (s *Service) resolvedEnvatoToken() (string, error) {
	resolved, err := s.resolveEnvatoCredential()
	if err != nil {
		return "", credentialResolutionError(err)
	}
	token := strings.TrimSpace(resolved.Token)
	resolved.Token = ""
	if token == "" {
		return "", credentialResolutionError(credentialspkg.ErrNotConfigured)
	}
	return token, nil
}

func (s *Service) EnvatoConnectionStatus() EnvatoConnectionStatus {
	status := EnvatoConnectionStatus{Provider: "envato", Status: EnvatoConnectionNotConfigured}
	resolved, err := s.resolveEnvatoCredential()
	if err != nil {
		if !errors.Is(err, credentialspkg.ErrNotConfigured) {
			status.Status = EnvatoConnectionCredentialStoreError
		}
		return status
	}
	status.Configured = true
	status.EffectiveSource = string(resolved.Source)
	status.CredentialFingerprint = resolved.Fingerprint
	status.Status = EnvatoConnectionConfigured
	if resolved.Source == credentialspkg.SourceEnvironment {
		return status
	}

	if s.credentials == nil {
		return status
	}
	metadata, err := s.credentials.Metadata()
	if err != nil {
		status.Status = EnvatoConnectionCredentialStoreError
		return status
	}
	if resolved.Source == credentialspkg.SourceCredentialManager &&
		metadata.Configured &&
		metadata.CredentialFingerprint == resolved.Fingerprint {
		status.LastVerifiedAt = metadata.LastVerifiedAt
		switch EnvatoConnectionState(metadata.LastStatus) {
		case EnvatoConnectionNeedsAttention, EnvatoConnectionRateLimited, EnvatoConnectionNetworkUnavailable,
			EnvatoConnectionProviderError, EnvatoConnectionProviderResponseError, EnvatoConnectionCredentialStoreError:
			status.Status = EnvatoConnectionState(metadata.LastStatus)
		default:
			if metadata.LastStatus == "healthy" {
				status.Status = EnvatoConnectionConnected
			}
		}
	}
	return status
}

func verifiedAt(value string) string {
	if strings.TrimSpace(value) != "" {
		return value
	}
	return time.Now().UTC().Format(time.RFC3339)
}

func verifiedMetadata(token, observedAt string) credentialspkg.Metadata {
	return credentialspkg.Metadata{
		Provider:              "envato",
		Configured:            true,
		CredentialFingerprint: credentialspkg.Fingerprint(token),
		LastVerifiedAt:        verifiedAt(observedAt),
		LastStatus:            "healthy",
	}
}

func (s *Service) persistStoredConnectionState(resolved credentialspkg.Resolved, state EnvatoConnectionState) error {
	if s.credentials == nil || resolved.Source != credentialspkg.SourceCredentialManager {
		return nil
	}
	metadata, err := s.credentials.Metadata()
	if err != nil {
		return err
	}
	metadata.Provider = "envato"
	metadata.Configured = true
	metadata.CredentialFingerprint = resolved.Fingerprint
	metadata.LastStatus = string(state)
	return s.credentials.WriteMetadata(metadata)
}

func connectedStatus(resolved credentialspkg.Resolved, observedAt string) EnvatoConnectionStatus {
	return EnvatoConnectionStatus{
		Provider:              "envato",
		Configured:            true,
		EffectiveSource:       string(resolved.Source),
		CredentialFingerprint: resolved.Fingerprint,
		Status:                EnvatoConnectionConnected,
		LastVerifiedAt:        verifiedAt(observedAt),
	}
}

func (s *Service) SaveEnvatoCredential(ctx context.Context, token string) (EnvatoConnectionStatus, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		status := s.EnvatoConnectionStatus()
		return status, connectionError(EnvatoConnectionNotConfigured, "envato_token_missing", "Envato credential is required", nil)
	}
	connection, err := s.envato.VerifyConnection(ctx, token)
	if err != nil {
		state, code, message := classifyEnvatoProviderError(err)
		status := s.EnvatoConnectionStatus()
		status.Status = state
		return status, connectionError(state, code, message, err)
	}
	if s.credentials == nil {
		status := EnvatoConnectionStatus{Provider: "envato", Status: EnvatoConnectionCredentialStoreError}
		return status, connectionError(EnvatoConnectionCredentialStoreError, "credential_store_error", "Envato credential store is unavailable", nil)
	}
	resolved, err := s.credentials.ReplacePersistent(token, verifiedMetadata(token, connection.ObservedAt))
	if err != nil {
		status := EnvatoConnectionStatus{Provider: "envato", Status: EnvatoConnectionCredentialStoreError}
		return status, connectionError(EnvatoConnectionCredentialStoreError, "credential_store_error", "Envato credential store is unavailable", err)
	}
	return connectedStatus(resolved, connection.ObservedAt), nil
}

func (s *Service) TestEnvatoConnection(ctx context.Context) (EnvatoConnectionStatus, error) {
	resolved, err := s.resolveEnvatoCredential()
	if err != nil {
		if errors.Is(err, credentialspkg.ErrNotConfigured) {
			status := EnvatoConnectionStatus{Provider: "envato", Status: EnvatoConnectionNotConfigured}
			return status, connectionError(EnvatoConnectionNotConfigured, "envato_not_configured", "Envato credential is not configured", err)
		}
		status := EnvatoConnectionStatus{Provider: "envato", Status: EnvatoConnectionCredentialStoreError}
		return status, connectionError(EnvatoConnectionCredentialStoreError, "credential_store_error", "Envato credential store is unavailable", err)
	}
	connection, err := s.envato.VerifyConnection(ctx, resolved.Token)
	if err != nil {
		state, code, message := classifyEnvatoProviderError(err)
		status := EnvatoConnectionStatus{
			Provider:              "envato",
			Configured:            true,
			EffectiveSource:       string(resolved.Source),
			CredentialFingerprint: resolved.Fingerprint,
			Status:                state,
		}
		if persistErr := s.persistStoredConnectionState(resolved, state); persistErr != nil {
			status.Status = EnvatoConnectionCredentialStoreError
			return status, connectionError(EnvatoConnectionCredentialStoreError, "credential_store_error", "Envato credential store is unavailable", errors.Join(err, persistErr))
		}
		return status, connectionError(state, code, message, err)
	}
	if resolved.Source == credentialspkg.SourceCredentialManager && s.credentials != nil {
		if err := s.credentials.WriteMetadata(verifiedMetadata(resolved.Token, connection.ObservedAt)); err != nil {
			status := EnvatoConnectionStatus{Provider: "envato", Configured: true, EffectiveSource: string(resolved.Source), CredentialFingerprint: resolved.Fingerprint, Status: EnvatoConnectionCredentialStoreError}
			return status, connectionError(EnvatoConnectionCredentialStoreError, "credential_store_error", "Envato credential store is unavailable", err)
		}
	}
	return connectedStatus(resolved, connection.ObservedAt), nil
}

func (s *Service) RemoveEnvatoCredential() (EnvatoConnectionStatus, error) {
	if s.credentials == nil {
		status := EnvatoConnectionStatus{Provider: "envato", Status: EnvatoConnectionCredentialStoreError}
		return status, connectionError(EnvatoConnectionCredentialStoreError, "credential_store_error", "Envato credential store is unavailable", nil)
	}
	if err := s.credentials.RemovePersistent(); err != nil {
		status := EnvatoConnectionStatus{Provider: "envato", Status: EnvatoConnectionCredentialStoreError}
		return status, connectionError(EnvatoConnectionCredentialStoreError, "credential_store_error", "Envato credential store is unavailable", err)
	}
	return s.EnvatoConnectionStatus(), nil
}
