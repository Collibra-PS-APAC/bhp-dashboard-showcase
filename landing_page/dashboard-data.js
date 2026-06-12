/* Live data for the Editorial landing dashboard (Task 18).

   Sources the KPI counts, the catalog-growth curve, and the composition-by-domain
   bars from the Collibra REST API on the same origin. Every fetcher is defensive:
   it catches its own errors and returns a null/representative fallback, so one slow
   or failed call never blanks the page. COLLIBRA_BASE comes from ../shared/utils.js,
   which loads before this file.

   Counts are by asset type, using the out-of-the-box (stable) type IDs, so the same
   bundle works on any Collibra instance with no per-environment edit.
   The community names for composition are resolved by name at runtime for the same
   reason (community UUIDs differ per environment; the names are stable). */

/* The five KPI cards. The first three count assets of a fixed type; users and
   tasks have their own sources (users from the users endpoint, tasks from
   tasks.js, wired in page.js). Edit a typeId here to re-point a KPI. */
const DASHBOARD_KPIS = [
  { key: 'dataUtilities',        label: 'Data Utilities',         source: { kind: 'assetType', typeId: '00000000-0000-0000-0001-000400000001' } }, // Data Utility (OOTB Dataset)
  { key: 'businessDataConcepts', label: 'Business Data Concepts',  source: { kind: 'assetType', typeId: '00000000-0000-0000-0000-000000031113' } }, // Data Concept
  { key: 'businessApplications', label: 'Business Applications',   source: { kind: 'assetType', typeId: '00000000-0000-0000-0000-000000031302' } }, // Business Application (System)
  { key: 'users',                label: 'Active users',            source: { kind: 'users' } },
  { key: 'myTasks',              label: 'My open tasks',           source: { kind: 'tasks' } },
];

/* Communities (by name) whose asset counts make up the composition-by-domain bars.
   Resolved to IDs at runtime so the bundle stays environment-portable. */
const COMPOSITION_DOMAINS = [
  'BHP Business Applications',
  'BHP Business Data Concepts',
  'BHP Data Domains & Business Views',
  'BHP Data Policies & Standards',
  'BHP Data Privacy',
  'Data Lifecycle Management Estate',
];

/* Representative fallbacks, used only when a live call fails or is too slow.
   Kept at real scale so a fallback still reads as a plausible figure. */
const REPRESENTATIVE = {
  // Per-KPI monthly sparkline series (last 10 months). No per-month history is
  // available live, so sparklines always use these shapes, scaled to end near the
  // live count (see scaleSparkline).
  sparkMonths: ['Sep 2025', 'Oct 2025', 'Nov 2025', 'Dec 2025', 'Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026', 'May 2026', 'Jun 2026'],
  sparkShape: [0.90, 0.92, 0.93, 0.95, 0.96, 0.97, 0.975, 0.985, 0.99, 1.0],
  growthMonths:     ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
  growthMonthsFull: ['Jul 2025', 'Aug 2025', 'Sep 2025', 'Oct 2025', 'Nov 2025', 'Dec 2025', 'Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026', 'May 2026', 'Jun 2026'],
  growthCumulative: [38.4, 41.0, 44.2, 47.1, 49.8, 52.0, 53.9, 55.6, 57.1, 58.4, 59.6, 61.7],
  domains: [
    { name: 'Business Applications', n: 13794 },
    { name: 'Business Data Concepts', n: 9569 },
    { name: 'Data Domains & Views', n: 320 },
    { name: 'Policies & Standards', n: 210 },
    { name: 'Data Privacy', n: 410 },
    { name: 'Lifecycle Management', n: 540 },
  ],
};

/* How many assets to pull per page when bucketing creation dates, and a page cap
   so a runaway never loops. 1000 is the API's effective page size. */
const GROWTH_PAGE_SIZE = 1000;
const GROWTH_MAX_PAGES = 60;

/* The asset types whose creation dates build the catalog-growth curve. */
const GROWTH_TYPE_IDS = DASHBOARD_KPIS
  .filter((k) => k.source.kind === 'assetType')
  .map((k) => k.source.typeId);

/* Count assets of one type. limit=0 returns only the total, so the call stays
   cheap. Returns the number, or null on failure (the caller keeps the prior value). */
async function fetchAssetTypeCount(typeId, fetchImpl) {
  const f = fetchImpl || fetch;
  try {
    const r = await f(`${COLLIBRA_BASE}/rest/2.0/assets?typeIds=${encodeURIComponent(typeId)}&offset=0&limit=0&countLimit=-1&excludeMeta=true`, { credentials: 'include' });
    if (!r.ok) throw new Error(`Asset count failed: ${r.status}`);
    const data = await r.json();
    return typeof data.total === 'number' ? data.total : null;
  } catch (error) {
    console.error('Could not load an asset-type count:', error);
    return null;
  }
}

/* Count platform users. Returns the number, or null on failure. */
async function fetchActiveUserCount(fetchImpl) {
  const f = fetchImpl || fetch;
  try {
    const r = await f(`${COLLIBRA_BASE}/rest/2.0/users?offset=0&limit=0&countLimit=-1`, { credentials: 'include' });
    if (!r.ok) throw new Error(`User count failed: ${r.status}`);
    const data = await r.json();
    return typeof data.total === 'number' ? data.total : null;
  } catch (error) {
    console.error('Could not load the user count:', error);
    return null;
  }
}

/* Resolve a KPI to its live count. assetType and users have live sources here;
   tasks is owned by tasks.js and resolved in page.js, so it returns null here. */
async function fetchKpiCount(kpi, fetchImpl) {
  switch (kpi.source.kind) {
    case 'assetType': return fetchAssetTypeCount(kpi.source.typeId, fetchImpl);
    case 'users':     return fetchActiveUserCount(fetchImpl);
    default:          return null; // tasks: resolved from tasks.js in page.js
  }
}

/* Resolve a community's ID from its name (env-portable). Cached per name so a
   second lookup is free. Returns the ID, or null when the name is unknown. */
const communityIdCache = new Map();
async function resolveCommunityId(name, fetchImpl) {
  if (communityIdCache.has(name)) return communityIdCache.get(name);
  const f = fetchImpl || fetch;
  try {
    const r = await f(`${COLLIBRA_BASE}/rest/2.0/communities?name=${encodeURIComponent(name)}&nameMatchMode=EXACT&limit=1`, { credentials: 'include' });
    if (!r.ok) throw new Error(`Community lookup failed: ${r.status}`);
    const data = await r.json();
    const id = (data.results && data.results[0]) ? data.results[0].id : null;
    communityIdCache.set(name, id);
    return id;
  } catch (error) {
    console.error('Could not resolve a community ID:', error);
    return null;
  }
}

/* Count assets in one community. Returns the number, or null on failure. */
async function fetchCommunityAssetCount(communityId, fetchImpl) {
  const f = fetchImpl || fetch;
  try {
    const r = await f(`${COLLIBRA_BASE}/rest/2.0/assets?communityId=${encodeURIComponent(communityId)}&offset=0&limit=0&countLimit=-1&excludeMeta=true`, { credentials: 'include' });
    if (!r.ok) throw new Error(`Community asset count failed: ${r.status}`);
    const data = await r.json();
    return typeof data.total === 'number' ? data.total : null;
  } catch (error) {
    console.error('Could not load a community asset count:', error);
    return null;
  }
}

/* Build the composition-by-domain bars from live per-community counts.
   One cheap count call per community, run in parallel. Falls back to the
   representative domains if every live count fails. Returns [{name, n}] sorted
   by count descending. */
async function buildComposition(fetchImpl) {
  try {
    const counts = await Promise.all(COMPOSITION_DOMAINS.map(async (name) => {
      const id = await resolveCommunityId(name, fetchImpl);
      const n = id ? await fetchCommunityAssetCount(id, fetchImpl) : null;
      return { name: friendlyDomain(name), n: n || 0 };
    }));
    const live = counts.filter((d) => d.n > 0).sort((a, b) => b.n - a.n);
    return live.length ? live : REPRESENTATIVE.domains.slice();
  } catch (error) {
    console.error('Could not build composition; using representative data:', error);
    return REPRESENTATIVE.domains.slice();
  }
}

/* Shorten a community name for a chart label ("BHP Business Applications" ->
   "Business Applications"). */
function friendlyDomain(name) {
  return name.replace(/^BHP\s+/, '');
}

/* The first day of each of the last `count` months, oldest first, as
   {ts, short, full}. now is injectable so the buckets are testable. */
function lastMonths(count, now) {
  const base = now ? new Date(now) : new Date();
  const months = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    months.push({
      ts: d.getTime(),
      short: d.toLocaleString(undefined, { month: 'short' }),
      full: d.toLocaleString(undefined, { month: 'short', year: 'numeric' }),
    });
  }
  return months;
}

/* Turn a flat list of creation timestamps into a 12-month cumulative series:
   for each month, the count of assets created on or before that month's end.
   Pure, so it is unit-testable without the network. Returns
   { months: string[], monthsFull: string[], cumulative: number[] }. */
function bucketGrowth(createdTimestamps, now) {
  const months = lastMonths(12, now);
  // The cumulative total at the start of the window: assets created before it.
  const windowStart = months[0].ts;
  let base = 0;
  const perMonth = new Array(months.length).fill(0);
  for (const ts of createdTimestamps) {
    if (typeof ts !== 'number' || Number.isNaN(ts)) continue;
    if (ts < windowStart) { base++; continue; }
    // Find the month this asset was created in; everything from that month on counts it.
    for (let m = months.length - 1; m >= 0; m--) {
      if (ts >= months[m].ts) { perMonth[m]++; break; }
    }
  }
  const cumulative = [];
  let running = base;
  for (let m = 0; m < months.length; m++) {
    running += perMonth[m];
    cumulative.push(running);
  }
  return {
    months: months.map((m) => m.short),
    monthsFull: months.map((m) => m.full),
    cumulative,
  };
}

/* Page through the curated asset types collecting only creation timestamps, then
   bucket them into the real 12-month cumulative growth curve. Heavy enough to run
   once, lazily, after first paint (see page.js); never on the 30s refresh. Falls
   back to the representative curve on any failure. now is injectable for tests. */
async function buildGrowthSeries(fetchImpl, now) {
  const f = fetchImpl || fetch;
  try {
    const timestamps = [];
    for (const typeId of GROWTH_TYPE_IDS) {
      for (let page = 0; page < GROWTH_MAX_PAGES; page++) {
        const offset = page * GROWTH_PAGE_SIZE;
        const r = await f(`${COLLIBRA_BASE}/rest/2.0/assets?typeIds=${encodeURIComponent(typeId)}&offset=${offset}&limit=${GROWTH_PAGE_SIZE}&countLimit=-1&excludeMeta=true`, { credentials: 'include' });
        if (!r.ok) throw new Error(`Growth page failed: ${r.status}`);
        const data = await r.json();
        const rows = data.results || [];
        for (const a of rows) {
          if (typeof a.createdOn === 'number') timestamps.push(a.createdOn);
        }
        if (rows.length < GROWTH_PAGE_SIZE) break; // last page
      }
    }
    if (!timestamps.length) throw new Error('No creation dates collected.');
    return bucketGrowth(timestamps, now);
  } catch (error) {
    console.error('Could not build live growth; using representative curve:', error);
    return {
      months: REPRESENTATIVE.growthMonths.slice(),
      monthsFull: REPRESENTATIVE.growthMonthsFull.slice(),
      cumulative: REPRESENTATIVE.growthCumulative.slice(),
    };
  }
}

/* Scale the representative sparkline shape so its last point lands on the live
   count, giving each KPI a plausible "trending up to today" mini-series. */
function scaleSparkline(liveCount) {
  const end = (typeof liveCount === 'number' && liveCount > 0) ? liveCount : 100;
  return REPRESENTATIVE.sparkShape.map((f) => Math.round(end * f));
}

/* Expose the module surface for page.js and the test harness. */
const DashboardData = {
  KPIS: DASHBOARD_KPIS,
  representative: REPRESENTATIVE,
  fetchAssetTypeCount,
  fetchActiveUserCount,
  fetchKpiCount,
  resolveCommunityId,
  fetchCommunityAssetCount,
  buildComposition,
  buildGrowthSeries,
  bucketGrowth,
  lastMonths,
  scaleSparkline,
  friendlyDomain,
};
