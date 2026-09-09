package web

import (
	"fmt"
	"net/http"
	"strings"

	"marketsignallab/internal/domain"
	evidencepkg "marketsignallab/internal/evidence"
)

type evidenceRequirementsResponse struct {
	ContractVersion     string                             `json:"contractVersion"`
	RequirementsVersion string                             `json:"requirementsVersion"`
	Requirements        []domain.SignalEvidenceRequirement `json:"requirements"`
}

type evidenceAssessmentsResponse struct {
	ContractVersion string                                  `json:"contractVersion"`
	Assessments     []domain.SignalEvidenceAssessmentRecord `json:"assessments"`
}

type evidenceAssessmentResponse struct {
	ContractVersion string                                `json:"contractVersion"`
	Assessment      domain.SignalEvidenceAssessmentRecord `json:"assessment"`
}

type evidenceBuildResponse struct {
	ContractVersion string                     `json:"contractVersion"`
	Result          domain.EvidenceBuildResult `json:"result"`
}

type evidenceBuildRequest struct {
	RunID               string `json:"runId"`
	RequirementsVersion string `json:"requirementsVersion,omitempty"`
}

func validateEvidenceRequestVersions(r *http.Request) error {
	contractVersion := strings.TrimSpace(r.URL.Query().Get("contractVersion"))
	if contractVersion != "" {
		if err := evidencepkg.ValidateContractVersion(contractVersion); err != nil {
			return err
		}
	}
	requirementsVersion := strings.TrimSpace(r.URL.Query().Get("requirementsVersion"))
	if requirementsVersion != "" {
		if err := evidencepkg.ValidateRequirementsVersion(requirementsVersion); err != nil {
			return err
		}
	}
	return nil
}

func (s *Server) evidenceRequirements(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if err := validateEvidenceRequestVersions(r); err != nil {
		errOut(w, http.StatusBadRequest, err)
		return
	}
	version := strings.TrimSpace(r.URL.Query().Get("requirementsVersion"))
	if version == "" {
		version = evidencepkg.RequirementsVersion
	}
	requirements, err := s.svc.EvidenceRequirementsVersion(version)
	if err != nil {
		errOut(w, http.StatusBadRequest, err)
		return
	}
	jsonOut(w, http.StatusOK, evidenceRequirementsResponse{
		ContractVersion:     evidencepkg.ContractVersion,
		RequirementsVersion: version,
		Requirements:        requirements,
	})
}

func (s *Server) evidenceAssessments(w http.ResponseWriter, r *http.Request) {
	if err := validateEvidenceRequestVersions(r); err != nil {
		errOut(w, http.StatusBadRequest, err)
		return
	}

	switch r.Method {
	case http.MethodGet:
		filter := domain.SignalEvidenceAssessmentFilter{
			RunID:               strings.TrimSpace(r.URL.Query().Get("runId")),
			EntityType:          strings.TrimSpace(r.URL.Query().Get("entityType")),
			EntityID:            strings.TrimSpace(r.URL.Query().Get("entityId")),
			SignalID:            strings.TrimSpace(r.URL.Query().Get("signalId")),
			SignalModelVersion:  strings.TrimSpace(r.URL.Query().Get("signalModelVersion")),
			RequirementsVersion: strings.TrimSpace(r.URL.Query().Get("requirementsVersion")),
		}
		rows, err := s.svc.EvidenceAssessments(filter)
		if err != nil {
			errOut(w, http.StatusInternalServerError, err)
			return
		}
		assessmentID := strings.TrimSpace(r.URL.Query().Get("assessmentId"))
		if assessmentID != "" {
			filtered := make([]domain.SignalEvidenceAssessmentRecord, 0, 1)
			for _, row := range rows {
				if row.AssessmentID == assessmentID {
					filtered = append(filtered, row)
				}
			}
			rows = filtered
		}
		jsonOut(w, http.StatusOK, evidenceAssessmentsResponse{
			ContractVersion: evidencepkg.ContractVersion,
			Assessments:     rows,
		})
	case http.MethodPost:
		var request evidenceBuildRequest
		if err := decode(r, &request); err != nil {
			errOut(w, http.StatusBadRequest, err)
			return
		}
		version := strings.TrimSpace(request.RequirementsVersion)
		if version == "" {
			version = evidencepkg.RequirementsVersion
		}
		if err := evidencepkg.ValidateRequirementsVersion(version); err != nil {
			errOut(w, http.StatusBadRequest, err)
			return
		}
		var result domain.EvidenceBuildResult
		var err error
		switch version {
		case evidencepkg.RequirementsVersion:
			result, err = s.svc.BuildEvidenceAssessments(strings.TrimSpace(request.RunID))
		case evidencepkg.RequirementsVersionC31:
			result, err = s.svc.BuildEvidenceAssessmentsC31(strings.TrimSpace(request.RunID))
		default:
			err = fmt.Errorf("unsupported evidence requirements %q", version)
		}
		if err != nil {
			errOut(w, http.StatusUnprocessableEntity, err)
			return
		}
		jsonOut(w, http.StatusCreated, evidenceBuildResponse{
			ContractVersion: evidencepkg.ContractVersion,
			Result:          result,
		})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *Server) evidenceAssessment(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if err := validateEvidenceRequestVersions(r); err != nil {
		errOut(w, http.StatusBadRequest, err)
		return
	}

	filter := domain.SignalEvidenceAssessmentFilter{
		RunID:               strings.TrimSpace(r.URL.Query().Get("runId")),
		EntityType:          strings.TrimSpace(r.URL.Query().Get("entityType")),
		EntityID:            strings.TrimSpace(r.URL.Query().Get("entityId")),
		SignalID:            strings.TrimSpace(r.URL.Query().Get("signalId")),
		SignalModelVersion:  strings.TrimSpace(r.URL.Query().Get("signalModelVersion")),
		RequirementsVersion: strings.TrimSpace(r.URL.Query().Get("requirementsVersion")),
	}
	if filter.RunID == "" || filter.EntityType == "" || filter.EntityID == "" || filter.SignalID == "" {
		errOut(w, http.StatusBadRequest, fmt.Errorf("runId, entityType, entityId, and signalId are required"))
		return
	}

	row, ok, err := s.svc.EvidenceAssessment(filter)
	if err != nil {
		errOut(w, http.StatusInternalServerError, err)
		return
	}
	if !ok {
		errOut(w, http.StatusNotFound, fmt.Errorf("evidence assessment not found"))
		return
	}
	jsonOut(w, http.StatusOK, evidenceAssessmentResponse{
		ContractVersion: evidencepkg.ContractVersion,
		Assessment:      row,
	})
}
