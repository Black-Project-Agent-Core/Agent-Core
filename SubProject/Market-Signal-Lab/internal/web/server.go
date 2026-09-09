package web

import (
	"encoding/json"
	"fmt"
	"io"
	"marketsignallab/internal/app"
	envatoconn "marketsignallab/internal/connectors/envato"
	"marketsignallab/internal/domain"
	"net/http"
	"strings"
	"time"
)

type Server struct {
	svc      *app.Service
	mux      *http.ServeMux
	previews *app.CapturePreviewStore
}

func New(svc *app.Service) *Server {
	s := &Server{svc: svc, mux: http.NewServeMux(), previews: app.NewCapturePreviewStore(time.Now, 15*time.Minute)}
	s.routes()
	return s
}
func (s *Server) Handler() http.Handler { return withHeaders(s.mux) }
func withHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}
func jsonOut(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func errOut(w http.ResponseWriter, status int, err error) {
	jsonOut(w, status, map[string]any{"error": err.Error()})
}
func decode(r *http.Request, v any) error {
	d := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 1<<20))
	d.DisallowUnknownFields()
	return d.Decode(v)
}

func (s *Server) routes() {
	s.mux.Handle("/assets/", http.StripPrefix("/assets/", http.FileServer(http.FS(embeddedAssetFS()))))
	s.mux.HandleFunc("/api/locales", s.locales)
	s.mux.HandleFunc("/api/locales/", s.localeDictionary)
	s.mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		jsonOut(w, 200, map[string]any{"ok": true, "app": "Market Signal Lab", "version": "0.3.0-alpha.6.5.3-preview.1"})
	})
	s.mux.HandleFunc("/api/system/analytics-engine", s.analyticsEngineSettings)
	s.mux.HandleFunc("/api/connections/envato", s.envatoConnection)
	s.mux.HandleFunc("/api/connections/envato/test", s.envatoConnectionTest)
	s.mux.HandleFunc("/api/consensus/dashboard", s.consensusDashboard)
	s.mux.HandleFunc("/api/consensus/contexts", s.consensusContexts)
	s.mux.HandleFunc("/api/consensus/snapshots", s.consensusSnapshots)
	s.mux.HandleFunc("/api/consensus/pairs", s.consensusPairs)
	s.mux.HandleFunc("/api/consensus/pairs/auto", s.consensusPairsAuto)
	s.mux.HandleFunc("/api/consensus/pairs/calculate", s.consensusPairCalculate)
	s.mux.HandleFunc("/api/consensus/pair", s.consensusPair)
	s.mux.HandleFunc("/api/consensus/refresh", s.consensusRefresh)
	s.mux.HandleFunc("/api/consensus/matrix", s.consensusMatrix)
	s.mux.HandleFunc("/api/consensus/selection-probability", s.consensusSelection)
	s.mux.HandleFunc("/api/consensus/volatility", s.consensusVolatility)
	s.mux.HandleFunc("/api/consensus/provenance", s.consensusProvenance)
	s.mux.HandleFunc("/api/consensus/import-json", s.consensusImportJSON)
	s.mux.HandleFunc("/api/consensus/import-csv", s.consensusImportCSV)
	s.mux.HandleFunc("/api/consensus/capture-preview", s.capturePreview)
	s.mux.HandleFunc("/api/consensus/capture-confirm", s.captureConfirm)
	s.mux.HandleFunc("/api/integrity/sample-audit", s.integritySampleAudit)
	s.mux.HandleFunc("/api/integrity/indices", s.integrityIndices)
	s.mux.HandleFunc("/api/integrity/index-history", s.integrityIndexHistory)
	s.mux.HandleFunc("/api/integrity/quality", s.integrityQuality)
	s.mux.HandleFunc("/api/integrity/surfaces", s.integritySurfaces)
	s.mux.HandleFunc("/api/integrity/provenance", s.integrityProvenance)
	s.mux.HandleFunc("/api/integrity/legacy-reviews", s.integrityLegacyReviews)
	s.mux.HandleFunc("/api/identities", s.identities)
	s.mux.HandleFunc("/api/analyze", s.analyze)
	s.mux.HandleFunc("/api/overview", s.overview)
	s.mux.HandleFunc("/api/history", s.history)
	s.mux.HandleFunc("/api/benchmark", s.benchmark)
	s.mux.HandleFunc("/api/compare", s.compare)
	s.mux.HandleFunc("/api/export", s.export)
	s.mux.HandleFunc("/api/evidence", s.evidence)
	s.mux.HandleFunc("/api/evidence/import-csv", s.importEvidenceCSV)
	s.mux.HandleFunc("/api/analyze-from-evidence", s.analyzeFromEvidence)
	s.mux.HandleFunc("/api/envato/search", s.envatoSearch)
	s.mux.HandleFunc("/api/envato/total-items", s.envatoTotalItems)
	s.mux.HandleFunc("/api/universe/catalog-path", s.catalogPath)
	s.mux.HandleFunc("/api/universe/catalogs", s.catalogUniverse)
	s.mux.HandleFunc("/api/universe/products", s.productUniverse)
	s.mux.HandleFunc("/api/universe/authors", s.authorUniverse)
	s.mux.HandleFunc("/api/research/queries", s.researchQueries)
	s.mux.HandleFunc("/api/research/sessions/start", s.startResearchSession)
	s.mux.HandleFunc("/api/research/sessions", s.researchSession)
	s.mux.HandleFunc("/api/research/envato/observe", s.observeEnvatoQuery)
	s.mux.HandleFunc("/api/research/import-products-csv", s.importProductsCSV)
	s.mux.HandleFunc("/api/scanner/envato/test", s.scannerEnvatoTest)
	s.mux.HandleFunc("/api/scanner/envato/run", s.scannerEnvatoRun)
	s.mux.HandleFunc("/api/scanner/sessions", s.scannerSessions)
	s.mux.HandleFunc("/api/autopilot/run", s.autopilotRun)
	s.mux.HandleFunc("/api/autopilot/live", s.autopilotLive)
	s.mux.HandleFunc("/api/autopilot/live/events", s.autopilotLiveEvents)
	s.mux.HandleFunc("/api/autopilot/run-log", s.autopilotRunLog)
	s.mux.HandleFunc("/api/autopilot/runtime-history", s.autopilotRuntimeHistory)
	s.mux.HandleFunc("/api/autopilot/latest", s.autopilotLatest)
	s.mux.HandleFunc("/api/autopilot/runs", s.autopilotRuns)
	s.mux.HandleFunc("/api/autopilot/history", s.autopilotHistory)
	s.mux.HandleFunc("/api/autopilot/trends", s.autopilotTrends)
	s.mux.HandleFunc("/api/autopilot/directions", s.autopilotDirections)
	s.mux.HandleFunc("/api/autopilot/direction-products", s.autopilotDirectionProducts)
	s.mux.HandleFunc("/api/autopilot/insights", s.autopilotInsights)
	s.mux.HandleFunc("/api/autopilot/alerts", s.autopilotAlerts)
	s.mux.HandleFunc("/api/autopilot/investigate", s.autopilotInvestigate)
	s.mux.HandleFunc("/api/ranking/build", s.rankingBuild)
	s.mux.HandleFunc("/api/ranking/catalogs", s.rankingCatalogs)
	s.mux.HandleFunc("/api/ranking/products", s.rankingProducts)
	s.mux.HandleFunc("/api/ranking/models", s.rankingModels)
	s.mux.HandleFunc("/api/evidence/requirements", s.evidenceRequirements)
	s.mux.HandleFunc("/api/evidence/assessments", s.evidenceAssessments)
	s.mux.HandleFunc("/api/evidence/assessment", s.evidenceAssessment)
	s.mux.HandleFunc("/api/explorer/catalogs", s.explorerCatalogs)
	s.mux.HandleFunc("/api/explorer/products", s.explorerProducts)
	s.mux.HandleFunc("/api/explorer/authors", s.explorerAuthors)
	s.mux.HandleFunc("/api/explorer/sessions", s.explorerSessions)
	s.mux.HandleFunc("/api/saved-views", s.savedViews)
	s.mux.HandleFunc("/api/watchlist", s.watchlist)
	s.mux.HandleFunc("/api/compare/catalogs", s.compareCatalogs)
	s.mux.HandleFunc("/api/compare/products", s.compareProducts)
	s.mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		fmt.Fprint(w, indexHTML)
	})
}
func (s *Server) identities(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		v, e := s.svc.ListIdentities()
		if e != nil {
			errOut(w, 500, e)
			return
		}
		jsonOut(w, 200, v)
	case http.MethodPost:
		var v domain.MarketIdentity
		if e := decode(r, &v); e != nil {
			errOut(w, 400, e)
			return
		}
		v, e := s.svc.CreateIdentity(v)
		if e != nil {
			errOut(w, 400, e)
			return
		}
		jsonOut(w, 201, v)
	default:
		w.WriteHeader(405)
	}
}
func (s *Server) analyze(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(405)
		return
	}
	var q app.AnalyzeRequest
	if e := decode(r, &q); e != nil {
		errOut(w, 400, e)
		return
	}
	v, e := s.svc.Analyze(q)
	if e != nil {
		errOut(w, 422, e)
		return
	}
	jsonOut(w, 201, v)
}
func (s *Server) overview(w http.ResponseWriter, r *http.Request) {
	v, e := s.svc.Overview()
	if e != nil {
		errOut(w, 500, e)
		return
	}
	jsonOut(w, 200, v)
}
func (s *Server) history(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.URL.Query().Get("id"))
	if id == "" {
		errOut(w, 400, fmt.Errorf("id required"))
		return
	}
	v, e := s.svc.History(id)
	if e != nil {
		errOut(w, 500, e)
		return
	}
	jsonOut(w, 200, v)
}
func (s *Server) benchmark(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(405)
		return
	}
	var v domain.Benchmark
	if e := decode(r, &v); e != nil {
		errOut(w, 400, e)
		return
	}
	v, e := s.svc.AddBenchmark(v)
	if e != nil {
		errOut(w, 500, e)
		return
	}
	jsonOut(w, 201, v)
}
func (s *Server) compare(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.URL.Query().Get("id"))
	if id == "" {
		errOut(w, 400, fmt.Errorf("id required"))
		return
	}
	v, e := s.svc.CompareLatest(id)
	if e != nil {
		errOut(w, 422, e)
		return
	}
	jsonOut(w, 200, v)
}

func (s *Server) export(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	v, err := s.svc.Export()
	if err != nil {
		errOut(w, http.StatusInternalServerError, err)
		return
	}
	w.Header().Set("Content-Disposition", "attachment; filename=market-signal-lab-export.json")
	jsonOut(w, http.StatusOK, v)
}

func (s *Server) evidence(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		id := strings.TrimSpace(r.URL.Query().Get("id"))
		if id == "" {
			errOut(w, http.StatusBadRequest, fmt.Errorf("id required"))
			return
		}
		xs, err := s.svc.Evidence(id)
		if err != nil {
			errOut(w, http.StatusInternalServerError, err)
			return
		}
		jsonOut(w, http.StatusOK, xs)
	case http.MethodPost:
		var v domain.EvidenceRecord
		if err := decode(r, &v); err != nil {
			errOut(w, http.StatusBadRequest, err)
			return
		}
		v, err := s.svc.AddEvidence(v)
		if err != nil {
			errOut(w, http.StatusBadRequest, err)
			return
		}
		jsonOut(w, http.StatusCreated, v)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *Server) importEvidenceCSV(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	body := io.LimitReader(r.Body, 2<<20)
	n, err := s.svc.ImportEvidenceCSV(body)
	if err != nil {
		errOut(w, http.StatusBadRequest, err)
		return
	}
	jsonOut(w, http.StatusCreated, map[string]int{"imported": n})
}

func (s *Server) analyzeFromEvidence(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimSpace(r.URL.Query().Get("id"))
	if id == "" {
		errOut(w, http.StatusBadRequest, fmt.Errorf("id required"))
		return
	}
	a, err := s.svc.AnalyzeFromEvidence(id)
	if err != nil {
		errOut(w, http.StatusUnprocessableEntity, err)
		return
	}
	jsonOut(w, http.StatusCreated, a)
}

type envatoSearchPayload struct {
	IdentityID string `json:"identityId"`
	Term       string `json:"term"`
	Site       string `json:"site"`
	Category   string `json:"category,omitempty"`
	Page       int    `json:"page,omitempty"`
	PageSize   int    `json:"pageSize,omitempty"`
	SortBy     string `json:"sortBy,omitempty"`
}

func (s *Server) envatoSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var p envatoSearchPayload
	if err := decode(r, &p); err != nil {
		errOut(w, http.StatusBadRequest, err)
		return
	}
	agg, evidence, err := s.svc.ResearchEnvatoSearch(r.Context(), p.IdentityID, envatoconn.SearchRequest{
		Term: p.Term, Site: p.Site, Category: p.Category, Page: p.Page, PageSize: p.PageSize, SortBy: p.SortBy,
	})
	if err != nil {
		if writeEnvatoConnectorError(w, err) {
			return
		}
		errOut(w, http.StatusBadGateway, fmt.Errorf("Envato search failed"))
		return
	}
	jsonOut(w, http.StatusCreated, map[string]any{"aggregate": agg, "evidence": evidence})
}

type envatoTotalItemsPayload struct {
	IdentityID string `json:"identityId"`
}

func (s *Server) envatoTotalItems(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var p envatoTotalItemsPayload
	if err := decode(r, &p); err != nil {
		errOut(w, http.StatusBadRequest, err)
		return
	}
	agg, evidence, err := s.svc.ResearchEnvatoTotalItems(r.Context(), p.IdentityID)
	if err != nil {
		if writeEnvatoConnectorError(w, err) {
			return
		}
		errOut(w, http.StatusBadGateway, fmt.Errorf("Envato total-items request failed"))
		return
	}
	jsonOut(w, http.StatusCreated, map[string]any{"aggregate": agg, "evidence": evidence})
}
