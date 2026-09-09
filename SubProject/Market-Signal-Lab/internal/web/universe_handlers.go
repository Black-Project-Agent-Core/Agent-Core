package web

import (
	"errors"
	"io"
	"marketsignallab/internal/app"
	"marketsignallab/internal/domain"
	"net/http"
	"strings"
)

func (s *Server) catalogPath(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var in domain.CatalogPathInput
	if err := decode(r, &in); err != nil {
		errOut(w, http.StatusBadRequest, err)
		return
	}
	path, err := s.svc.EnsureCatalogPath(in)
	if err != nil {
		errOut(w, http.StatusUnprocessableEntity, err)
		return
	}
	jsonOut(w, http.StatusCreated, path)
}

func (s *Server) catalogUniverse(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	rows, err := s.svc.CatalogUniverse(strings.TrimSpace(r.URL.Query().Get("parentId")))
	if err != nil {
		errOut(w, http.StatusInternalServerError, err)
		return
	}
	jsonOut(w, http.StatusOK, rows)
}

func (s *Server) productUniverse(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimSpace(r.URL.Query().Get("catalogId"))
	if id == "" {
		errOut(w, http.StatusBadRequest, errors.New("catalogId required"))
		return
	}
	rows, err := s.svc.ProductUniverse(id)
	if err != nil {
		errOut(w, http.StatusUnprocessableEntity, err)
		return
	}
	jsonOut(w, http.StatusOK, rows)
}

func (s *Server) authorUniverse(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimSpace(r.URL.Query().Get("catalogId"))
	if id == "" {
		errOut(w, http.StatusBadRequest, errors.New("catalogId required"))
		return
	}
	rows, err := s.svc.AuthorUniverse(id)
	if err != nil {
		errOut(w, http.StatusUnprocessableEntity, err)
		return
	}
	jsonOut(w, http.StatusOK, rows)
}

func (s *Server) researchQueries(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		rows, err := s.svc.ListResearchQueries()
		if err != nil {
			errOut(w, http.StatusInternalServerError, err)
			return
		}
		jsonOut(w, http.StatusOK, rows)
	case http.MethodPost:
		var in domain.ResearchQuery
		if err := decode(r, &in); err != nil {
			errOut(w, http.StatusBadRequest, err)
			return
		}
		row, err := s.svc.CreateResearchQuery(in)
		if err != nil {
			errOut(w, http.StatusUnprocessableEntity, err)
			return
		}
		jsonOut(w, http.StatusCreated, row)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *Server) startResearchSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var in app.StartResearchSessionRequest
	if err := decode(r, &in); err != nil {
		errOut(w, http.StatusBadRequest, err)
		return
	}
	row, err := s.svc.StartResearchSession(in)
	if err != nil {
		errOut(w, http.StatusUnprocessableEntity, err)
		return
	}
	jsonOut(w, http.StatusCreated, row)
}

func (s *Server) researchSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimSpace(r.URL.Query().Get("id"))
	if id == "" {
		errOut(w, http.StatusBadRequest, errors.New("id required"))
		return
	}
	audit, err := s.svc.ResearchSessionAudit(id)
	if err != nil {
		errOut(w, http.StatusNotFound, err)
		return
	}
	jsonOut(w, http.StatusOK, audit)
}

func (s *Server) observeEnvatoQuery(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var in app.ObserveEnvatoQueryRequest
	if err := decode(r, &in); err != nil {
		errOut(w, http.StatusBadRequest, err)
		return
	}
	row, err := s.svc.ObserveEnvatoQuery(r.Context(), in)
	if err != nil {
		if writeEnvatoConnectorError(w, err) {
			return
		}
		var connectorErr app.ConnectorError
		if errors.As(err, &connectorErr) {
			errOut(w, http.StatusBadGateway, errors.New("Envato observation request failed"))
			return
		}
		errOut(w, http.StatusUnprocessableEntity, err)
		return
	}
	jsonOut(w, http.StatusCreated, row)
}

func (s *Server) importProductsCSV(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	n, err := s.svc.ImportObservedProductsCSV(io.LimitReader(r.Body, 4<<20))
	if err != nil {
		errOut(w, http.StatusUnprocessableEntity, err)
		return
	}
	jsonOut(w, http.StatusCreated, map[string]int{"imported": n})
}
