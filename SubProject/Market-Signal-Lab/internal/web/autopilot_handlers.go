package web

import (
	"errors"
	"marketsignallab/internal/domain"
	"net/http"
	"strings"
)

type autopilotRunRequest struct {
	Mode     domain.MarketMapMode `json:"mode,omitempty"`
	ScanMode domain.MarketMapMode `json:"scanMode,omitempty"`
}

type autopilotInvestigateRequest struct {
	SourceType string `json:"sourceType"`
	SourceID   string `json:"sourceId"`
}

func (s *Server) autopilotRun(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var request autopilotRunRequest
	if err := decode(r, &request); err != nil {
		errOut(w, http.StatusBadRequest, err)
		return
	}
	mode := request.ScanMode
	if mode == "" {
		mode = request.Mode
	}
	if mode == "" {
		mode = domain.MarketMapModeStandard
	}
	snap, err := s.svc.StartMarketAutopilot(r.Context(), mode)
	if err != nil {
		if strings.Contains(err.Error(), "already active") {
			jsonOut(w, http.StatusConflict, map[string]any{"error": err.Error(), "code": "autopilot_run_active", "run": snap})
			return
		}
		if writeEnvatoConnectorError(w, err) {
			return
		}
		errOut(w, http.StatusUnprocessableEntity, err)
		return
	}
	jsonOut(w, http.StatusAccepted, snap)
}

func (s *Server) autopilotLatest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	view, ok, err := s.svc.LatestAutopilotView()
	if err != nil {
		errOut(w, http.StatusInternalServerError, err)
		return
	}
	if !ok {
		jsonOut(w, http.StatusOK, map[string]any{"available": false})
		return
	}
	jsonOut(w, http.StatusOK, map[string]any{"available": true, "view": view})
}

func (s *Server) autopilotRuns(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	rows, err := s.svc.AutopilotRuns()
	if err != nil {
		errOut(w, http.StatusInternalServerError, err)
		return
	}
	jsonOut(w, http.StatusOK, rows)
}

func (s *Server) autopilotHistory(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	rows, err := s.svc.AutopilotHistory()
	if err != nil {
		errOut(w, http.StatusInternalServerError, err)
		return
	}
	jsonOut(w, http.StatusOK, rows)
}

func (s *Server) latestAutopilotSection(w http.ResponseWriter, r *http.Request, selectRows func(domain.MarketAutopilotView) any) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	view, ok, err := s.svc.LatestAutopilotView()
	if err != nil {
		errOut(w, http.StatusInternalServerError, err)
		return
	}
	if !ok {
		jsonOut(w, http.StatusOK, []any{})
		return
	}
	jsonOut(w, http.StatusOK, selectRows(view))
}

func (s *Server) autopilotTrends(w http.ResponseWriter, r *http.Request) {
	s.latestAutopilotSection(w, r, func(view domain.MarketAutopilotView) any { return view.Catalogs })
}
func (s *Server) autopilotDirections(w http.ResponseWriter, r *http.Request) {
	s.latestAutopilotSection(w, r, func(view domain.MarketAutopilotView) any { return view.Directions })
}
func (s *Server) autopilotInsights(w http.ResponseWriter, r *http.Request) {
	s.latestAutopilotSection(w, r, func(view domain.MarketAutopilotView) any { return view.Insights })
}
func (s *Server) autopilotAlerts(w http.ResponseWriter, r *http.Request) {
	s.latestAutopilotSection(w, r, func(view domain.MarketAutopilotView) any { return view.Alerts })
}

func (s *Server) autopilotDirectionProducts(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	directionID := strings.TrimSpace(r.URL.Query().Get("id"))
	if directionID == "" {
		errOut(w, http.StatusBadRequest, errors.New("product direction id is required"))
		return
	}
	rows, err := s.svc.ProductDirectionSourceProducts(directionID)
	if err != nil {
		status := http.StatusUnprocessableEntity
		if strings.Contains(err.Error(), "not found") {
			status = http.StatusNotFound
		}
		errOut(w, status, err)
		return
	}
	jsonOut(w, http.StatusOK, rows)
}

func (s *Server) autopilotInvestigate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var request autopilotInvestigateRequest
	if err := decode(r, &request); err != nil {
		errOut(w, http.StatusBadRequest, err)
		return
	}
	seed, err := s.svc.CreateAdvancedResearchSeed(request.SourceType, request.SourceID)
	if err != nil {
		errOut(w, http.StatusUnprocessableEntity, err)
		return
	}
	jsonOut(w, http.StatusCreated, seed)
}
