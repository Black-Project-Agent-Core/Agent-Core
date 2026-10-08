package web

import (
	"fmt"
	"marketsignallab/internal/domain"
	"net"
	"net/http"
	"strings"
)

func localCaptureRequest(r *http.Request) bool {
	host := r.Host
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	host = strings.Trim(host, "[]")
	return host == "127.0.0.1" || host == "localhost" || host == "::1"
}
func captureRequestAllowed(r *http.Request) error {
	if !localCaptureRequest(r) {
		return fmt.Errorf("capture endpoint is localhost-only")
	}
	if r.Header.Get("X-MSL-Explicit-Capture") != "1" {
		return fmt.Errorf("explicit capture confirmation header required")
	}
	for _, h := range []string{"Cookie", "Authorization", "Proxy-Authorization"} {
		if strings.TrimSpace(r.Header.Get(h)) != "" {
			return fmt.Errorf("private credential header %s is forbidden", h)
		}
	}
	return nil
}
func setCaptureCORS(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if strings.HasPrefix(origin, "chrome-extension://") || strings.HasPrefix(origin, "moz-extension://") {
		w.Header().Set("Access-Control-Allow-Origin", origin)
		w.Header().Set("Vary", "Origin")
	}
}
func (s *Server) capturePreview(w http.ResponseWriter, r *http.Request) {
	setCaptureCORS(w, r)
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-MSL-Explicit-Capture")
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if err := captureRequestAllowed(r); err != nil {
		errOut(w, http.StatusForbidden, err)
		return
	}
	switch r.Method {
	case http.MethodPost:
		var payload domain.SurfaceCapturePayload
		if err := decode(r, &payload); err != nil {
			errOut(w, 400, err)
			return
		}
		id, err := s.previews.Put(payload)
		if err != nil {
			errOut(w, 400, err)
			return
		}
		preview, _ := s.previews.Get(id)
		jsonOut(w, http.StatusCreated, map[string]any{"previewId": id, "preview": preview})
	case http.MethodGet:
		id := strings.TrimSpace(r.URL.Query().Get("id"))
		if id == "" {
			errOut(w, 400, fmt.Errorf("id required"))
			return
		}
		v, ok := s.previews.Get(id)
		if !ok {
			errOut(w, 404, fmt.Errorf("preview not found"))
			return
		}
		jsonOut(w, 200, v)
	case http.MethodDelete:
		id := strings.TrimSpace(r.URL.Query().Get("id"))
		if id == "" {
			errOut(w, 400, fmt.Errorf("id required"))
			return
		}
		s.previews.Delete(id)
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}
func (s *Server) captureConfirm(w http.ResponseWriter, r *http.Request) {
	setCaptureCORS(w, r)
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-MSL-Explicit-Capture")
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if err := captureRequestAllowed(r); err != nil {
		errOut(w, http.StatusForbidden, err)
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		PreviewID string `json:"previewId"`
	}
	if err := decode(r, &req); err != nil {
		errOut(w, 400, err)
		return
	}
	preview, ok := s.previews.Take(strings.TrimSpace(req.PreviewID))
	if !ok {
		errOut(w, 404, fmt.Errorf("preview not found or expired"))
		return
	}
	view, err := s.svc.CreateSurfaceSnapshot(preview.Payload)
	if err != nil {
		errOut(w, 422, err)
		return
	}
	jsonOut(w, http.StatusCreated, view)
}
