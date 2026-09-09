package web

import (
	"errors"
	"marketsignallab/internal/domain"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

func queryFloat(values url.Values, key string) (*float64, error) {
	raw := strings.TrimSpace(values.Get(key))
	if raw == "" {
		return nil, nil
	}
	value, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return nil, errors.New(key + " must be a number")
	}
	return &value, nil
}

func queryInt(values url.Values, key string, defaultValue int) (int, error) {
	raw := strings.TrimSpace(values.Get(key))
	if raw == "" {
		return defaultValue, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return 0, errors.New(key + " must be an integer")
	}
	return value, nil
}

func queryBool(values url.Values, key string) (bool, error) {
	raw := strings.TrimSpace(values.Get(key))
	if raw == "" {
		return false, nil
	}
	value, err := strconv.ParseBool(raw)
	if err != nil {
		return false, errors.New(key + " must be true or false")
	}
	return value, nil
}

func explorerCommon(values url.Values) (windowDays, limit, offset int, desc bool, err error) {
	windowDays, err = queryInt(values, "windowDays", 30)
	if err != nil {
		return
	}
	if windowDays < 7 || windowDays > 365 {
		err = errors.New("windowDays must be between 7 and 365")
		return
	}
	limit, err = queryInt(values, "limit", 50)
	if err != nil {
		return
	}
	offset, err = queryInt(values, "offset", 0)
	if err != nil {
		return
	}
	desc, err = queryBool(values, "desc")
	return
}

func (s *Server) explorerCatalogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	q := r.URL.Query()
	window, limit, offset, desc, err := explorerCommon(q)
	if err != nil {
		errOut(w, http.StatusBadRequest, err)
		return
	}
	minTrend, err := queryFloat(q, "minTrend")
	if err != nil {
		errOut(w, 400, err)
		return
	}
	maxTrend, err := queryFloat(q, "maxTrend")
	if err != nil {
		errOut(w, 400, err)
		return
	}
	minOpp, err := queryFloat(q, "minOpportunity")
	if err != nil {
		errOut(w, 400, err)
		return
	}
	maxOpp, err := queryFloat(q, "maxOpportunity")
	if err != nil {
		errOut(w, 400, err)
		return
	}
	minConf, err := queryFloat(q, "minConfidence")
	if err != nil {
		errOut(w, 400, err)
		return
	}
	minCov, err := queryFloat(q, "minCoverage")
	if err != nil {
		errOut(w, 400, err)
		return
	}
	minProducts, err := queryInt(q, "minObservedProducts", 0)
	if err != nil {
		errOut(w, 400, err)
		return
	}
	result, err := s.svc.ExploreCatalogs(domain.CatalogExplorerFilter{
		Text: q.Get("text"), ParentID: q.Get("parentId"), Platform: q.Get("platform"), ContentType: q.Get("contentType"),
		Level: domain.CatalogLevel(q.Get("level")), Direction: domain.MarketDirection(q.Get("direction")),
		MinTrend: minTrend, MaxTrend: maxTrend, MinOpportunity: minOpp, MaxOpportunity: maxOpp,
		MinConfidence: minConf, MinCoverage: minCov, MinObservedProducts: minProducts,
		WindowDays: window, SortBy: q.Get("sortBy"), Desc: desc, Limit: limit, Offset: offset,
	})
	if err != nil {
		errOut(w, http.StatusBadRequest, err)
		return
	}
	view, err := projectCatalogExplorerRows(result)
	if err != nil {
		errOut(w, http.StatusInternalServerError, err)
		return
	}
	jsonOut(w, http.StatusOK, view)
}

func (s *Server) explorerProducts(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	q := r.URL.Query()
	window, limit, offset, desc, err := explorerCommon(q)
	if err != nil {
		errOut(w, 400, err)
		return
	}
	minExposure, err := queryFloat(q, "minExposure")
	if err != nil {
		errOut(w, 400, err)
		return
	}
	maxExposure, err := queryFloat(q, "maxExposure")
	if err != nil {
		errOut(w, 400, err)
		return
	}
	minOpp, err := queryFloat(q, "minOpportunity")
	if err != nil {
		errOut(w, 400, err)
		return
	}
	maxOpp, err := queryFloat(q, "maxOpportunity")
	if err != nil {
		errOut(w, 400, err)
		return
	}
	minConf, err := queryFloat(q, "minConfidence")
	if err != nil {
		errOut(w, 400, err)
		return
	}
	minCov, err := queryFloat(q, "minCoverage")
	if err != nil {
		errOut(w, 400, err)
		return
	}
	minObs, err := queryInt(q, "minObservations", 0)
	if err != nil {
		errOut(w, 400, err)
		return
	}
	minQueries, err := queryInt(q, "minQueryAppearances", 0)
	if err != nil {
		errOut(w, 400, err)
		return
	}
	result, err := s.svc.ExploreProducts(domain.ProductExplorerFilter{
		Text: q.Get("text"), CatalogID: q.Get("catalogId"), AuthorID: q.Get("authorId"), Freshness: q.Get("freshness"),
		Direction: domain.MarketDirection(q.Get("direction")), MinExposure: minExposure, MaxExposure: maxExposure,
		MinOpportunity: minOpp, MaxOpportunity: maxOpp, MinConfidence: minConf, MinCoverage: minCov,
		MinObservations: minObs, MinQueryAppearances: minQueries, WindowDays: window,
		SortBy: q.Get("sortBy"), Desc: desc, Limit: limit, Offset: offset,
	})
	if err != nil {
		errOut(w, http.StatusBadRequest, err)
		return
	}
	view, err := projectProductExplorerRows(result)
	if err != nil {
		errOut(w, http.StatusInternalServerError, err)
		return
	}
	jsonOut(w, http.StatusOK, view)
}

func (s *Server) explorerAuthors(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	q := r.URL.Query()
	_, limit, offset, desc, err := explorerCommon(q)
	if err != nil {
		errOut(w, 400, err)
		return
	}
	minProducts, err := queryInt(q, "minObservedProducts", 0)
	if err != nil {
		errOut(w, 400, err)
		return
	}
	minCatalogs, err := queryInt(q, "minCatalogCount", 0)
	if err != nil {
		errOut(w, 400, err)
		return
	}
	minObservations, err := queryInt(q, "minObservationCount", 0)
	if err != nil {
		errOut(w, 400, err)
		return
	}
	result, err := s.svc.ExploreAuthors(domain.AuthorExplorerFilter{Text: q.Get("text"), CatalogID: q.Get("catalogId"), MinObservedProducts: minProducts, MinCatalogCount: minCatalogs, MinObservationCount: minObservations, SortBy: q.Get("sortBy"), Desc: desc, Limit: limit, Offset: offset})
	if err != nil {
		errOut(w, 400, err)
		return
	}
	jsonOut(w, http.StatusOK, result)
}

func (s *Server) explorerSessions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	q := r.URL.Query()
	_, limit, offset, desc, err := explorerCommon(q)
	if err != nil {
		errOut(w, 400, err)
		return
	}
	minCoverage, err := queryFloat(q, "minCoverage")
	if err != nil {
		errOut(w, 400, err)
		return
	}
	result, err := s.svc.ExploreSessions(domain.SessionExplorerFilter{Text: q.Get("text"), Status: domain.ResearchSessionStatus(q.Get("status")), SourceType: q.Get("sourceType"), CatalogID: q.Get("catalogId"), StartedFrom: q.Get("startedFrom"), StartedTo: q.Get("startedTo"), MinCoverage: minCoverage, SortBy: q.Get("sortBy"), Desc: desc, Limit: limit, Offset: offset})
	if err != nil {
		errOut(w, 400, err)
		return
	}
	jsonOut(w, http.StatusOK, result)
}

func (s *Server) savedViews(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		rows, err := s.svc.SavedViews()
		if err != nil {
			errOut(w, 500, err)
			return
		}
		jsonOut(w, 200, rows)
	case http.MethodPost:
		var v domain.SavedView
		if err := decode(r, &v); err != nil {
			errOut(w, 400, err)
			return
		}
		row, err := s.svc.SaveView(v)
		if err != nil {
			errOut(w, 422, err)
			return
		}
		jsonOut(w, 201, row)
	case http.MethodDelete:
		if err := s.svc.DeleteSavedView(strings.TrimSpace(r.URL.Query().Get("id"))); err != nil {
			errOut(w, 404, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *Server) watchlist(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		days, err := queryInt(r.URL.Query(), "windowDays", 30)
		if err != nil || days < 7 || days > 365 {
			if err == nil {
				err = errors.New("windowDays must be between 7 and 365")
			}
			errOut(w, 400, err)
			return
		}
		rows, err := s.svc.Watchlist(days)
		if err != nil {
			errOut(w, 500, err)
			return
		}
		view, err := projectWatchlistRows(rows)
		if err != nil {
			errOut(w, 500, err)
			return
		}
		jsonOut(w, 200, view)
	case http.MethodPost:
		var v domain.WatchlistEntry
		if err := decode(r, &v); err != nil {
			errOut(w, 400, err)
			return
		}
		row, err := s.svc.AddWatchlist(v)
		if err != nil {
			errOut(w, 422, err)
			return
		}
		jsonOut(w, 201, row)
	case http.MethodDelete:
		if err := s.svc.DeleteWatchlist(strings.TrimSpace(r.URL.Query().Get("id"))); err != nil {
			errOut(w, 404, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func parseIDs(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		if value := strings.TrimSpace(part); value != "" {
			out = append(out, value)
		}
	}
	return out
}

func (s *Server) compareCatalogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	days, err := queryInt(r.URL.Query(), "windowDays", 30)
	if err != nil {
		errOut(w, 400, err)
		return
	}
	rows, err := s.svc.CompareCatalogs(parseIDs(r.URL.Query().Get("ids")), days)
	if err != nil {
		errOut(w, 400, err)
		return
	}
	view, err := projectCatalogCompareRows(rows)
	if err != nil {
		errOut(w, 500, err)
		return
	}
	jsonOut(w, 200, view)
}

func (s *Server) compareProducts(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	days, err := queryInt(r.URL.Query(), "windowDays", 30)
	if err != nil {
		errOut(w, 400, err)
		return
	}
	rows, err := s.svc.CompareProducts(parseIDs(r.URL.Query().Get("ids")), days)
	if err != nil {
		errOut(w, 400, err)
		return
	}
	view, err := projectProductCompareRows(rows)
	if err != nil {
		errOut(w, 500, err)
		return
	}
	jsonOut(w, 200, view)
}
