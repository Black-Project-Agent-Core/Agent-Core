package web

import (
	"errors"
	"marketsignallab/internal/app"
	"marketsignallab/internal/domain"
	"net/http"
)

func (s *Server) scannerEnvatoTest(w http.ResponseWriter, r *http.Request) {
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

func (s *Server) scannerEnvatoRun(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var request domain.MarketScanRequest
	if err := decode(r, &request); err != nil {
		errOut(w, http.StatusBadRequest, err)
		return
	}
	result, err := s.svc.RunEnvatoMarketScan(r.Context(), request)
	if err != nil {
		if writeEnvatoConnectorError(w, err) {
			return
		}
		var connectorErr app.ConnectorError
		if errors.As(err, &connectorErr) {
			errOut(w, http.StatusBadGateway, errors.New("Envato scan request failed"))
			return
		}
		if errors.Is(err, r.Context().Err()) {
			errOut(w, http.StatusRequestTimeout, errors.New("Envato scan request timed out"))
			return
		}
		errOut(w, http.StatusUnprocessableEntity, err)
		return
	}
	jsonOut(w, http.StatusCreated, result)
}

func (s *Server) scannerSessions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	rows, err := s.svc.ListScannerSessions()
	if err != nil {
		errOut(w, http.StatusInternalServerError, err)
		return
	}
	jsonOut(w, http.StatusOK, rows)
}
