package envato

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

type CategoryNode struct {
	Name     string         `json:"name"`
	Path     string         `json:"path"`
	Children []CategoryNode `json:"children,omitempty"`
}

type CategoriesResult struct {
	Site         string         `json:"site"`
	Categories   []CategoryNode `json:"categories"`
	HTTPRequests int            `json:"httpRequests"`
	ObservedAt   string         `json:"observedAt"`
}

type SurfaceRequest struct {
	Site     string `json:"site"`
	Category string `json:"category,omitempty"`
	PageSize int    `json:"pageSize,omitempty"`
}

type SurfaceResult struct {
	Site         string         `json:"site"`
	Surface      string         `json:"surface"`
	Category     string         `json:"category,omitempty"`
	Items        []ObservedItem `json:"items"`
	HTTPRequests int            `json:"httpRequests"`
	ObservedAt   string         `json:"observedAt"`
}

func isFallbackStatus(err error) bool {
	var status *HTTPStatusError
	if !errors.As(err, &status) {
		return false
	}
	switch status.StatusCode {
	case http.StatusBadRequest, http.StatusForbidden, http.StatusNotFound, http.StatusMethodNotAllowed, http.StatusUnprocessableEntity:
		return true
	default:
		return false
	}
}

func (c *Client) getWithFallback(ctx context.Context, token, primaryPath string, primaryQuery url.Values, fallbackPath string, fallbackQuery url.Values, allowance int) ([]byte, int, error) {
	if allowance <= 0 {
		return nil, 0, errors.New("HTTP request allowance must be at least 1")
	}
	body, used, err := c.doGET(ctx, token, primaryPath, primaryQuery, allowance)
	if err == nil || !isFallbackStatus(err) || used >= allowance || fallbackPath == "" {
		return body, used, err
	}
	body, fallbackUsed, fallbackErr := c.doGET(ctx, token, fallbackPath, fallbackQuery, allowance-used)
	return body, used + fallbackUsed, fallbackErr
}

func marketSiteSlug(site string) string {
	site = strings.ToLower(strings.TrimSpace(site))
	site = strings.TrimPrefix(site, "www.")
	site = strings.TrimSuffix(site, ".net")
	site = strings.TrimSuffix(site, ".com")
	return site
}

func valueString(v any) string {
	switch x := v.(type) {
	case string:
		return strings.TrimSpace(x)
	case json.Number:
		return x.String()
	case float64:
		return strings.TrimSuffix(strings.TrimSuffix(fmt.Sprintf("%.0f", x), ".0"), ".")
	default:
		return ""
	}
}

func decodeAny(body []byte) (any, error) {
	dec := json.NewDecoder(strings.NewReader(string(body)))
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		return nil, errors.New("invalid Envato market surface response")
	}
	return v, nil
}

func categoryName(m map[string]any) string {
	for _, key := range []string{"name", "title", "label"} {
		if s := valueString(m[key]); s != "" {
			return s
		}
	}
	return ""
}

func categoryPath(m map[string]any) string {
	for _, key := range []string{"path", "slug", "category", "url"} {
		if s := valueString(m[key]); s != "" {
			return s
		}
	}
	return ""
}

func parseCategoryNode(m map[string]any) (CategoryNode, bool) {
	name, path := categoryName(m), categoryPath(m)
	if name == "" || path == "" {
		return CategoryNode{}, false
	}
	node := CategoryNode{Name: name, Path: path, Children: []CategoryNode{}}
	for _, key := range []string{"categories", "children", "subcategories", "items"} {
		arr, ok := m[key].([]any)
		if !ok {
			continue
		}
		for _, raw := range arr {
			childMap, ok := raw.(map[string]any)
			if !ok {
				continue
			}
			if child, ok := parseCategoryNode(childMap); ok {
				node.Children = append(node.Children, child)
			}
		}
	}
	return node, true
}

func collectCategoryArrays(v any, out *[]CategoryNode) {
	switch x := v.(type) {
	case []any:
		for _, raw := range x {
			if m, ok := raw.(map[string]any); ok {
				if node, ok := parseCategoryNode(m); ok {
					*out = append(*out, node)
					continue
				}
			}
			collectCategoryArrays(raw, out)
		}
	case map[string]any:
		for key, raw := range x {
			if key == "categories" {
				if arr, ok := raw.([]any); ok {
					for _, item := range arr {
						if m, ok := item.(map[string]any); ok {
							if node, ok := parseCategoryNode(m); ok {
								*out = append(*out, node)
							}
						}
					}
				}
				continue
			}
			collectCategoryArrays(raw, out)
		}
	}
}

func (c *Client) Categories(ctx context.Context, token, site string, allowance int) (CategoriesResult, error) {
	site = strings.TrimSpace(site)
	if site == "" {
		return CategoriesResult{}, errors.New("site is required")
	}
	q := url.Values{"site": {site}}
	canonical := "/v1/market/categories:" + url.PathEscape(marketSiteSlug(site)) + ".json"
	body, used, err := c.getWithFallback(ctx, token, canonical, nil, "/v1/market/categories:json", q, allowance)
	result := CategoriesResult{Site: site, Categories: []CategoryNode{}, HTTPRequests: used, ObservedAt: time.Now().UTC().Format(time.RFC3339)}
	if err != nil {
		return result, err
	}
	decoded, err := decodeAny(body)
	if err != nil {
		return result, err
	}
	collectCategoryArrays(decoded, &result.Categories)
	seen := map[string]bool{}
	unique := result.Categories[:0]
	for _, row := range result.Categories {
		key := row.Path
		if !seen[key] {
			seen[key] = true
			unique = append(unique, row)
		}
	}
	result.Categories = unique
	return result, nil
}

func itemFromMap(m map[string]any) (ObservedItem, bool) {
	id := ""
	for _, key := range []string{"id", "item_id", "itemId"} {
		if id = valueString(m[key]); id != "" {
			break
		}
	}
	if id == "" {
		return ObservedItem{}, false
	}
	title := ""
	for _, key := range []string{"name", "title", "item"} {
		if title = valueString(m[key]); title != "" {
			break
		}
	}
	if title == "" {
		return ObservedItem{}, false
	}
	author := ""
	for _, key := range []string{"author_username", "author_name", "username", "user"} {
		if author = valueString(m[key]); author != "" {
			break
		}
	}
	if author == "" {
		if nested, ok := m["author"].(map[string]any); ok {
			for _, key := range []string{"username", "name", "display_name"} {
				if author = valueString(nested[key]); author != "" {
					break
				}
			}
		}
	}
	preview := valueString(m["thumbnail"])
	if preview == "" {
		preview = valueString(m["thumbnail_url"])
	}
	category := valueString(m["category"])
	if category == "" {
		category = valueString(m["classification"])
	}
	releasedAt, releasePrecision, releaseField := explicitReleaseFromMap(m)
	return ObservedItem{ExternalItemID: id, Title: title, AuthorKey: author, AuthorDisplayName: author, SourceURL: valueString(m["url"]), PreviewRef: preview, CategoryText: category, ReleasedAt: releasedAt, ReleasePrecision: releasePrecision, ReleaseField: releaseField}, true
}

func collectItems(v any, out *[]ObservedItem, seen map[string]bool) {
	switch x := v.(type) {
	case []any:
		for _, raw := range x {
			collectItems(raw, out, seen)
		}
	case map[string]any:
		if item, ok := itemFromMap(x); ok {
			if !seen[item.ExternalItemID] {
				seen[item.ExternalItemID] = true
				item.Position = len(*out) + 1
				*out = append(*out, item)
			}
			return
		}
		keys := make([]string, 0, len(x))
		for key := range x {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			collectItems(x[key], out, seen)
		}
	}
}

func (c *Client) surface(ctx context.Context, token string, in SurfaceRequest, surface, canonicalPath, queryPath string, allowance int) (SurfaceResult, error) {
	in.Site = strings.TrimSpace(in.Site)
	if in.Site == "" {
		in.Site = "graphicriver.net"
	}
	q := url.Values{"site": {in.Site}}
	if in.Category != "" {
		q.Set("category", in.Category)
	}
	if in.PageSize > 0 {
		q.Set("page_size", fmt.Sprintf("%d", in.PageSize))
	}
	body, used, err := c.getWithFallback(ctx, token, canonicalPath, nil, queryPath, q, allowance)
	result := SurfaceResult{Site: in.Site, Surface: surface, Category: in.Category, Items: []ObservedItem{}, HTTPRequests: used, ObservedAt: time.Now().UTC().Format(time.RFC3339)}
	if err != nil {
		return result, err
	}
	decoded, err := decodeAny(body)
	if err != nil {
		return result, err
	}
	collectItems(decoded, &result.Items, map[string]bool{})
	return result, nil
}

func (c *Client) PopularItems(ctx context.Context, token string, in SurfaceRequest, allowance int) (SurfaceResult, error) {
	canonical := "/v1/market/popular:" + url.PathEscape(marketSiteSlug(in.Site)) + ".json"
	return c.surface(ctx, token, in, "popular", canonical, "/v1/market/popular:json", allowance)
}
func (c *Client) FeaturedItems(ctx context.Context, token string, in SurfaceRequest, allowance int) (SurfaceResult, error) {
	canonical := "/v1/market/features:" + url.PathEscape(marketSiteSlug(in.Site)) + ".json"
	return c.surface(ctx, token, in, "featured", canonical, "/v1/market/features:json", allowance)
}
func (c *Client) RandomNewItems(ctx context.Context, token string, in SurfaceRequest, allowance int) (SurfaceResult, error) {
	canonical := "/v1/market/random-new-files:" + url.PathEscape(marketSiteSlug(in.Site)) + ".json"
	return c.surface(ctx, token, in, "random_new", canonical, "/v1/market/random-new-files:json", allowance)
}
func (c *Client) NewItems(ctx context.Context, token string, in SurfaceRequest, allowance int) (SurfaceResult, error) {
	if strings.TrimSpace(in.Category) == "" {
		return SurfaceResult{}, errors.New("category is required")
	}
	canonical := "/v1/market/new-files:" + url.PathEscape(marketSiteSlug(in.Site)) + "," + url.PathEscape(strings.TrimSpace(in.Category)) + ".json"
	return c.surface(ctx, token, in, "new", canonical, "/v1/market/new-files:json", allowance)
}
