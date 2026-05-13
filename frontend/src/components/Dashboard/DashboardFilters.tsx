"use client";

type View = "grid" | "list";
type Sort = "recent" | "alpha";
type Filter = "all" | "mine";

interface Props {
  filter: Filter;
  setFilter: (f: Filter) => void;
  search: string;
  setSearch: (s: string) => void;
  view: View;
  setView: (v: View) => void;
  sort: Sort;
  setSort: (s: Sort) => void;
}

export default function DashboardFilters({ filter, setFilter, search, setSearch, view, setView, sort, setSort }: Props) {
  return (
    <div className="dash-filters">
      <div className="dash-filter-tabs">
        <button className={`dash-tab ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>All</button>
        <button className={`dash-tab ${filter === "mine" ? "active" : ""}`} onClick={() => setFilter("mine")}>My notebooks</button>
      </div>

      <div className="dash-filter-actions">
        <div className="dash-search-wrap">
          <span className="dash-search-icon">🔍</span>
          <input
            id="notebook-search"
            className="dash-search"
            placeholder="Search notebooks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="dash-view-toggle">
          <button
            id="view-grid"
            className={`view-btn ${view === "grid" ? "active" : ""}`}
            onClick={() => setView("grid")}
            title="Grid view"
          >⊞</button>
          <button
            id="view-list"
            className={`view-btn ${view === "list" ? "active" : ""}`}
            onClick={() => setView("list")}
            title="List view"
          >≡</button>
        </div>

        <select
          id="sort-select"
          className="dash-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
        >
          <option value="recent">Most recent</option>
          <option value="alpha">A → Z</option>
        </select>
      </div>
    </div>
  );
}
