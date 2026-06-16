/* BHP Data Catalog general landing page.
   Behavior for the page itself: greet the signed-in user, show their session
   info, keep a live asset count, and route catalog searches. Shared fetchers
   (the current user and the user's groups) live in ../shared/utils.js, which
   loads before this file. */

/* Asset-type filters for the search-scope pills, keyed by each pill's data-scope.
   These are stable Collibra asset-type IDs (the same across instances), matching
   the KPI types where they overlap. "all" runs an unfiltered catalog search and
   needs no ID. If BHP re-points an asset type, update the IDs here only. */
const SEARCH_SCOPES = {
  all:                 { assetTypeId: null },
  dataUtility:         { assetTypeId: '00000000-0000-0000-0001-000400000001' }, // Data Utility (Dataset)
  dataConcept:         { assetTypeId: '00000000-0000-0000-0000-000000031113' }, // Business Data Concept (Data Concept)
  businessApplication: { assetTypeId: '00000000-0000-0000-0000-000000031302' }, // Business Application (System)
  businessTerm:        { assetTypeId: '00000000-0000-0000-0000-000000011001' }, // Business Term
};

/* True when the user has asked the OS to minimise motion; entrance and count-up
   animations honour it by rendering the final state at once. */
function prefersReducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/* Animate a number from 0 up to target, formatting each frame with fmt. Eases out
   over ~900ms. Renders the final value at once under reduced motion or a missing
   element. */
function countUp(el, target, fmt) {
  if (!el) return;
  if (prefersReducedMotion()) { el.textContent = fmt(target); return; }
  const duration = 900, start = performance.now();
  (function frame(now) {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(Math.round(target * eased));
    if (p < 1) requestAnimationFrame(frame);
  })(start);
}

/* Compact count format for chart tooltips: 1826755 -> "1.83M", 13794 -> "13.8k". */
function fmtCompact(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  return Number(n).toLocaleString();
}

/* Greet the signed-in user by first name. Falls back to the neutral "there"
   already in the markup if the user fetch fails, so a slow or failed call never
   leaves the greeting broken. */
async function showUserFirstName() {
  const target = document.getElementById('userFirstName');
  if (!target) return;
  const user = await getCurrentUser();
  if (!user) return;
  const firstName = user.firstName || user.userName;
  if (firstName) target.textContent = firstName;
}

/* Show the signed-in user's last sign-in date and group memberships in the
   panel under the search bar. Both calls are independent and defensive: if one
   fails, the other still renders, and the panel reveals itself only once at
   least one value is in place.

   groups is the list the router already fetched; when passed it is reused, so the
   page does not fetch the user's groups a second time. It falls back to its own
   fetch when called without groups (for example in a standalone test). */
async function showUserMeta(groups) {
  const panel = document.getElementById('userMeta');
  if (!panel) return;

  const user = await getCurrentUser();
  if (!user) return;

  const [lastLogin, groupNames] = await Promise.all([
    fetchLastLogin(user.id),
    Array.isArray(groups) ? Promise.resolve(groups) : fetchAllUserGroups(user.id),
  ]);

  const loginEl = document.getElementById('lastLogin');
  if (loginEl) loginEl.textContent = lastLogin ? formatLoginDate(lastLogin) : 'Not recorded';

  const groupsEl = document.getElementById('userGroups');
  if (groupsEl) {
    if (groupNames.length) {
      groupsEl.replaceChildren(...groupNames.map((name) => {
        const chip = document.createElement('span');
        chip.className = 'user-meta__group';
        chip.textContent = name;
        return chip;
      }));
    } else {
      groupsEl.textContent = 'None';
    }
  }

  panel.hidden = false;
}

/* The current-user endpoint omits last-login, so read it from the output module,
   filtered to this one user. Returns the epoch-millis string, or null on failure. */
async function fetchLastLogin(userId) {
  try {
    // The CSRF token is session-scoped. It is fetched fresh here rather than
    // cached for the page lifetime, because a long-lived cache could go stale
    // before the token expires. showUserMeta runs once on load, so the extra
    // round trip costs nothing today.
    const sessionResponse = await fetch(`${COLLIBRA_BASE}/rest/2.0/auth/sessions/current?include=csrfToken`, { credentials: 'include' });
    if (!sessionResponse.ok) throw new Error(`Session lookup failed: ${sessionResponse.status}`);
    const session = await sessionResponse.json();
    const csrfToken = session.csrfToken;
    if (!csrfToken) throw new Error('CSRF token not found.');

    const payload = {
      TableViewConfig: {
        displayLength: 1,
        Resources: {
          User: {
            Id: { name: 'userId' },
            LastLogin: { name: 'lastLogin' },
            Filter: { Field: { name: 'userId', operator: 'EQUALS', value: userId } },
          },
        },
        Columns: [{ Column: { fieldName: 'userId' } }, { Column: { fieldName: 'lastLogin' } }],
      },
    };

    const response = await fetch(`${COLLIBRA_BASE}/rest/2.0/outputModule/export/json?validationEnabled=false`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrfToken },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Last-login lookup failed: ${response.status}`);
    const data = await response.json();

    return data.aaData?.[0]?.lastLogin || null;
  } catch (error) {
    console.error('Could not load the last sign-in date:', error);
    return null;
  }
}

/* Format an epoch-millis string as a readable local date and time. */
function formatLoginDate(epochMillis) {
  const date = new Date(Number(epochMillis));
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/* How often the live figures refresh, in milliseconds. The asset total, the KPI
   counts, and the task list all poll on this cadence (REQ: 30s live refresh). */
const COUNTER_REFRESH_MS = 30000;

/* Total number of assets in the platform. An unfiltered count: limit=0 returns
   only the total, not the rows, so the call stays cheap enough to poll.
   Returns the number, or null on failure so the displayed value is left intact. */
async function fetchTotalAssetCount() {
  try {
    const data = await fetch(`${COLLIBRA_BASE}/rest/2.0/assets?offset=0&limit=0&countLimit=-1&excludeMeta=true`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`Asset count failed: ${r.status}`);
        return r.json();
      });
    return typeof data.total === 'number' ? data.total : null;
  } catch (error) {
    console.error('Could not load the asset count:', error);
    return null;
  }
}

/* Module-scoped teardown for the asset counter. The router (Task 9) calls this
   before navigating the tab away, so polling stops and the visibilitychange
   listener detaches (REQ-017) rather than leaking across a navigation. */
let stopAssetCounter = null;

/* Show the asset count and keep it current by polling in place.
   setInterval updates the number node without reloading the page. Polling pauses
   while the tab is hidden and runs an immediate refresh when it returns, so a
   backgrounded tab makes no needless calls.
   Returns a cleanup function that stops the interval AND removes the
   visibilitychange listener, so a caller (the router) can tear the counter down
   completely before navigating away. Returns null if the counter is absent. */
function startAssetCounter() {
  const numberEl = document.getElementById('assetCount');
  if (!numberEl) return null;

  let lastValue = null;

  const render = (count) => {
    if (count === null || count === lastValue) return;
    lastValue = count;
    numberEl.textContent = count.toLocaleString();
    // Flash the figure briefly so a change is noticeable.
    numberEl.classList.add('is-updated');
    setTimeout(() => numberEl.classList.remove('is-updated'), 600);
  };

  const refresh = async () => {
    if (document.visibilityState === 'hidden') return;
    render(await fetchTotalAssetCount());
  };

  const onVisibility = () => {
    if (document.visibilityState === 'visible') refresh();
  };

  refresh();
  const handle = setInterval(refresh, COUNTER_REFRESH_MS);
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    clearInterval(handle);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

/* The data-scope of the selected pill, or 'all' when none is marked. */
function activeScopeKey() {
  const scope = document.getElementById('searchScope');
  const selected = scope && scope.querySelector('span.on');
  return (selected && selected.getAttribute('data-scope')) || 'all';
}

/* Wire the scope pills: single-select on click or Enter/Space, so exactly one is
   active at a time and runSearch reads it. */
function setupScopePills() {
  const scope = document.getElementById('searchScope');
  if (!scope) return;
  const pills = scope.querySelectorAll('span');
  const select = (pill) => {
    pills.forEach((p) => p.classList.remove('on'));
    pill.classList.add('on');
  };
  pills.forEach((pill) => {
    pill.addEventListener('click', () => select(pill));
    pill.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(pill); }
    });
  });
}

/* Build a catalog search URL from the query box and the active scope pill, then
   open the Collibra search results. */
function runSearch(event) {
  event.preventDefault();
  // searchInput is guaranteed present: runSearch only fires via the #catalogSearch
  // submit listener, and the input is a child of that form.
  const query = document.getElementById('searchInput').value.trim();
  const scope = SEARCH_SCOPES[activeScopeKey()] || SEARCH_SCOPES.all;

  const params = new URLSearchParams({ q: query || '*', page: '1' });
  let url = `${COLLIBRA_BASE}/search?${params.toString()}`;
  if (scope.assetTypeId) {
    // Collibra expects the asset-type ID wrapped in single quotes, URL-encoded.
    url += `&ASSET_TYPE=${encodeURIComponent(`'${scope.assetTypeId}'`)}`;
  }
  window.open(url, '_blank');
}

/* Hide the loading overlay (REQ-018) by fading it out and clearing aria-busy.
   The overlay is visible by default in the markup. The router calls this once
   routing resolves on the general-landing path, and its init catch calls it as a
   last resort, so the page is never left covered. */
function hideLoadingOverlay() {
  const overlay = document.getElementById('loadingOverlay');
  if (!overlay) return;
  overlay.classList.add('is-hidden');
  overlay.setAttribute('aria-busy', 'false');
}

/* Minimum time the routing interstitial stays up, so the hand-off reads as a
   deliberate transition and never just a flash. */
const INTERSTITIAL_MIN_MS = 600;

/* Show the routing interstitial for an auto-navigated persona, then resolve
   after INTERSTITIAL_MIN_MS (REQ-012). The router (Task 9) awaits this and then
   sets window.top.location. personaName is the human label, e.g. "Data Privacy".
   Resolves immediately if the markup is absent, so the router never hangs. */
function showInterstitial(personaName) {
  const overlay = document.getElementById('routingInterstitial');
  if (!overlay) return Promise.resolve();

  const heading = document.getElementById('interstitialHeading');
  const message = document.getElementById('interstitialMessage');

  overlay.hidden = false;
  if (heading) heading.textContent = `Taking you to ${personaName}`;
  // Set the live-region message after the reveal so it is announced on show.
  if (message) message.textContent = `Opening your ${personaName} workspace…`;

  // Move focus into the card so keyboard and screen-reader users land on it.
  const card = overlay.querySelector('.routing-interstitial__card');
  if (card) card.focus();

  return new Promise((resolve) => setTimeout(resolve, INTERSTITIAL_MIN_MS));
}

/* Reveal the DLM link tile and wire its click (REQ-008).
   The router calls this only for a DLM user, on the general-landing path. The
   tile is an anchor that is hidden in the markup until now; this fills its href
   and intercepts the click so the whole tab, not the embedded iframe, navigates
   to the DLM dashboard.

   The click validates the target with assertSameOrigin first (REQ-016), so a
   blank or off-origin URL never navigates; an unset target shows the notice
   (REQ-013) once Task 13 defines it, and is a no-op until then. navigate is
   injectable so the click is testable without leaving the page; production omits
   it and the tab navigates through window.top.

   @param {object} route     the matched DLM route (reads route.dashboardUrl).
   @param {function} navigate optional navigation sink, defaults to window.top. */
function showDlmTile(route, navigate) {
  const tile = document.getElementById('dlmTile');
  if (!tile) return;

  const url = route && route.dashboardUrl;
  const go = navigate || ((target) => { window.top.location.href = target; });

  // Keep the anchor's own href in step with the origin guard: the validated URL
  // when it is same-origin, the inert '#' otherwise. So even if a later change
  // ever drops the click handler's preventDefault, native activation agrees with
  // the guard and never leaves the page for a blank or off-origin target.
  tile.setAttribute('href', assertSameOrigin(url) ? url : '#');
  tile.hidden = false;

  // Assign onclick (not addEventListener) so a second call cannot stack a
  // duplicate handler on the same tile. Read the target from the element at click
  // time, so the guard always checks exactly what the tile would navigate to.
  tile.onclick = (event) => {
    event.preventDefault();
    const target = tile.getAttribute('href');
    if (assertSameOrigin(target)) {
      go(target);
    } else {
      console.warn('DLM dashboard URL is unset or off-origin; staying on the landing.');
      if (typeof showUnsetUrlNotice === 'function') showUnsetUrlNotice(route);
    }
  };
}

/* Human persona labels for the notice copy. DLM is included here (unlike the
   router's auto-navigate labels) because a DLM user reaches the notice through
   an unset DLM tile. */
const NOTICE_PERSONA_LABELS = {
  utilities: 'Data Utilities',
  privacy: 'Data Privacy',
  dlm: 'Data Lifecycle Management',
};

/* Show the navigation notice with a message and wire its close button (REQ-013).
   Hides the loading overlay first, so the notice is never left behind it, and
   sets the message after revealing the banner so the aria-live region announces
   it. A missing banner is a no-op, so a caller never breaks the page. */
function showNotice(message) {
  const notice = document.getElementById('navNotice');
  if (!notice) return;

  hideLoadingOverlay();
  notice.hidden = false;

  const messageEl = document.getElementById('navNoticeMessage');
  if (messageEl) messageEl.textContent = message;

  // Assign onclick (not addEventListener) so repeated shows never stack handlers.
  const closeEl = document.getElementById('navNoticeClose');
  if (closeEl) {
    closeEl.onclick = () => { notice.hidden = true; };
    // Move focus to the dismiss control so keyboard and screen-reader users land
    // on the notice and can close it at once.
    closeEl.focus();
  }
}

/* Hide the routing interstitial if it is showing. The navigation-error path needs
   this: the interstitial was revealed before the blocked hand-off, so it must be
   cleared, or it would cover the general landing the user falls back to. */
function hideInterstitial() {
  const overlay = document.getElementById('routingInterstitial');
  if (overlay) overlay.hidden = true;
}

/* Tell the user their persona dashboard has no destination set, so they stay on
   the general landing (REQ-013). Called by the router and the DLM tile when a
   dashboard URL is empty or off-origin. Accepts the resolved route and reads its
   persona for the label. */
function showUnsetUrlNotice(route) {
  const label = route && NOTICE_PERSONA_LABELS[route.persona];
  const subject = label ? `The ${label} dashboard` : 'That dashboard';
  showNotice(`${subject} isn't set up yet, so we've kept you on the general landing.`);
}

/* Tell the user a dashboard hand-off failed and they are back on the general
   landing (REQ-013). Called from the router's navigation catch. */
function showNavigationError() {
  hideInterstitial();
  showNotice("We couldn't open your dashboard, so we've kept you on the general landing.");
}

/* The sparkline accent colour for a KPI: orange and teal alternate down the row. */
function sparkColor(key) {
  const t = (typeof BHPApex !== 'undefined') ? BHPApex.tokens : { ORANGE: '#E65400', TEAL: '#0E7C86' };
  const map = { dataUtilities: t.ORANGE, businessDataConcepts: t.TEAL, businessApplications: t.ORANGE, users: t.TEAL, myTasks: t.ORANGE };
  return map[key] || t.ORANGE;
}

/* Fill the KPI stat row: count each metric live, count the value up, and draw its
   sparkline. The count-up is held ~1s so it ticks as the row reveals (see the
   .wrap.is-ready entrance). The "My open tasks" KPI is owned by tasks.js, which
   sets its value when the panel resolves; here it only gets a sparkline.
   Defensive throughout: a null count leaves the value at 0 and still draws a
   representative sparkline. */
function renderKpis() {
  if (typeof DashboardData === 'undefined') return Promise.resolve();
  const fmtInt = (n) => n.toLocaleString();
  const countDelay = prefersReducedMotion() ? 0 : 1000;
  return Promise.all(DashboardData.KPIS.map(async (kpi) => {
    // The "My open tasks" KPI is owned by tasks.js, which knows the live count;
    // it sets the value and draws the sparkline when the task panel resolves.
    if (kpi.source.kind === 'tasks') return;
    const valEl = document.getElementById('kpi-' + kpi.key);
    const sparkEl = document.getElementById('spark-' + kpi.key);
    const count = await DashboardData.fetchKpiCount(kpi);
    if (valEl && count !== null) setTimeout(() => countUp(valEl, count, fmtInt), countDelay);
    if (sparkEl && typeof ApexCharts !== 'undefined' && typeof BHPApex !== 'undefined') {
      new ApexCharts(sparkEl, BHPApex.sparkline({
        series: [{ name: kpi.label, data: DashboardData.scaleSparkline(count) }],
        height: 34, color: sparkColor(kpi.key),
        extra: {
          xaxis: { categories: DashboardData.representative.sparkMonths },
          tooltip: { x: { show: true }, y: { formatter: (v) => v.toLocaleString() }, marker: { show: false } },
        },
      })).render();
    }
  }));
}

/* Draw the two charts. Composition is cheap (one count per community) so it
   renders straight away; growth is heavier (it buckets real creation dates) so it
   renders once its async build resolves, after the rest of the page is up. Both
   fall back to representative data inside DashboardData on failure. */
function renderCharts() {
  if (typeof ApexCharts === 'undefined' || typeof BHPApex === 'undefined' || typeof DashboardData === 'undefined') return;

  const domainEl = document.getElementById('domainChart');
  if (domainEl) {
    DashboardData.buildComposition().then((domains) => {
      const topDomains = domains.slice(0, 6);
      new ApexCharts(domainEl, BHPApex.bar({
        series: [{ name: 'Assets', data: topDomains.map((d) => d.n) }],
        categories: topDomains.map((d) => d.name), height: 240,
        extra: { tooltip: { y: { formatter: (v) => fmtCompact(v) } } },
      })).render();
    });
  }

  const growthEl = document.getElementById('growthChart');
  if (growthEl) {
    DashboardData.buildGrowthSeries().then((g) => {
      new ApexCharts(growthEl, BHPApex.line({
        series: [{ name: 'Assets', data: g.cumulative }],
        categories: g.months, height: 230,
        extra: { tooltip: { x: { formatter: (val, opts) => g.monthsFull[opts.dataPointIndex] || val } } },
      })).render();
    });
  }
}

/* Re-poll the asset-type / user KPI counts and update the values in place, with a
   brief flash, without re-running the count-up. The "My open tasks" KPI is owned
   by tasks.js and refreshed with the task list. */
function refreshKpiValues() {
  if (typeof DashboardData === 'undefined') return Promise.resolve();
  return Promise.all(DashboardData.KPIS.map(async (kpi) => {
    if (kpi.source.kind === 'tasks') return;
    const valEl = document.getElementById('kpi-' + kpi.key);
    if (!valEl) return;
    const count = await DashboardData.fetchKpiCount(kpi);
    if (count === null) return;
    const formatted = count.toLocaleString();
    if (valEl.textContent === formatted) return; // no change, no flash
    valEl.textContent = formatted;
    valEl.classList.add('is-updated');
    setTimeout(() => valEl.classList.remove('is-updated'), 600);
  }));
}

/* Teardown handle for the dashboard refresh (mirrors stopAssetCounter). The
   general landing is the terminal render, so this is not torn down by the router;
   it is kept module-scoped for symmetry and future use. */
let stopDashboardRefresh = null;

/* Poll the KPI counts and the task list every COUNTER_REFRESH_MS, in place. Pauses
   while the tab is hidden and refreshes once it returns, so a backgrounded tab
   makes no needless calls. Growth and composition are not re-polled: growth is a
   near-static history and composition changes slowly. Returns a cleanup function. */
function startDashboardRefresh() {
  // An in-flight guard so a slow instance can never overlap two refresh batches
  // (which would rebuild the task list twice and double-flash the KPIs).
  let inFlight = false;
  const tick = () => {
    if (document.visibilityState === 'hidden' || inFlight) return;
    inFlight = true;
    Promise.all([
      refreshKpiValues(),
      // refreshTaskPanel (tasks.js) re-fetches and re-renders the task list silently.
      (typeof refreshTaskPanel === 'function') ? refreshTaskPanel() : Promise.resolve(),
    ]).finally(() => { inFlight = false; });
  };
  const handle = setInterval(tick, COUNTER_REFRESH_MS);
  const onVisibility = () => { if (document.visibilityState === 'visible') tick(); };
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    clearInterval(handle);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

/* Add .is-ready to the landing root, which arms the entrance animation. Done on
   the general path only, so an auto-navigating persona (whose editorial landing
   exists only briefly) never animates and nothing plays behind the overlay. */
function markLandingReady() {
  const wrap = document.querySelector('.wrap');
  if (wrap) wrap.classList.add('is-ready');
}

/* Render the general landing in place (REQ-005).
   The router calls this on the general-landing path, after it has hidden the
   loading overlay and shown any persona extras (the DLM tile, the task panel).
   It arms the entrance animation, greets the user, keeps the live asset total in
   the lede, wires the search and its scope pills, fills the KPI row, and draws the
   charts. tasks.js fills the task buckets separately (the router calls it).

   groups is the list the router already fetched, reused here so showUserMeta does
   not fetch the user's groups again. route is accepted for symmetry with the other
   render-path collaborators and for future per-persona tailoring.

   page.js no longer starts itself on load: router.js owns the single
   DOMContentLoaded entry and calls this on the general path. */
function renderGeneralLanding(route, groups) {
  markLandingReady();
  showUserFirstName();
  showUserMeta(groups); // no-op without the (now removed) #userMeta panel; kept for tests
  stopAssetCounter = startAssetCounter();
  setupScopePills();
  renderKpis();
  renderCharts();
  stopDashboardRefresh = startDashboardRefresh();
  // Assign onsubmit (not addEventListener) so the handler can never stack if this
  // render ever runs twice (for example via the auto-navigate error fallback).
  const searchForm = document.getElementById('catalogSearch');
  if (searchForm) searchForm.onsubmit = runSearch;
}
