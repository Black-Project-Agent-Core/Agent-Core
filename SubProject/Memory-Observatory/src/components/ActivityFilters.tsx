import type { ObservatoryActivity } from '../app/types';

export const DEFAULT_ACTIVITY_CATEGORIES = ['memory', 'continuity', 'tool', 'execution', 'routing', 'remote'] as const;
export type ActivityCategory = ObservatoryActivity['category'];

const FILTER_CATEGORIES: ActivityCategory[] = [
  'memory', 'continuity', 'tool', 'execution', 'routing', 'remote', 'http', 'system',
];

export interface ActivityFiltersProps {
  categories: Set<ActivityCategory>;
  state: string;
  onToggleCategory(category: ActivityCategory): void;
  onStateChange(state: string): void;
}

export function ActivityFilters({ categories, state, onToggleCategory, onStateChange }: ActivityFiltersProps) {
  return (
    <div className="activity-filters" aria-label="Activity filters">
      <div className="activity-category-filters">
        {FILTER_CATEGORIES.map((category) => (
          <button
            type="button"
            key={category}
            className={categories.has(category) ? 'activity-filter activity-filter--active' : 'activity-filter'}
            aria-pressed={categories.has(category)}
            onClick={() => onToggleCategory(category)}
          >
            {category.toUpperCase()}
          </button>
        ))}
      </div>
      <select aria-label="Filter activity state" value={state} onChange={(event) => onStateChange(event.target.value)}>
        <option value="all">All states</option>
        <option value="started">started</option>
        <option value="pending">pending</option>
        <option value="completed">completed</option>
        <option value="failed">failed</option>
      </select>
    </div>
  );
}
