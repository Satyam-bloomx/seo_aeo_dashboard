import { getPageType, isPaginatedPage } from '@/utils/pageTypes';

const cleanText = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

export const DUPLICATE_KINDS = [
  { key: 'title', label: 'Page Titles', category: 'Page_Titles', valueLabel: 'Page Title', field: 'title_1' },
  { key: 'meta', label: 'Meta Description', category: 'Meta_Description', valueLabel: 'Meta Description', field: 'meta_desc_1' },
  { key: 'h1', label: 'H1', category: 'H1', valueLabel: 'H1', field: 'h1_1' },
  { key: 'content', label: 'Exact content', category: 'Content', valueLabel: 'Identical content', field: null },
];

const kindData = (page, kind) => {
  const ad = page.audit_data || {};
  if (kind.key === 'title') return ad.Page_Titles;
  if (kind.key === 'meta') return ad.Meta_Description;
  if (kind.key === 'h1') return ad.H1;
  return ad.Content;
};

const isFlagged = (page, kind) => {
  const d = kindData(page, kind);
  if (!d) return false;
  return kind.key === 'content' ? Boolean(d['Exact Duplicates']) : Boolean(d.Duplicate);
};

const siblingUrls = (page, kind) => {
  const d = kindData(page, kind) || {};
  const list = kind.key === 'content' ? d.exact_duplicate_urls : d.duplicate_urls;
  return Array.isArray(list) ? list : [];
};

/**
 * One group per duplicated value (or per set of identical-content URLs), largest first.
 * Group: { id, value, count, urls, pageTypes, fromPagination: 'all'|'some'|'none' }
 */
export function buildDuplicateGroups(pages, kind) {
  const byUrl = new Map();
  for (const p of pages || []) if (p?.url) byUrl.set(p.url, p);
  const flagged = (pages || []).filter((p) => p?.url && isFlagged(p, kind));

  const buckets = new Map(); // key -> { value, pages:Set(page), extra:Set(url), dupCount }
  if (kind.key === 'content') {
    // Union-find over exact-duplicate URL sets.
    const parent = new Map();
    const find = (x) => {
      while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); }
      return x;
    };
    const add = (x) => { if (!parent.has(x)) parent.set(x, x); };
    const union = (a, b) => { add(a); add(b); const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(rb, ra); };
    for (const p of flagged) {
      add(p.url);
      for (const u of siblingUrls(p, kind)) union(p.url, u);
    }
    for (const p of flagged) {
      const root = find(p.url);
      if (!buckets.has(root)) buckets.set(root, { value: '', pages: new Set(), extra: new Set(), dupCount: 0 });
      const b = buckets.get(root);
      b.pages.add(p);
      for (const u of siblingUrls(p, kind)) b.extra.add(u);
    }
    for (const b of buckets.values()) {
      const first = [...b.pages][0];
      b.value = `Identical content (e.g. ${first?.url || ''})`;
    }
  } else {
    for (const p of flagged) {
      const val = cleanText(p[kind.field]);
      if (!val) continue;
      const key = val.toLowerCase();
      if (!buckets.has(key)) buckets.set(key, { value: val, pages: new Set(), extra: new Set(), dupCount: 0 });
      const b = buckets.get(key);
      b.pages.add(p);
      for (const u of siblingUrls(p, kind)) b.extra.add(u);
      const dc = Number(kindData(p, kind)?.duplicate_count);
      if (Number.isFinite(dc)) b.dupCount = Math.max(b.dupCount, dc);
    }
  }

  const groups = [];
  let i = 0;
  for (const b of buckets.values()) {
    const urlSet = new Set([...b.pages].map((p) => p.url));
    for (const u of b.extra) urlSet.add(u);
    const members = [...urlSet].map((u) => byUrl.get(u)).filter(Boolean);
    const pagCount = members.filter(isPaginatedPage).length;
    const types = new Set(members.map(getPageType).filter(Boolean));
    groups.push({
      id: `${kind.key}-${i++}`,
      value: b.value,
      count: Math.max(urlSet.size, b.dupCount),
      urls: [...urlSet],
      pageTypes: [...types],
      fromPagination: members.length > 0 && pagCount === members.length ? 'all' : pagCount > 0 ? 'some' : 'none',
    });
  }
  return groups.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export const paginationLabel = (g) =>
  g.fromPagination === 'all' ? 'from pagination' : g.fromPagination === 'some' ? 'includes pagination' : '';
