package web

import (
	"errors"
	"marketsignallab/internal/domain"
	"net/http"
	"strconv"
	"strings"
)

func rankingWindowDays(r *http.Request) (int, error) {
	raw := strings.TrimSpace(r.URL.Query().Get("windowDays"))
	if raw == "" {
		return 30, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return 0, errors.New("windowDays must be an integer")
	}
	if value < 7 || value > 365 {
		return 0, errors.New("windowDays must be between 7 and 365")
	}
	return value, nil
}

func (s *Server) rankingBuild(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var request domain.RankingBuildRequest
	if err := decode(r, &request); err != nil {
		errOut(w, http.StatusBadRequest, err)
		return
	}
	result, err := s.svc.BuildRankings(request)
	if err != nil {
		message := strings.ToLower(err.Error())
		switch {
		case strings.Contains(message, "catalog scope not found"):
			errOut(w, http.StatusNotFound, err)
		case strings.Contains(message, "windowdays"), strings.Contains(message, "asof"), strings.Contains(message, "no observations"):
			errOut(w, http.StatusUnprocessableEntity, err)
		default:
			errOut(w, http.StatusInternalServerError, err)
		}
		return
	}
	jsonOut(w, http.StatusCreated, result)
}

func (s *Server) rankingCatalogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	days, err := rankingWindowDays(r)
	if err != nil {
		errOut(w, http.StatusBadRequest, err)
		return
	}
	rows, err := s.svc.CatalogRankings(domain.CatalogSnapshotFilter{
		CatalogID:    strings.TrimSpace(r.URL.Query().Get("catalogId")),
		ParentID:     strings.TrimSpace(r.URL.Query().Get("parentId")),
		WindowDays:   days,
		AsOf:         strings.TrimSpace(r.URL.Query().Get("asOf")),
		ModelVersion: strings.TrimSpace(r.URL.Query().Get("modelVersion")),
	})
	if err != nil {
		errOut(w, http.StatusInternalServerError, err)
		return
	}
	projected, err := projectCatalogRankingRows(rows)
	if err != nil {
		errOut(w, http.StatusInternalServerError, err)
		return
	}
	jsonOut(w, http.StatusOK, projected)
}

func (s *Server) rankingProducts(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	days, err := rankingWindowDays(r)
	if err != nil {
		errOut(w, http.StatusBadRequest, err)
		return
	}
	rows, err := s.svc.ProductRankings(domain.ProductSnapshotFilter{
		ProductID:    strings.TrimSpace(r.URL.Query().Get("productId")),
		CatalogID:    strings.TrimSpace(r.URL.Query().Get("catalogId")),
		WindowDays:   days,
		AsOf:         strings.TrimSpace(r.URL.Query().Get("asOf")),
		ModelVersion: strings.TrimSpace(r.URL.Query().Get("modelVersion")),
	})
	if err != nil {
		errOut(w, http.StatusInternalServerError, err)
		return
	}
	projected, err := projectProductRankingRows(rows)
	if err != nil {
		errOut(w, http.StatusInternalServerError, err)
		return
	}
	jsonOut(w, http.StatusOK, projected)
}

func (s *Server) rankingModels(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	jsonOut(w, http.StatusOK, s.svc.RankingModels())
}
