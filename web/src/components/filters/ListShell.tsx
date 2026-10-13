import { useState, type ReactNode } from "react";
import type { ListState } from "../../hooks/useListQuery";
import FilterChips from "./FilterChips";
import FilterDrawer, { type GroupDef } from "./FilterDrawer";
import Pagination from "./Pagination";
import SearchBar from "./SearchBar";

interface Props<T> {
  state: ListState<T>;
  groups: GroupDef[];
  placeholder?: string;
  csv?: boolean;
  toolbarExtra?: ReactNode;
  children: (items: T[]) => ReactNode;
}

/** Поиск + «Фильтр» + чипы + пагинация + состояния загрузки/пустоты. Страницы отдают только содержимое. */
export default function ListShell<T>({ state, groups, placeholder, csv, toolbarExtra, children }: Props<T>) {
  const [open, setOpen] = useState(false);
  const { data, isPending, isError, error, isFetching } = state.list;
  const filtered = state.activeCount > 0 || !!state.q;

  return (
    <div>
      <div className="d-flex flex-wrap gap-2 align-items-start">
        <div className="flex-grow-1"><SearchBar value={state.q} onChange={state.setQ} activeCount={state.activeCount} onOpenFilters={() => setOpen(true)} placeholder={placeholder} /></div>
        {toolbarExtra}
        {csv && <a className="btn btn-outline-success" href={state.exportUrl}><i className="bi bi-download me-1" />CSV</a>}
      </div>
      <FilterChips groups={groups} facets={state.facets} filters={state.filters} extras={state.extras}
        onRemoveValue={state.removeFilterValue} onRemoveExtra={state.removeExtra} onReset={state.resetAll} />
      <FilterDrawer open={open} onClose={() => setOpen(false)} groups={groups} facets={state.facets}
        filters={state.filters} extras={state.extras} onApply={state.apply} />

      <div className={`mt-3 ${isFetching && !isPending ? "opacity-75" : ""}`}>
        {isPending ? <div className="text-center p-5"><div className="spinner-border text-primary" /></div>
          : isError ? <div className="alert alert-danger">{(error as Error).message}</div>
          : data.items.length === 0 ? (
            <div className="text-center text-muted p-5 bg-white rounded-3 border">
              <i className="bi bi-search fs-1 d-block mb-2" />
              <div className="mb-2">Ничего не найдено. Попробуйте изменить фильтры</div>
              {filtered && <button className="btn btn-outline-primary btn-sm" onClick={state.resetAll}>Сбросить</button>}
            </div>
          ) : children(data.items)}
      </div>
      {data && data.items.length > 0 && <Pagination page={data.page} pages={data.pages} limit={data.limit} total={data.total} onPage={state.setPage} onLimit={state.setLimit} />}
    </div>
  );
}
