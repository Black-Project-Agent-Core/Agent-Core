package universe

import (
	"errors"
	"marketsignallab/internal/domain"
	"marketsignallab/internal/segmentation"
	"regexp"
	"strings"
)

var nonKey = regexp.MustCompile(`[^a-z0-9]+`)

func keyPart(v string) string {
	v = strings.ToLower(strings.TrimSpace(v))
	v = nonKey.ReplaceAllString(v, "-")
	return strings.Trim(v, "-")
}

func CanonicalCatalogKey(platform, parentKey string, level domain.CatalogLevel, name string) string {
	part := string(level) + ":" + keyPart(name)
	if parentKey == "" {
		return keyPart(platform) + "/" + part
	}
	return parentKey + "/" + part
}

func IsCatalogWithin(nodes []domain.CatalogNode, scopeID, candidateID string) bool {
	if scopeID == "" || candidateID == "" {
		return false
	}
	if scopeID == candidateID {
		return true
	}
	byID := map[string]domain.CatalogNode{}
	for _, n := range nodes {
		byID[n.ID] = n
	}
	current := candidateID
	for current != "" {
		n, ok := byID[current]
		if !ok {
			return false
		}
		if n.ParentID == scopeID {
			return true
		}
		current = n.ParentID
	}
	return false
}

func BuildCatalogPath(in domain.CatalogPathInput, observedAt string) ([]domain.CatalogNode, error) {
	if strings.TrimSpace(in.Platform) == "" || strings.TrimSpace(in.ContentType) == "" {
		return nil, errors.New("platform and contentType are required")
	}
	if in.Origin == domain.CatalogOriginScanner || in.SourceSurface != "" {
		for _, value := range []string{in.Catalog, in.Subcatalog, in.Theme, in.Niche, in.UseCase, in.StyleCluster} {
			if _, reserved := domain.ParseMarketSurfaceAlias(value); reserved {
				return nil, errors.New("market surface cannot be used as scanner catalog")
			}
		}
	}
	if in.Origin == domain.CatalogOriginScanner || in.SourceSurface != "" {
		for _, name := range []string{in.Catalog, in.Subcatalog, in.Theme, in.Niche, in.UseCase, in.StyleCluster} {
			if _, reserved := domain.ParseMarketSurfaceAlias(name); reserved {
				return nil, errors.New("market surface cannot be stored as a scanner catalog")
			}
		}
	}
	if in.Origin == domain.CatalogOriginScanner || in.SourceSurface != "" {
		for _, value := range []string{in.ContentType, in.Catalog, in.Subcatalog, in.Theme, in.Niche, in.UseCase, in.StyleCluster} {
			if segmentation.IsReservedSurfaceCatalogName(value) {
				return nil, errors.New("market surface labels cannot be used as scanner-created catalog names")
			}
		}
	}
	entries := []struct {
		name  string
		level domain.CatalogLevel
	}{
		{in.ContentType, domain.CatalogLevelContentType},
		{in.Catalog, domain.CatalogLevelCatalog},
		{in.Subcatalog, domain.CatalogLevelSubcatalog},
		{in.Theme, domain.CatalogLevelTheme},
		{in.Niche, domain.CatalogLevelNiche},
		{in.UseCase, domain.CatalogLevelUseCase},
		{in.StyleCluster, domain.CatalogLevelStyleCluster},
	}
	nodes := []domain.CatalogNode{}
	parentID := ""
	parentKey := ""
	for _, e := range entries {
		if strings.TrimSpace(e.name) == "" {
			continue
		}
		key := CanonicalCatalogKey(in.Platform, parentKey, e.level, e.name)
		n := domain.CatalogNode{
			ID:               domain.NewID(),
			Platform:         in.Platform,
			ContentType:      in.ContentType,
			ParentID:         parentID,
			Name:             strings.TrimSpace(e.name),
			CanonicalKey:     key,
			Level:            e.level,
			FirstSeenAt:      observedAt,
			LastSeenAt:       observedAt,
			Origin:           in.Origin,
			AnalyticalStatus: domain.IntegrityStatusNativeAlpha65,
		}
		nodes = append(nodes, n)
		parentID = n.ID
		parentKey = key
	}
	return nodes, nil
}
