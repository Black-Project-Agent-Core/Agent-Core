package envato

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type ObservedItem struct {
	ExternalItemID    string `json:"externalItemId"`
	Title             string `json:"title"`
	AuthorKey         string `json:"authorKey,omitempty"`
	AuthorDisplayName string `json:"authorDisplayName,omitempty"`
	SourceURL         string `json:"sourceUrl,omitempty"`
	PreviewRef        string `json:"previewRef,omitempty"`
	CategoryText      string `json:"categoryText,omitempty"`
	ReleasedAt        string `json:"releasedAt,omitempty"`
	ReleasePrecision  string `json:"releasePrecision,omitempty"`
	ReleaseField      string `json:"releaseField,omitempty"`
	Position          int    `json:"position"`
}

type SearchPageResult struct {
	Aggregate    SearchAggregate `json:"aggregate"`
	Items        []ObservedItem  `json:"items"`
	HTTPRequests int             `json:"httpRequests"`
}

func rawIdentifier(v json.RawMessage) string {
	if len(v) == 0 {
		return ""
	}
	var s string
	if json.Unmarshal(v, &s) == nil {
		return strings.TrimSpace(s)
	}
	dec := json.NewDecoder(bytes.NewReader(v))
	dec.UseNumber()
	var x any
	if dec.Decode(&x) == nil {
		if n, ok := x.(json.Number); ok {
			return n.String()
		}
	}
	return ""
}

func (c *Client) SearchPage(ctx context.Context, token string, in SearchRequest, maxHTTPRequests int) (SearchPageResult, error) {
	if strings.TrimSpace(in.Term) == "" {
		return SearchPageResult{}, errors.New("search term is required")
	}
	if strings.TrimSpace(in.Site) == "" {
		return SearchPageResult{}, errors.New("site is required")
	}
	if in.Page <= 0 {
		in.Page = 1
	}
	if in.PageSize <= 0 {
		in.PageSize = 20
	}
	if in.PageSize > 100 {
		in.PageSize = 100
	}
	q := url.Values{
		"term":      {in.Term},
		"site":      {in.Site},
		"page":      {strconv.Itoa(in.Page)},
		"page_size": {strconv.Itoa(in.PageSize)},
	}
	if in.Category != "" {
		q.Set("category", in.Category)
	}
	if in.SortBy != "" {
		q.Set("sort_by", in.SortBy)
	}
	body, attempts, err := c.doGET(ctx, token, "/v1/discovery/search/search/item", q, maxHTTPRequests)
	result := SearchPageResult{HTTPRequests: attempts, Items: []ObservedItem{}}
	if err != nil {
		return result, err
	}
	var raw struct {
		TotalHits  json.RawMessage            `json:"total_hits"`
		Matches    []json.RawMessage          `json:"matches"`
		Took       json.RawMessage            `json:"took"`
		Pagination map[string]json.RawMessage `json:"pagination"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return result, errors.New("invalid Envato search response")
	}
	total := rawInt(raw.TotalHits)
	exact := total > 0
	if total == 0 && raw.Pagination != nil {
		for _, key := range []string{"total_results", "total_hits", "total"} {
			if n := rawInt(raw.Pagination[key]); n > 0 {
				total = n
				exact = true
				break
			}
		}
	}
	if total == 0 {
		total = len(raw.Matches)
	}
	result.Aggregate = SearchAggregate{
		Term:           in.Term,
		Site:           in.Site,
		Category:       in.Category,
		TotalHits:      total,
		TotalHitsExact: exact,
		Returned:       len(raw.Matches),
		TookMs:         rawFloat(raw.Took),
		ObservedAt:     time.Now().UTC().Format(time.RFC3339),
	}
	for i, match := range raw.Matches {
		var item struct {
			ID             json.RawMessage `json:"id"`
			Name           string          `json:"name"`
			AuthorUsername string          `json:"author_username"`
			URL            string          `json:"url"`
			Category       string          `json:"category"`
			Thumbnail      string          `json:"thumbnail"`
			ThumbnailURL   string          `json:"thumbnail_url"`
			PublishedAt    string          `json:"published_at"`
			PublishedDate  string          `json:"published_date"`
			ReleasedAt     string          `json:"released_at"`
			ReleaseDate    string          `json:"release_date"`
		}
		if err := json.Unmarshal(match, &item); err != nil {
			continue
		}
		id := rawIdentifier(item.ID)
		if id == "" {
			continue
		}
		preview := item.Thumbnail
		if preview == "" {
			preview = item.ThumbnailURL
		}
		releaseValue, releasePrecision, releaseField := explicitReleaseFromValues(map[string]string{
			"published_at": item.PublishedAt, "published_date": item.PublishedDate,
			"released_at": item.ReleasedAt, "release_date": item.ReleaseDate,
		})
		result.Items = append(result.Items, ObservedItem{
			ExternalItemID:    id,
			Title:             strings.TrimSpace(item.Name),
			AuthorKey:         strings.TrimSpace(item.AuthorUsername),
			AuthorDisplayName: strings.TrimSpace(item.AuthorUsername),
			SourceURL:         strings.TrimSpace(item.URL),
			PreviewRef:        strings.TrimSpace(preview),
			CategoryText:      strings.TrimSpace(item.Category),
			ReleasedAt:        releaseValue,
			ReleasePrecision:  releasePrecision,
			ReleaseField:      releaseField,
			Position:          i + 1,
		})
	}
	return result, nil
}
