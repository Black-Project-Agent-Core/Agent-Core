package repository

import "marketsignallab/internal/domain"

type ExplorerRepository interface {
	AppendSavedView(domain.SavedView) error
	SavedViews() ([]domain.SavedView, error)
	SavedViewByID(string) (domain.SavedView, bool, error)
	AppendWatchlistEntry(domain.WatchlistEntry) error
	WatchlistEntries() ([]domain.WatchlistEntry, error)
	WatchlistEntryByID(string) (domain.WatchlistEntry, bool, error)
}
