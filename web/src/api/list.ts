export interface Facet { value: string; label: string; count: number }
export type Facets = Record<string, Facet[]>;
export interface Paged<T> { items: T[]; total: number; page: number; limit: number; pages: number }
