/* Data Privacy dashboard orchestrator.

   Reads the signed-in user, loads the work items, the DPIA mix, and the
   work-item-type options, then renders the bento tiles: the "my open work items"
   hero, the completion trend, the queue, the unassigned rail, the open-items-by-
   assignee bar, and the DPIA panel.
   The work-item-type filter re-renders the work-item views in place. Search routes
   to Collibra search, mirroring the landing page.

   Loads after privacy-data.js (PrivacyData), ../js/apex-bhp-theme.js (BHPApex),
   and ../shared/utils.js (getCurrentUser) in the shared global scope. Defensive
   throughout: a failed load lands on a panel's empty/error state, never a blank
   page. */

/* Search-scope asset-type IDs. dataConcept is a stable OOTB ID (shared with the
   landing page); dpia is resolved by name at init because the DPIA type ID is
   environment-specific. "all" runs an unfiltered search. */
const DP_SEARCH_SCOPES = {
  all: { assetTypeId: null },
  dataConcept: { assetTypeId: '00000000-0000-0000-0000-000000031113' },
  dpia: { assetTypeId: null }, // filled in at init from resolveAssetTypeId('DPIA')
};

/* Status -> brand colour for the hero pills and the DPIA donut. Unlisted statuses
   fall back to the categorical palette. */
const DP_STATUS_COLORS = {
  'Completed': '#E65400', 'Done': '#E65400',
  'Not Required': '#0E7C86',
  'In Progress': '#FF8A4D',
  'To Do': '#6B7B86', 'Blocked': '#B42318', 'Reviewed': '#3FA9B3',
  'Unknown': '#3D4F5C', 'Cancelled': '#9A9A9A',
};

/* Due-date buckets for the queue, in display order. Same shape as the landing
   page's task panel. Each tests a whole-day offset from now. */
const DP_BUCKETS = [
  { label: 'Overdue', danger: true, test: (o) => o !== null && o < 0 },
  { label: 'Today', danger: false, test: (o) => o === 0 },
  { label: 'Tomorrow', danger: false, test: (o) => o === 1 },
  { label: 'This week', danger: false, test: (o) => o !== null && o >= 2 && o <= 6 },
  { label: 'This month', danger: false, test: (o) => o !== null && o >= 7 && o <= 30 },
  { label: 'Upcoming', danger: false, test: (o) => o !== null && o > 30 },
  { label: 'No due date', danger: false, test: (o) => o === null },
];

/* Dashboard state, set once during init and read by the renderers. */
const dpState = {
  user: null,
  workItems: [],
  allTypes: [],
  selectedTypes: new Set(), // empty means "all types"
  now: Date.now(),
};

/* Animate a number from 0 to target, easing out and honouring reduced motion. */
function dpCountUp(el, target) {
  if (!el) return;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = (n) => Number(n).toLocaleString('en-US');
  if (reduce) { el.textContent = fmt(target); return; }
  const dur = 1000;
  let t0 = null;
  function step(t) {
    if (t0 === null) t0 = t;
    const p = Math.min((t - t0) / dur, 1);
    el.textContent = fmt(Math.round(target * (1 - Math.pow(1 - p, 3))));
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* The work items that pass the current type filter. */
function dpFilteredItems() {
  return dpState.workItems.filter((w) => PrivacyData.matchesTypeFilter(w, dpState.selectedTypes));
}

/* A same-origin link to a work item's asset page. */
function dpAssetHref(item) {
  return window.location.origin + '/asset/' + encodeURIComponent(item.id);
}

/* A short, human due-date label. */
function dpDueLabel(offset) {
  if (offset === null) return '';
  if (offset < 0) return 'Overdue';
  if (offset === 0) return 'Due today';
  if (offset === 1) return 'Due tomorrow';
  if (offset <= 6) return `Due in ${offset} days`;
  const weeks = Math.round(offset / 7);
  return offset <= 30 ? `Due in ${weeks} wk` : `Due in ${Math.round(offset / 30)} mo`;
}

/* ===== Renderers ===== */

/* Hero: count of open work items assigned to me, plus a per-status pill row. */
function renderHero() {
  const mine = dpFilteredItems().filter((w) => PrivacyData.isOpenWorkItem(w) && PrivacyData.isAssignedToUser(w.assignee, dpState.user));
  const valEl = document.getElementById('openCount');
  dpCountUp(valEl, mine.length);

  const byStatus = {};
  for (const w of mine) byStatus[w.status] = (byStatus[w.status] || 0) + 1;

  const pills = document.getElementById('heroPills');
  pills.replaceChildren();
  PrivacyData.OPEN_STATUSES.forEach((status) => {
    if (!byStatus[status]) return;
    const span = document.createElement('span');
    span.textContent = status + ' ';
    const b = document.createElement('b');
    b.textContent = byStatus[status];
    span.appendChild(b);
    pills.appendChild(span);
  });
}

/* Queue: open work items assigned to me, grouped by due date, soonest first. */
function renderQueue() {
  const container = document.getElementById('queueList');
  const countEl = document.getElementById('queueCount');
  const mine = dpFilteredItems()
    .filter((w) => PrivacyData.isOpenWorkItem(w) && PrivacyData.isAssignedToUser(w.assignee, dpState.user))
    .map((w) => ({ w, off: PrivacyData.dpDueOffsetDays(w.dueMs, dpState.now) }))
    .sort((a, b) => {
      if (a.off === null && b.off === null) return 0;
      if (a.off === null) return 1;
      if (b.off === null) return -1;
      return a.off - b.off;
    });

  if (countEl) countEl.textContent = mine.length ? `${mine.length} open` : '';
  container.replaceChildren();
  if (!mine.length) {
    container.appendChild(dpStateEl('empty', 'No open work items assigned to you.'));
    return;
  }

  DP_BUCKETS.forEach((bucket) => {
    const rows = mine.filter((r) => bucket.test(r.off));
    if (!rows.length) return;

    const grp = document.createElement('div');
    grp.className = 'grp';
    const gh = document.createElement('div');
    gh.className = 'gh' + (bucket.danger ? ' over' : '');
    gh.textContent = bucket.label + ' ';
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = `(${rows.length})`;
    gh.appendChild(n);
    grp.appendChild(gh);

    rows.forEach(({ w, off }) => grp.appendChild(dpQueueRow(w, off)));
    container.appendChild(grp);
  });
}

/* One queue row as a same-origin link to the work item. */
function dpQueueRow(item, offset) {
  const row = document.createElement('a');
  row.className = 'ti';
  row.setAttribute('target', '_top');
  row.setAttribute('href', dpAssetHref(item));

  const wid = document.createElement('span');
  wid.className = 'wid';
  wid.textContent = item.workItemId;
  const t = document.createElement('span');
  t.className = 't';
  t.textContent = item.title;
  row.appendChild(wid);
  row.appendChild(t);

  if (item.type) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = item.type;
    row.appendChild(chip);
  }
  const label = dpDueLabel(offset);
  if (label) {
    const due = document.createElement('span');
    due.className = 'due' + (offset !== null && offset < 0 ? ' over' : '');
    due.textContent = label;
    row.appendChild(due);
  }
  return row;
}

/* Unassigned: open work items with no assignee (a "needs an owner" queue). */
function renderUnassigned() {
  const container = document.getElementById('unassignedList');
  const items = dpFilteredItems().filter((w) => PrivacyData.isOpenWorkItem(w) && !String(w.assignee).trim());
  container.replaceChildren();
  if (!items.length) {
    container.appendChild(dpStateEl('empty', 'Every open work item has an owner.'));
    return;
  }
  items.slice(0, 8).forEach((item) => {
    const row = document.createElement('div');
    row.className = 'ti';
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = item.title;
    row.appendChild(t);
    if (item.type) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = item.type;
      row.appendChild(chip);
    }
    container.appendChild(row);
  });
}

/* Completion trend: a per-month column micro-chart of work items closed in the
   last 12 months, scoped by the current type filter. */
function renderTrend() {
  const el = document.getElementById('spark');
  if (!el || typeof ApexCharts === 'undefined' || typeof BHPApex === 'undefined') return;
  const closed = dpFilteredItems(); // closed items are counted by their Date Closed
  const series = PrivacyData.completionsByMonth(closed, dpState.now);
  el.replaceChildren();
  new ApexCharts(el, BHPApex.sparkline({
    series: [{ name: 'Completed', data: series.counts }],
    height: 54,
    color: BHPApex.tokens.ORANGE,
    extra: {
      xaxis: { categories: series.months },
      markers: { size: 0, hover: { size: 4 } },
      tooltip: { x: { show: true }, y: { formatter: (v) => `${v} completed` }, marker: { show: false } },
    },
  })).render();
}

/* Assignee panel: a horizontal stacked bar of open work items per assignee,
   one row per person, segmented by Status in the same colours as the hero
   pills. Length compares workload at a glance; the segments show its make-up.
   The unassigned group renders last as "Unassigned". */
function renderAssignees() {
  const el = document.getElementById('whoChart');
  if (!el) return;
  const rows = PrivacyData.openItemsByAssignee(dpFilteredItems());
  const totalOpen = rows.reduce((s, r) => s + r.total, 0);

  const metaEl = document.getElementById('whoMeta');
  if (metaEl) {
    const owners = rows.filter((r) => r.name).length;
    metaEl.textContent = totalOpen ? `${totalOpen} open across ${owners} ${owners === 1 ? 'person' : 'people'}` : '';
  }

  el.replaceChildren();
  if (!rows.length) {
    el.appendChild(dpStateEl('empty', 'No open work items.'));
    return;
  }
  if (typeof ApexCharts === 'undefined' || typeof BHPApex === 'undefined') return;

  // One series per open Status that actually occurs, in canonical order.
  const statuses = PrivacyData.OPEN_STATUSES.filter((s) => rows.some((r) => r.counts[s]));
  const series = statuses.map((s) => ({ name: s, data: rows.map((r) => r.counts[s] || 0) }));
  const maxTotal = Math.max.apply(null, rows.map((r) => r.total));

  new ApexCharts(el, BHPApex.bar({
    series,
    categories: rows.map((r) => r.name || 'Unassigned'),
    height: rows.length * 44 + 90,
    extra: {
      chart: { stacked: true },
      colors: statuses.map((s) => DP_STATUS_COLORS[s] || '#6B7B86'),
      fill: { type: 'solid' },
      // Room for the total label past the longest bar.
      grid: { padding: { right: 28 } },
      plotOptions: {
        bar: {
          barHeight: '55%',
          borderRadius: 5,
          borderRadiusApplication: 'end',
          borderRadiusWhenStacked: 'last',
          dataLabels: {
            total: {
              enabled: true,
              offsetX: 4,
              style: { color: BHPApex.tokens.INK, fontSize: '12px', fontWeight: 700 },
            },
          },
        },
      },
      xaxis: {
        // Counts are small integers; whole-number ticks only.
        min: 0,
        max: maxTotal,
        tickAmount: Math.min(maxTotal, 6),
        labels: { formatter: (v) => String(Math.round(v)) },
      },
      yaxis: { labels: { style: { colors: BHPApex.tokens.INK, fontSize: '13px' }, maxWidth: 140 } },
      legend: { position: 'bottom', horizontalAlign: 'left' },
      tooltip: { y: { formatter: (v) => `${v} work item${v === 1 ? '' : 's'}` } },
    },
  })).render();
}

/* DPIA panel: a donut of the DPIA status mix plus a legend and a plain-language
   read of the backlog. */
function renderDpia(dpia) {
  const metaEl = document.getElementById('dpiaMeta');
  if (metaEl) metaEl.textContent = `${Number(dpia.total).toLocaleString('en-US')} assessments`;

  const key = document.getElementById('dpiaKey');
  key.replaceChildren();
  const colors = dpia.mix.map((d) => DP_STATUS_COLORS[d.name] || '#6B7B86');
  dpia.mix.forEach((d, i) => {
    const pct = dpia.total ? Math.round((d.n / dpia.total) * 100) : 0;
    const r = document.createElement('div');
    r.className = 'r';
    const sw = document.createElement('span');
    sw.className = 'sw';
    sw.style.background = colors[i];
    const name = document.createTextNode(' ' + d.name + ' ');
    const ct = document.createElement('span');
    ct.className = 'ct';
    ct.textContent = Number(d.n).toLocaleString('en-US');
    const pc = document.createElement('span');
    pc.className = 'pc';
    pc.textContent = pct < 1 ? '<1%' : pct + '%';
    r.appendChild(sw); r.appendChild(name); r.appendChild(ct); r.appendChild(document.createTextNode(' ')); r.appendChild(pc);
    key.appendChild(r);
  });

  const inProgress = (dpia.mix.find((d) => d.name === 'In Progress') || {}).n || 0;
  const completed = (dpia.mix.find((d) => d.name === 'Completed') || {}).n || 0;
  const note = document.getElementById('dpiaNote');
  if (note) {
    note.replaceChildren();
    const lead = document.createElement('b');
    lead.textContent = `${completed.toLocaleString('en-US')} completed`;
    note.appendChild(lead);
    note.appendChild(document.createTextNode(
      inProgress
        ? `, ${inProgress} in progress. Demo data for this showcase.`
        : '. No assessments are in progress; the DPIA backlog is clear. Demo data for this showcase.'));
  }

  const donutEl = document.getElementById('donut');
  if (donutEl && typeof ApexCharts !== 'undefined' && typeof BHPApex !== 'undefined') {
    donutEl.replaceChildren();
    new ApexCharts(donutEl, Object.assign(BHPApex.base(), {
      chart: { type: 'donut', height: 200, fontFamily: 'Arial, sans-serif' },
      series: dpia.mix.map((d) => d.n),
      labels: dpia.mix.map((d) => d.name),
      colors: colors,
      legend: { show: false },
      dataLabels: { enabled: false },
      stroke: { width: 2, colors: ['#fff'] },
      plotOptions: { pie: { donut: { size: '68%' } } },
      tooltip: { y: { formatter: (v) => `${Number(v).toLocaleString('en-US')} assessments` } },
    })).render();
  }
}

/* A small state element (empty or error message). */
function dpStateEl(kind, message) {
  const div = document.createElement('div');
  div.className = 'dp-state' + (kind === 'error' ? ' err' : '');
  div.textContent = message;
  return div;
}

/* Render every work-item-derived view from current state (hero, trend, queue,
   unassigned). Called on first load and on every filter change. */
function renderWorkItemViews() {
  renderHero();
  renderTrend();
  renderQueue();
  renderUnassigned();
  renderAssignees();
}

/* ===== Filter, search, greeting wiring ===== */

/* Build the type-filter checkbox menu and keep the button label in sync. */
function setupTypeFilter() {
  const btn = document.getElementById('filterBtn');
  const menu = document.getElementById('filterMenu');
  if (!btn || !menu) return;

  const list = document.createElement('div');
  dpState.allTypes.forEach((type) => {
    const label = document.createElement('label');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.value = type;
    cb.addEventListener('change', () => {
      if (cb.checked) dpState.selectedTypes.delete(type);
      else dpState.selectedTypes.add(type);
      // selectedTypes holds the DESELECTED set inverted below, so recompute:
      syncSelectedFromMenu(menu);
      updateFilterLabel(btn);
      renderWorkItemViews();
    });
    label.appendChild(cb);
    label.appendChild(document.createTextNode(' ' + type));
    list.appendChild(label);
  });

  const actions = document.createElement('div');
  actions.className = 'menu-act';
  const all = document.createElement('button');
  all.type = 'button'; all.textContent = 'Select all';
  const none = document.createElement('button');
  none.type = 'button'; none.textContent = 'Clear';
  all.addEventListener('click', () => setAllChecks(menu, true, btn));
  none.addEventListener('click', () => setAllChecks(menu, false, btn));
  actions.appendChild(all);
  actions.appendChild(none);

  menu.replaceChildren(actions, list);

  btn.addEventListener('click', () => menu.classList.toggle('open'));
  document.addEventListener('click', (e) => {
    if (!btn.contains(e.target) && !menu.contains(e.target)) menu.classList.remove('open');
  });
  updateFilterLabel(btn);
}

/* selectedTypes holds the set of types to SHOW. We model it as: empty = all.
   Recompute it from the menu so "all checked" maps to the empty set (no filter). */
function syncSelectedFromMenu(menu) {
  const boxes = Array.from(menu.querySelectorAll('input[type="checkbox"]'));
  const checked = boxes.filter((b) => b.checked).map((b) => b.value);
  dpState.selectedTypes = (checked.length === boxes.length)
    ? new Set() // all selected: no filter
    : new Set(checked);
}

function setAllChecks(menu, value, btn) {
  menu.querySelectorAll('input[type="checkbox"]').forEach((b) => { b.checked = value; });
  syncSelectedFromMenu(menu);
  updateFilterLabel(btn);
  renderWorkItemViews();
}

function updateFilterLabel(btn) {
  const b = btn.querySelector('b');
  if (!b) return;
  const n = dpState.selectedTypes.size;
  b.textContent = n === 0 ? 'All types' : `${n} selected`;
}

/* The data-scope of the selected pill, or 'all'. */
function dpActiveScope() {
  const scope = document.getElementById('searchScope');
  const on = scope && scope.querySelector('span.on');
  return (on && on.getAttribute('data-scope')) || 'all';
}

/* Wire scope pills (single-select) and the search submit (routes to Collibra). */
function setupSearch() {
  const scope = document.getElementById('searchScope');
  if (scope) {
    scope.addEventListener('click', (e) => {
      const pill = e.target.closest('[data-scope]');
      if (!pill) return;
      scope.querySelectorAll('span').forEach((s) => s.classList.remove('on'));
      pill.classList.add('on');
    });
  }
  const form = document.getElementById('catalogSearch');
  if (form) form.onsubmit = dpRunSearch;
}

function dpRunSearch(event) {
  event.preventDefault();
  const input = document.getElementById('searchInput');
  const query = (input && input.value.trim()) || '*';
  const scope = DP_SEARCH_SCOPES[dpActiveScope()] || DP_SEARCH_SCOPES.all;
  const params = new URLSearchParams({ q: query, page: '1' });
  let url = `${COLLIBRA_BASE}/search?${params.toString()}`;
  if (scope.assetTypeId) url += `&ASSET_TYPE=${encodeURIComponent(`'${scope.assetTypeId}'`)}`;
  window.open(url, '_blank');
}

/* Put the first name into the greeting. */
function renderGreeting() {
  const el = document.getElementById('userFirstName');
  if (el && dpState.user && dpState.user.firstName) el.textContent = dpState.user.firstName;
}

/* ===== Orchestration ===== */

async function initPrivacyDashboard() {
  dpState.now = Date.now();
  try {
    // User first: the greeting and the "assigned to me" match both need it.
    dpState.user = await getCurrentUser();
    renderGreeting();

    // Resolve the DPIA search-scope ID in the background; search still works
    // unfiltered if it never resolves.
    PrivacyData.resolveAssetTypeId('DPIA').then((id) => { DP_SEARCH_SCOPES.dpia.assetTypeId = id; });

    setupSearch();

    // Work items drive four panels; load them, then the filter options.
    dpState.workItems = await PrivacyData.fetchWorkItems();
    dpState.allTypes = await PrivacyData.fetchWorkItemTypeOptions(dpState.workItems);
    setupTypeFilter();
    renderWorkItemViews();

    // DPIA panel is independent of the work-item filter.
    const dpia = await PrivacyData.fetchDpiaStatusMix();
    renderDpia(dpia);
  } catch (error) {
    console.error('Data Privacy dashboard failed to initialise:', error);
    const queue = document.getElementById('queueList');
    if (queue) { queue.replaceChildren(dpStateEl('error', "Couldn't load your work items.")); }
  }
}

if (document.readyState !== 'loading') initPrivacyDashboard();
else window.addEventListener('DOMContentLoaded', initPrivacyDashboard);
