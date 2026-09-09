package web

import (
	"encoding/csv"
	"fmt"
	"io"
	"marketsignallab/internal/domain"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func consensusLimit(r *http.Request) (int, error) {
	raw := strings.TrimSpace(r.URL.Query().Get("limit"))
	if raw == "" {
		return 200, nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 1 || n > 500 {
		return 0, fmt.Errorf("limit must be 1..500")
	}
	return n, nil
}
func consensusRange(r *http.Request) (string, string) {
	return strings.TrimSpace(r.URL.Query().Get("from")), strings.TrimSpace(r.URL.Query().Get("to"))
}
func (s *Server) consensusDashboard(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(405)
		return
	}
	limit, err := consensusLimit(r)
	if err != nil {
		errOut(w, 400, err)
		return
	}
	from, to := consensusRange(r)
	v, err := s.svc.ConsensusDashboard(domain.ConsensusDashboardFilter{CatalogPath: r.URL.Query().Get("catalogPath"), ContentType: r.URL.Query().Get("contentType"), EntityType: r.URL.Query().Get("entityType"), SignalState: r.URL.Query().Get("signalState"), From: from, To: to, Limit: limit})
	if err != nil {
		errOut(w, 500, err)
		return
	}
	jsonOut(w, 200, v)
}
func (s *Server) consensusContexts(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(405)
		return
	}
	limit, err := consensusLimit(r)
	if err != nil {
		errOut(w, 400, err)
		return
	}
	from, to := consensusRange(r)
	v, err := s.svc.ConsensusContexts(domain.ObservationContextFilter{ID: r.URL.Query().Get("id"), Experience: r.URL.Query().Get("contextType"), AccessState: r.URL.Query().Get("accessState"), CatalogPath: r.URL.Query().Get("catalogPath"), From: from, To: to, Limit: limit})
	if err != nil {
		errOut(w, 500, err)
		return
	}
	jsonOut(w, 200, v)
}
func (s *Server) consensusSnapshots(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(405)
		return
	}
	limit, err := consensusLimit(r)
	if err != nil {
		errOut(w, 400, err)
		return
	}
	from, to := consensusRange(r)
	v, err := s.svc.ConsensusSnapshots(domain.SurfaceSnapshotFilter{ID: r.URL.Query().Get("id"), ContextID: r.URL.Query().Get("contextId"), CaptureBatchID: r.URL.Query().Get("batchId"), CatalogPath: r.URL.Query().Get("catalogPath"), SortMode: r.URL.Query().Get("sortMode"), From: from, To: to, Limit: limit})
	if err != nil {
		errOut(w, 500, err)
		return
	}
	jsonOut(w, 200, v)
}
func (s *Server) consensusPairs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(405)
		return
	}
	limit, err := consensusLimit(r)
	if err != nil {
		errOut(w, 400, err)
		return
	}
	from, to := consensusRange(r)
	v, err := s.svc.ConsensusPairs(domain.SnapshotPairFilter{ID: r.URL.Query().Get("pairId"), CaptureBatchID: r.URL.Query().Get("batchId"), SnapshotID: r.URL.Query().Get("snapshotId"), ContextID: r.URL.Query().Get("contextId"), From: from, To: to, Limit: limit})
	if err != nil {
		errOut(w, 500, err)
		return
	}
	jsonOut(w, 200, v)
}
func (s *Server) consensusPairsAuto(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(405)
		return
	}
	var q struct {
		BatchID          string `json:"batchId"`
		ToleranceMinutes int    `json:"toleranceMinutes,omitempty"`
	}
	if err := decode(r, &q); err != nil {
		errOut(w, 400, err)
		return
	}
	if q.BatchID == "" {
		errOut(w, 400, fmt.Errorf("batchId required"))
		return
	}
	if q.ToleranceMinutes <= 0 {
		q.ToleranceMinutes = 10
	}
	v, err := s.svc.AutoPairCaptureBatch(q.BatchID, time.Duration(q.ToleranceMinutes)*time.Minute)
	if err != nil {
		errOut(w, 500, err)
		return
	}
	jsonOut(w, 200, v)
}
func (s *Server) consensusPairCalculate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(405)
		return
	}
	var q struct {
		PairID string `json:"pairId"`
	}
	if err := decode(r, &q); err != nil {
		errOut(w, 400, err)
		return
	}
	if q.PairID == "" {
		errOut(w, 400, fmt.Errorf("pairId required"))
		return
	}
	pairs, err := s.svc.ConsensusPairs(domain.SnapshotPairFilter{ID: q.PairID})
	if err != nil {
		errOut(w, 500, err)
		return
	}
	if len(pairs) == 0 {
		errOut(w, 404, fmt.Errorf("pair not found"))
		return
	}
	if !pairs[0].Comparable {
		jsonOut(w, http.StatusUnprocessableEntity, map[string]any{"error": "pair_not_comparable", "pair": pairs[0], "reasonCodes": pairs[0].ReasonCodes})
		return
	}
	v, err := s.svc.CalculatePair(q.PairID)
	if err != nil {
		errOut(w, 422, err)
		return
	}
	jsonOut(w, 200, v)
}
func (s *Server) consensusPair(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(405)
		return
	}
	id := strings.TrimSpace(r.URL.Query().Get("pairId"))
	if id == "" {
		errOut(w, 400, fmt.Errorf("pairId required"))
		return
	}
	v, err := s.svc.PairComparison(id)
	if err != nil {
		errOut(w, 404, err)
		return
	}
	jsonOut(w, 200, v)
}
func (s *Server) consensusRefresh(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(405)
		return
	}
	var q domain.ConsensusRefreshRequest
	if err := decode(r, &q); err != nil {
		errOut(w, 400, err)
		return
	}
	v, err := s.svc.RefreshMultiContextConsensus(q)
	if err != nil {
		errOut(w, 422, err)
		return
	}
	jsonOut(w, 200, v)
}
func (s *Server) consensusMatrix(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(405)
		return
	}
	limit, err := consensusLimit(r)
	if err != nil {
		errOut(w, 400, err)
		return
	}
	from, to := consensusRange(r)
	v, err := s.svc.ContextMatrix(domain.ContextMatrixFilter{CatalogPath: r.URL.Query().Get("catalogPath"), ContentType: r.URL.Query().Get("contentType"), EntityType: r.URL.Query().Get("entityType"), From: from, To: to, Limit: limit})
	if err != nil {
		errOut(w, 500, err)
		return
	}
	jsonOut(w, 200, v)
}
func (s *Server) consensusSelection(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(405)
		return
	}
	limit, err := consensusLimit(r)
	if err != nil {
		errOut(w, 400, err)
		return
	}
	from, to := consensusRange(r)
	v, err := s.svc.ConsensusSelection(domain.SelectionProbabilityFilter{ID: r.URL.Query().Get("id"), EntityType: r.URL.Query().Get("entityType"), EntityID: r.URL.Query().Get("entityId"), From: from, To: to, Limit: limit})
	if err != nil {
		errOut(w, 500, err)
		return
	}
	jsonOut(w, 200, v)
}
func (s *Server) consensusVolatility(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(405)
		return
	}
	limit, err := consensusLimit(r)
	if err != nil {
		errOut(w, 400, err)
		return
	}
	from, to := consensusRange(r)
	v, err := s.svc.ConsensusVolatility(domain.RankingVolatilityFilter{ID: r.URL.Query().Get("id"), EntityType: r.URL.Query().Get("entityType"), EntityID: r.URL.Query().Get("entityId"), ContextKey: r.URL.Query().Get("contextKey"), From: from, To: to, Limit: limit})
	if err != nil {
		errOut(w, 500, err)
		return
	}
	jsonOut(w, 200, v)
}
func (s *Server) consensusProvenance(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(405)
		return
	}
	limit, err := consensusLimit(r)
	if err != nil {
		errOut(w, 400, err)
		return
	}
	from, to := consensusRange(r)
	v, err := s.svc.ConsensusProvenance(domain.ConsensusScoreProvenanceFilter{ID: r.URL.Query().Get("id"), PairID: r.URL.Query().Get("pairId"), ScoreType: r.URL.Query().Get("scoreType"), EntityType: r.URL.Query().Get("entityType"), EntityID: r.URL.Query().Get("entityId"), From: from, To: to, Limit: limit})
	if err != nil {
		errOut(w, 500, err)
		return
	}
	if r.URL.Query().Get("id") != "" && len(v) == 0 {
		errOut(w, 404, fmt.Errorf("provenance not found"))
		return
	}
	jsonOut(w, 200, v)
}
func (s *Server) consensusImportJSON(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(405)
		return
	}
	var p domain.SurfaceCapturePayload
	if err := decode(r, &p); err != nil {
		errOut(w, 400, err)
		return
	}
	v, err := s.svc.CreateSurfaceSnapshot(p)
	if err != nil {
		errOut(w, 422, err)
		return
	}
	jsonOut(w, 201, v)
}
func (s *Server) consensusImportCSV(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(405)
		return
	}
	rd := csv.NewReader(io.LimitReader(r.Body, 1<<20))
	rows, err := rd.ReadAll()
	if err != nil || len(rows) < 2 {
		errOut(w, 400, fmt.Errorf("invalid CSV"))
		return
	}
	idx := map[string]int{}
	for i, h := range rows[0] {
		idx[strings.TrimSpace(h)] = i
	}
	get := func(row []string, key string) string {
		if i, ok := idx[key]; ok && i < len(row) {
			return strings.TrimSpace(row[i])
		}
		return ""
	}
	topK, _ := strconv.Atoi(r.URL.Query().Get("topK"))
	if topK <= 0 {
		topK = len(rows) - 1
	}
	payload := domain.SurfaceCapturePayload{Context: domain.ObservationContextInput{Platform: domain.ObservationPlatform(r.URL.Query().Get("platform")), Experience: domain.ObservationExperience(r.URL.Query().Get("experience")), AccessState: domain.ObservationAccessState(r.URL.Query().Get("accessState")), SourceMethod: domain.ObservationSourceCSV, SourceSite: r.URL.Query().Get("sourceSite"), CatalogPath: r.URL.Query().Get("catalogPath"), ContentType: r.URL.Query().Get("contentType"), SortMode: r.URL.Query().Get("sortMode"), Locale: r.URL.Query().Get("locale"), PageSizeOrTopK: topK, ContextLabel: r.URL.Query().Get("label")}, PageURL: r.URL.Query().Get("pageUrl"), TopKRequested: topK, CaptureStatus: "complete", ExtractorVersion: "csv-import-v0.1"}
	for n, row := range rows[1:] {
		rank, _ := strconv.Atoi(get(row, "rank"))
		if rank <= 0 {
			rank = n + 1
		}
		payload.Items = append(payload.Items, domain.SurfaceCaptureItem{Rank: rank, ExternalItemID: get(row, "externalItemId"), SourceURL: get(row, "sourceUrl"), Title: get(row, "title"), AuthorPublicName: get(row, "author"), ProductTypeID: get(row, "productType"), UseCaseID: get(row, "useCase"), NormalizedCatalogID: get(row, "catalog")})
	}
	v, err := s.svc.CreateSurfaceSnapshot(payload)
	if err != nil {
		errOut(w, 422, err)
		return
	}
	jsonOut(w, 201, v)
}
