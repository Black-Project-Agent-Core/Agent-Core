package web

import "net/http"

func (s *Server) analyticsEngineSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	jsonOut(w, http.StatusOK, s.svc.AnalyticsDiagnostics(r.Context()))
}
