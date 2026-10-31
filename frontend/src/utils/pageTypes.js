// Page-type scopes for the URL grid. Uses audit_data.Page_Type (set by the backend classifier) when present.
export const PAGE_TYPE_SCOPES = [
  { key: 'home', label: 'Home', types: ['Home'] },
  { key: 'products', label: 'Products', types: ['Product'] },
  { key: 'categories', label: 'Categories', types: ['Category'] },
  { key: 'pagination', label: 'Pagination', types: ['Pagination'] },
  { key: 'blog', label: 'Blog', types: ['Blog Post', 'Blog Index'] },
  { key: 'docs', label: 'Docs', types: ['Docs'] },
  { key: 'pages', label: 'Info pages', types: ['Page'] },
  { key: 'archives', label: 'Authors & Archives', types: ['Author/Archive'] },
  { key: 'other', label: 'Other', types: ['Other'] },
];

export const getPageType = (page) => page?.audit_data?.Page_Type?.Type || null;

export const isPaginatedPage = (page) =>
  getPageType(page) === 'Pagination' || page?.audit_data?.Pagination?.Paginated === true;

/** Scopes that actually exist in this crawl, with counts. Empty when no page has a Page_Type. */
export function buildPageTypeScopes(pages) {
  const counts = {};
  for (const p of pages || []) {
    const t = getPageType(p);
    if (t) counts[t] = (counts[t] || 0) + 1;
  }
  return PAGE_TYPE_SCOPES
    .map((s) => ({ ...s, count: s.types.reduce((n, t) => n + (counts[t] || 0), 0) }))
    .filter((s) => s.count > 0);
}
