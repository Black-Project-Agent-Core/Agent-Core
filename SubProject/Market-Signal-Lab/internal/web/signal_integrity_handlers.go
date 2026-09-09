package web

import (
	"errors"
	"marketsignallab/internal/domain"
	"net/http"
	"strings"
)

func requireGET(w http.ResponseWriter, r *http.Request) bool {
	if r.Method == http.MethodGet {
		return true
	}
	w.WriteHeader(http.StatusMethodNotAllowed)
	return false
}

func requiredQuery(r *http.Request, key string) (string, bool) {
	value := strings.TrimSpace(r.URL.Query().Get(key))
	return value, value != ""
}

func parseSegmentLevel(value string) (domain.SegmentLevel, bool) {
	level := domain.SegmentLevel(strings.TrimSpace(value))
	switch level {
	case domain.SegmentLevelGlobal, domain.SegmentLevelSite, domain.SegmentLevelContentType,
		domain.SegmentLevelCatalog, domain.SegmentLevelProductType, domain.SegmentLevelUseCase:
		return level, true
	default:
		return "", false
	}
}

func (s *Server) integritySampleAudit(w http.ResponseWriter, r *http.Request) {
	if !requireGET(w, r) {
		return
	}
	runID, ok := requiredQuery(r, "runId")
	if !ok {
		errOut(w, http.StatusBadRequest, errors.New("runId is required"))
		return
	}
	row, found, err := s.svc.IntegritySampleAudit(runID)
	if err != nil {
		errOut(w, http.StatusInternalServerError, err)
		return
	}
	if !found {
		errOut(w, http.StatusNotFound, errors.New("sample audit not found"))
		return
	}
	jsonOut(w, http.StatusOK, row)
}

func (s *Server) integrityIndices(w http.ResponseWriter, r *http.Request) {
	if !requireGET(w, r) {
		return
	}
	runID, ok := requiredQuery(r, "runId")
	if !ok {
		errOut(w, http.StatusBadRequest, errors.New("runId is required"))
		return
	}
	var level domain.SegmentLevel
	if raw := strings.TrimSpace(r.URL.Query().Get("level")); raw != "" {
		var valid bool
		level, valid = parseSegmentLevel(raw)
		if !valid {
			errOut(w, http.StatusBadRequest, errors.New("invalid level"))
			return
		}
	}
	rows, err := s.svc.IntegrityIndices(runID, level, r.URL.Query().Get("entityId"))
	if err != nil {
		errOut(w, http.StatusInternalServerError, err)
		return
	}
	if len(rows) == 0 {
		errOut(w, http.StatusNotFound, errors.New("market indices not found"))
		return
	}
	projected, err := projectIntegrityIndexRows(rows)
	if err != nil {
		errOut(w, http.StatusInternalServerError, err)
		return
	}
	jsonOut(w, http.StatusOK, projected)
}

func (s *Server) integrityIndexHistory(w http.ResponseWriter, r *http.Request) {
	if !requireGET(w, r) {
		return
	}
	rawLevel, hasLevel := requiredQuery(r, "level")
	entityID, hasEntity := requiredQuery(r, "entityId")
	if !hasLevel || !hasEntity {
		errOut(w, http.StatusBadRequest, errors.New("level and entityId are required"))
		return
	}
	level, ok := parseSegmentLevel(rawLevel)
	if !ok {
		errOut(w, http.StatusBadRequest, errors.New("invalid level"))
		return
	}
	rows, err := s.svc.IntegrityIndexHistory(level, entityID)
	if err != nil {
		errOut(w, http.StatusInternalServerError, err)
		return
	}
	if len(rows) == 0 {
		errOut(w, http.StatusNotFound, errors.New("market index history not found"))
		return
	}
	projected, err := projectIntegrityIndexRows(rows)
	if err != nil {
		errOut(w, http.StatusInternalServerError, err)
		return
	}
	jsonOut(w, http.StatusOK, projected)
}

func (s *Server) integrityQuality(w http.ResponseWriter, r *http.Request) {
	if !requireGET(w, r) {
		return
	}
	runID, ok := requiredQuery(r, "runId")
	if !ok {
		errOut(w, http.StatusBadRequest, errors.New("runId is required"))
		return
	}
	rows, err := s.svc.IntegrityQuality(runID, r.URL.Query().Get("entityType"), r.URL.Query().Get("entityId"))
	if err != nil {
		errOut(w, http.StatusInternalServerError, err)
		return
	}
	if len(rows) == 0 {
		errOut(w, http.StatusNotFound, errors.New("data quality assessment not found"))
		return
	}
	jsonOut(w, http.StatusOK, rows)
}

func (s *Server) integritySurfaces(w http.ResponseWriter, r *http.Request) {
	if !requireGET(w, r) {
		return
	}
	runID, ok := requiredQuery(r, "runId")
	if !ok {
		errOut(w, http.StatusBadRequest, errors.New("runId is required"))
		return
	}
	rows, err := s.svc.IntegritySurfaceBreakdown(runID)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "not found") {
			errOut(w, http.StatusNotFound, err)
		} else {
			errOut(w, http.StatusInternalServerError, err)
		}
		return
	}
	jsonOut(w, http.StatusOK, rows)
}

func (s *Server) integrityProvenance(w http.ResponseWriter, r *http.Request) {
	if !requireGET(w, r) {
		return
	}
	id, ok := requiredQuery(r, "id")
	if !ok {
		errOut(w, http.StatusBadRequest, errors.New("id is required"))
		return
	}
	row, found, err := s.svc.IntegrityProvenance(id)
	if err != nil {
		errOut(w, http.StatusInternalServerError, err)
		return
	}
	if !found {
		errOut(w, http.StatusNotFound, errors.New("score provenance not found"))
		return
	}
	jsonOut(w, http.StatusOK, row)
}

func (s *Server) integrityLegacyReviews(w http.ResponseWriter, r *http.Request) {
	if !requireGET(w, r) {
		return
	}
	rows, err := s.svc.IntegrityLegacyReviews(r.URL.Query().Get("status"), r.URL.Query().Get("catalogId"))
	if err != nil {
		errOut(w, http.StatusInternalServerError, err)
		return
	}
	jsonOut(w, http.StatusOK, rows)
}
