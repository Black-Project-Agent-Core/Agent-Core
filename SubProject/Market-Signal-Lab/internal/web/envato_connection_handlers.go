package web

import (
	"errors"
	"net/http"
	"strings"
)

type envatoCredentialRequest struct {
	Token string `json:"token"`
}

func (s *Server) envatoConnection(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		jsonOut(w, http.StatusOK, s.svc.EnvatoConnectionStatus())
	case http.MethodPost:
		var request envatoCredentialRequest
		if err := decode(r, &request); err != nil {
			errOut(w, http.StatusBadRequest, err)
			return
		}
		request.Token = strings.TrimSpace(request.Token)
		if request.Token == "" {
			errOut(w, http.StatusBadRequest, errors.New("Envato credential is required"))
			return
		}
		status, err := s.svc.SaveEnvatoCredential(r.Context(), request.Token)
		request.Token = ""
		if err != nil {
			if writeEnvatoConnectorError(w, err) {
				return
			}
			errOut(w, http.StatusBadGateway, errors.New("Envato credential setup failed"))
			return
		}
		jsonOut(w, http.StatusOK, status)
	case http.MethodDelete:
		status, err := s.svc.RemoveEnvatoCredential()
		if err != nil {
			if writeEnvatoConnectorError(w, err) {
				return
			}
			errOut(w, http.StatusServiceUnavailable, errors.New("Envato credential removal failed"))
			return
		}
		jsonOut(w, http.StatusOK, status)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *Server) envatoConnectionTest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	status, err := s.svc.TestEnvatoConnection(r.Context())
	if err != nil {
		if writeEnvatoConnectorError(w, err) {
			return
		}
		errOut(w, http.StatusBadGateway, errors.New("Envato connection test failed"))
		return
	}
	jsonOut(w, http.StatusOK, status)
}
