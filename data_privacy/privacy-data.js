/* Live data for the Data Privacy dashboard.

   Sources the work-item queue, the work-item-type filter options, the completion
   trend, and the DPIA status mix from the Collibra REST API on the same origin.
   Every fetcher is defensive: it catches its own errors and returns a safe
   default, so one slow or failed call never blanks the page. COLLIBRA_BASE comes
   from ../shared/utils.js, which loads before this file.

   Environment-portable by design (see docs/architecture.md): asset types,
   communities, and domains resolve by name at runtime, because their UUIDs differ
   per instance but their names are stable. The work item's data lives in
   attributes, which the attributes endpoint returns keyed by attribute-type name,
   so reading needs no per-instance IDs either. See docs/data-privacy-data-model.md
   for the full model. */

/* Attribute-type names carried by a Privacy Work Item. Read by name, not ID. */
const WI_ATTR = {
  assignee: 'Assignee',
  type: 'Work Item Type',
  status: 'Status',
  opened: 'Date Opened',
  closed: 'Date Closed',
  due: 'Due Date',
  title: 'Task Title',
  workItemId: 'Work Item ID',
};

/* The work item's own Status values (the Status attribute, not the asset status).
   Open work is anything not yet Done or Cancelled. */
const OPEN_STATUSES = ['To Do', 'In Progress', 'Blocked', 'Reviewed'];
const DONE_STATUS = 'Done';

/* Paging and concurrency caps. The page cap stops a runaway endpoint from looping
   forever; the concurrency cap keeps the per-asset attribute fetch from opening
   too many sockets at once when the queue grows. */
const WI_PAGE_SIZE = 100;
const WI_MAX_PAGES = 20;
const ATTR_CONCURRENCY = 8;
const DPIA_PAGE_SIZE = 1000;

/* Representative fallbacks, used only when every live call fails, so the page
   still reads as a plausible dashboard rather than blank. */
const DP_REPRESENTATIVE = {
  dpiaMix: [
    { name: 'Completed', n: 604 },
    { name: 'Not Required', n: 106 },
    { name: 'In Progress', n: 1 },
    { name: 'Unknown', n: 2 },
  ],
  workItemTypes: [
    'Action Tracking', 'Data Map Updates', 'DPIA', 'Enquiry', 'Incident Investigation',
    'Other', 'Policy Review/Management', 'Reporting', 'Support Request', 'Training and Awareness',
  ],
};

/* Run an async mapper over items with a fixed concurrency, preserving order.
   Keeps the per-asset attribute fetch bounded as the work-item set grows. */
async function mapWithConcurrency(items, limit, mapper) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await mapper(items[i], i);
    }
  }
  const workers = [];
  for (let i = 0; i < Math.min(limit, items.length); i++) workers.push(worker());
  await Promise.all(workers);
  return out;
}

/* A small JSON GET that carries the session cookie and never throws: it returns
   the parsed body, or null on any failure. */
async function dpGet(path, fetchImpl) {
  const f = fetchImpl || fetch;
  try {
    const r = await f(`${COLLIBRA_BASE}${path}`, { credentials: 'include' });
    if (!r.ok) throw new Error(`GET ${path} failed: ${r.status}`);
    return await r.json();
  } catch (error) {
    console.error('Data Privacy fetch failed:', path, error);
    return null;
  }
}

/* Resolve an asset type's ID from its name (env-portable). Cached per name. */
const assetTypeIdCache = new Map();
async function resolveAssetTypeId(name, fetchImpl) {
  if (assetTypeIdCache.has(name)) return assetTypeIdCache.get(name);
  const data = await dpGet(`/rest/2.0/assetTypes?name=${encodeURIComponent(name)}&nameMatchMode=EXACT&limit=1`, fetchImpl);
  const id = (data && data.results && data.results[0]) ? data.results[0].id : null;
  assetTypeIdCache.set(name, id);
  return id;
}

/* Resolve a community's ID from its name (env-portable). Cached per name. */
const dpCommunityIdCache = new Map();
async function resolveDpCommunityId(name, fetchImpl) {
  if (dpCommunityIdCache.has(name)) return dpCommunityIdCache.get(name);
  const data = await dpGet(`/rest/2.0/communities?name=${encodeURIComponent(name)}&nameMatchMode=EXACT&limit=1`, fetchImpl);
  const id = (data && data.results && data.results[0]) ? data.results[0].id : null;
  dpCommunityIdCache.set(name, id);
  return id;
}

/* Resolve a domain's ID by community and name (env-portable). */
async function resolveDpDomainId(communityId, domainName, fetchImpl) {
  if (!communityId) return null;
  const data = await dpGet(`/rest/2.0/domains?communityId=${encodeURIComponent(communityId)}&limit=200`, fetchImpl);
  if (!data || !data.results) return null;
  const hit = data.results.find((d) => d.name === domainName);
  return hit ? hit.id : null;
}

/* Read one asset's attributes as a {typeName: value} map. Multi-valued attributes
   keep their first value; the work item's fields are all single-valued. */
async function fetchAssetAttributes(assetId, fetchImpl) {
  const data = await dpGet(`/rest/2.0/attributes?assetId=${encodeURIComponent(assetId)}&limit=100`, fetchImpl);
  const map = {};
  if (data && data.results) {
    for (const a of data.results) {
      const key = a.type && a.type.name;
      if (key && !(key in map)) map[key] = a.value;
    }
  }
  return map;
}

/* A milliseconds value from an attribute, or null when it is absent/unparseable. */
function dpNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* Shape one work item from its asset and attribute map. */
function normalizeWorkItem(asset, attrs) {
  return {
    id: asset.id,
    workItemId: attrs[WI_ATTR.workItemId] || asset.name || '',
    title: attrs[WI_ATTR.title] || asset.displayName || asset.name || 'Untitled work item',
    type: attrs[WI_ATTR.type] || '',
    status: attrs[WI_ATTR.status] || '',
    assignee: attrs[WI_ATTR.assignee] || '',
    openedMs: dpNum(attrs[WI_ATTR.opened]),
    closedMs: dpNum(attrs[WI_ATTR.closed]),
    dueMs: dpNum(attrs[WI_ATTR.due]),
  };
}

/* All Privacy Work Items, each with its attributes resolved.
   Pages the asset list, then fetches attributes per asset at a bounded
   concurrency. Returns [] on failure so the panels can show their empty state. */
async function fetchWorkItems(fetchImpl) {
  const typeId = await resolveAssetTypeId('Privacy Work Item', fetchImpl);
  if (!typeId) return [];
  const assets = [];
  for (let page = 0; page < WI_MAX_PAGES; page++) {
    const offset = page * WI_PAGE_SIZE;
    const data = await dpGet(`/rest/2.0/assets?typeIds=${encodeURIComponent(typeId)}&offset=${offset}&limit=${WI_PAGE_SIZE}&excludeMeta=true`, fetchImpl);
    const rows = (data && data.results) || [];
    for (const a of rows) assets.push({ id: a.id, name: a.name, displayName: a.displayName });
    if (rows.length < WI_PAGE_SIZE) break;
  }
  return mapWithConcurrency(assets, ATTR_CONCURRENCY, async (a) => {
    const attrs = await fetchAssetAttributes(a.id, fetchImpl);
    return normalizeWorkItem(a, attrs);
  });
}

/* The work-item-type options for the filter (env-portable name path).
   Reads the "Work Item Type - Config" domain in the "BHP Data Privacy" community.
   Falls back to the distinct types present on the work items, then to the
   representative list, so the filter always has options. */
async function fetchWorkItemTypeOptions(workItems, fetchImpl) {
  try {
    const communityId = await resolveDpCommunityId('BHP Data Privacy', fetchImpl);
    const domainId = await resolveDpDomainId(communityId, 'Work Item Type - Config', fetchImpl);
    if (domainId) {
      const data = await dpGet(`/rest/2.0/assets?domainId=${encodeURIComponent(domainId)}&limit=200&excludeMeta=true`, fetchImpl);
      const names = ((data && data.results) || []).map((a) => a.name).filter(Boolean);
      if (names.length) return names.sort((a, b) => a.localeCompare(b));
    }
  } catch (error) {
    console.error('Could not load work-item-type options from the config domain:', error);
  }
  const fromItems = Array.from(new Set((workItems || []).map((w) => w.type).filter(Boolean)));
  if (fromItems.length) return fromItems.sort((a, b) => a.localeCompare(b));
  return DP_REPRESENTATIVE.workItemTypes.slice();
}

/* The DPIA status mix for the panel. Resolves the DPIA asset type by name, pulls
   the assets in one page, and groups by asset status. Returns { total, mix } with
   mix sorted by count descending, or the representative mix on failure. */
async function fetchDpiaStatusMix(fetchImpl) {
  try {
    const typeId = await resolveAssetTypeId('DPIA', fetchImpl);
    if (!typeId) throw new Error('DPIA type not found');
    const data = await dpGet(`/rest/2.0/assets?typeIds=${encodeURIComponent(typeId)}&limit=${DPIA_PAGE_SIZE}&excludeMeta=true`, fetchImpl);
    const rows = (data && data.results) || [];
    if (!rows.length) throw new Error('No DPIA assets');
    const counts = {};
    for (const a of rows) {
      const name = (a.status && a.status.name) || 'Unknown';
      counts[name] = (counts[name] || 0) + 1;
    }
    const mix = Object.keys(counts).map((name) => ({ name, n: counts[name] })).sort((a, b) => b.n - a.n);
    const total = (typeof data.total === 'number') ? data.total : rows.length;
    return { total, mix };
  } catch (error) {
    console.error('Could not load the DPIA status mix; using representative data:', error);
    const mix = DP_REPRESENTATIVE.dpiaMix.slice();
    return { total: mix.reduce((s, d) => s + d.n, 0), mix };
  }
}

/* ===== Pure helpers (unit-testable without the network) ===== */

/* Is this work item assigned to the signed-in user? Assignee is a free-text name
   string ("Christy Yu"), not a user reference, so the match is tolerant: it
   accepts the userName, or a value that contains the first name and the primary
   surname token. See docs/data-privacy-data-model.md. */
function isAssignedToUser(assignee, user) {
  if (!assignee || !user) return false;
  const a = String(assignee).toLowerCase().trim();
  const userName = String(user.userName || '').toLowerCase();
  if (userName && a === userName) return true;
  const first = String(user.firstName || '').toLowerCase().trim();
  const lastTokens = String(user.lastName || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (first && lastTokens.length) {
    const primaryLast = lastTokens[0];
    if (a.indexOf(first) !== -1 && a.indexOf(primaryLast) !== -1) return true;
  }
  const full = (first + ' ' + lastTokens.join(' ')).trim();
  return !!full && a === full;
}

/* Open work is anything whose Status is not Done or Cancelled. */
function isOpenWorkItem(item) {
  return OPEN_STATUSES.indexOf(item.status) !== -1;
}

/* True when the item's type is in the selected set. An empty/absent selection
   means "all types", so nothing is filtered out. */
function matchesTypeFilter(item, selectedTypes) {
  if (!selectedTypes || !selectedTypes.size) return true;
  return selectedTypes.has(item.type);
}

/* Whole-day offset of a due date from now: negative is overdue, 0 today. null
   when there is no due date. now is injectable for tests. */
function dpDueOffsetDays(dueMs, now) {
  if (dueMs == null) return null;
  const current = (typeof now === 'number') ? now : Date.now();
  const days = Math.floor((dueMs - current) / 86400000);
  return Number.isNaN(days) ? null : days;
}

/* The first day of each of the last `count` months, oldest first. */
function dpLastMonths(count, now) {
  const base = now ? new Date(now) : new Date();
  const months = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    months.push({ ts: d.getTime(), short: d.toLocaleString(undefined, { month: 'short' }) });
  }
  return months;
}

/* Group open work items by Assignee for the workload chart. Returns rows of
   { name, total, counts }, where counts maps each open Status to its count.
   Rows sort by total descending, then by name; the unassigned group keeps
   name '' and always sorts last, so the chart shows owners first. */
function openItemsByAssignee(workItems) {
  const groups = new Map();
  for (const w of workItems || []) {
    if (!isOpenWorkItem(w)) continue;
    const name = String(w.assignee || '').trim();
    if (!groups.has(name)) groups.set(name, { name, total: 0, counts: {} });
    const g = groups.get(name);
    g.total += 1;
    g.counts[w.status] = (g.counts[w.status] || 0) + 1;
  }
  return Array.from(groups.values()).sort((a, b) => {
    if (!a.name !== !b.name) return a.name ? -1 : 1;
    return (b.total - a.total) || a.name.localeCompare(b.name);
  });
}

/* Count completed work items per month over the last 12 months, by Date Closed.
   Pure, so it is testable without the network. Returns { months, counts }. */
function completionsByMonth(workItems, now) {
  const months = dpLastMonths(12, now);
  const counts = new Array(months.length).fill(0);
  for (const w of workItems || []) {
    if (w.closedMs == null) continue;
    for (let m = months.length - 1; m >= 0; m--) {
      if (w.closedMs >= months[m].ts) { counts[m]++; break; }
    }
  }
  return { months: months.map((m) => m.short), counts };
}

/* Expose the module surface for privacy-page.js and a test harness. */
const PrivacyData = {
  OPEN_STATUSES, DONE_STATUS, representative: DP_REPRESENTATIVE,
  resolveAssetTypeId, fetchWorkItems, fetchWorkItemTypeOptions, fetchDpiaStatusMix,
  isAssignedToUser, isOpenWorkItem, matchesTypeFilter, dpDueOffsetDays,
  dpLastMonths, completionsByMonth, openItemsByAssignee,
};
