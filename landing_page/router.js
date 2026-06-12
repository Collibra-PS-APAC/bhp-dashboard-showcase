/* Landing-page router: the orchestrator that decides where a signed-in user goes
   (REQ-001, REQ-002, REQ-003).

   On load it reads the current user and their groups (from ../shared/utils.js),
   resolves one persona (from config.js), then takes one of two paths:

   - Auto-navigate (Utilities, Privacy): show the interstitial, stop the asset
     counter, and send the whole tab to the persona's dashboard (REQ-003).
   - General landing (General, and DLM): hide the loading overlay and render the
     general page in place, showing the DLM link tile for a DLM user.

   The module loads as a plain <script>, so its names share the global scope with
   config.js, utils.js, and page.js. It reads CONFIG, resolvePersona, and
   assertSameOrigin from config.js; getCurrentUser and fetchAllUserGroups from
   utils.js; and hideLoadingOverlay, showInterstitial, and stopAssetCounter from
   page.js.

   initRouter takes every collaborator through an injected dependency object so
   the orchestration is testable in a plain HTML harness with no live instance
   and no real navigation (see tests/router-test.html). Production passes no
   argument; initRouter then builds the real dependencies from the globals. */

/* Human labels for the interstitial, keyed by persona. The auto-navigate path
   reads one of these so the hand-off names the destination the user expects.
   Only the auto-navigating personas need a label; General and DLM render the page
   in place and never show the interstitial, so they are absent here on purpose. */
const PERSONA_LABELS = {
  utilities: 'Data Utilities',
  privacy: 'Data Privacy',
};

/* Build the production dependency set from the shared globals.
   Read lazily at call time, not at module load, because the script order loads
   utils.js and page.js around this file; the globals exist by the time the
   DOMContentLoaded handler runs, even if the load order around them varies.

   The collaborators that later tasks add (the unset-URL notice in Task 13, the
   DLM tile in Task 10, the task panel in Task 11, and the page.js general-landing
   render wired in Task 14) fall back to a no-op until those tasks define them, so
   the router ships and behaves correctly now. A 'typeof' guard on a name that may
   be undeclared is the one reference that never throws. */
function resolveProductionDeps() {
  const noop = () => {};
  return {
    getCurrentUser,
    fetchAllUserGroups,
    resolvePersona,
    config: CONFIG,
    assertSameOrigin,
    showInterstitial,
    hideLoadingOverlay,
    // page.js holds the counter cleanup in a module-scoped binding that is null
    // until the counter starts, so read it through a thunk at call time.
    stopCounter: () => { if (typeof stopAssetCounter === 'function') stopAssetCounter(); },
    // The only line that touches window.top. The caller wraps it in try/catch.
    navigate: (url) => { window.top.location.href = url; },
    // Resolve each later-task collaborator through a thunk at call time, the same
    // way as stopCounter, so a script that defines its function after this file
    // (Task 13 notice, Task 10 tile, Task 11 panel, Task 14 page handoff) is still
    // found, rather than frozen to a no-op the moment initRouter first runs.
    showUnsetUrlNotice: (...args) => { if (typeof showUnsetUrlNotice === 'function') showUnsetUrlNotice(...args); else noop(); },
    showNavigationError: (...args) => { if (typeof showNavigationError === 'function') showNavigationError(...args); else noop(); },
    showDlmTile: (...args) => { if (typeof showDlmTile === 'function') showDlmTile(...args); else noop(); },
    initTaskPanel: (...args) => { if (typeof initTaskPanel === 'function') initTaskPanel(...args); else noop(); },
    renderGeneralLanding: (...args) => { if (typeof renderGeneralLanding === 'function') renderGeneralLanding(...args); else noop(); },
    // console.time/timeEnd report how long routing took (REQ-001 timing note).
    timer: { start: () => console.time('routing'), end: () => console.timeEnd('routing') },
  };
}

/* Resolve the user's persona, then route. Returns a promise that settles once
   the chosen path finishes its synchronous work (the auto-navigate path settles
   after the interstitial resolves and the navigation is requested).

   A failed user fetch returns null; the router then resolves against an empty
   group list, which yields the General persona, and renders the general landing.
   So a transient API failure lands the user on a working page rather than a
   blank one. */
async function initRouter(deps) {
  const d = deps || resolveProductionDeps();

  d.timer.start();
  const user = await d.getCurrentUser();
  const groups = user ? await d.fetchAllUserGroups(user.id) : [];
  const route = d.resolvePersona(groups, d.config);
  d.timer.end();

  if (route.autoNavigate) {
    return autoNavigate(route, groups, d);
  }
  return renderGeneral(route, groups, d);
}

/* Auto-navigate a Utilities or Privacy user to their dashboard (REQ-003).

   Guard the destination first: assertSameOrigin rejects the unset '' sentinel and
   any off-origin URL (REQ-016). A rejected target never shows the interstitial;
   instead the user keeps the general landing and sees the unset-URL notice
   (REQ-013), which also blocks an open redirect from a misconfigured CONFIG.

   For a valid target: show the interstitial, stop the asset counter, then request
   the navigation. The counter stops before the assignment, never in the catch, so
   its interval and listener cannot leak across the navigation even when the
   assignment is blocked. The probe (Task 17) confirmed window.top navigation
   works here; the try/catch keeps an unexpected block visible rather than silent. */
function autoNavigate(route, groups, d) {
  const url = route.dashboardUrl;
  if (!d.assertSameOrigin(url)) {
    d.showUnsetUrlNotice(route);
    return renderGeneral(route, groups, d);
  }

  const label = PERSONA_LABELS[route.persona] || 'your workspace';
  return d.showInterstitial(label).then(() => {
    d.stopCounter();
    try {
      d.navigate(url);
    } catch (error) {
      // The origin guard passed but the assignment was blocked at runtime (a
      // cross-frame case the probe did not hit). Show the navigation-error notice
      // and render the general landing so the user lands on a working page, not a
      // stuck interstitial.
      console.error('Top-frame navigation was blocked:', error);
      // showNavigationError clears the interstitial; renderGeneral then hides the
      // loading overlay and renders the page. Keep this order if editing.
      d.showNavigationError();
      renderGeneral(route, groups, d);
    }
  });
}

/* Render the general landing in place for a General or DLM user, and as the
   fallback when an auto-navigate target is unsafe.

   Hide the loading overlay (REQ-018), show the DLM link tile only for a DLM user
   (REQ-008), start the workflow-task panel, then hand the route and groups to
   page.js to render the rest of the page. */
function renderGeneral(route, groups, d) {
  d.hideLoadingOverlay();
  if (route.persona === 'dlm') d.showDlmTile(route);
  d.initTaskPanel(route, groups);
  d.renderGeneralLanding(route, groups);
}

/* Start the router on page load. A test harness sets __ROUTER_TEST_HARNESS__ to
   opt out, because it drives initRouter with injected dependencies instead.
   As a last resort, an unexpected router failure still hides the loading overlay,
   so a stuck page can never hide the dashboard behind the overlay. */
if (typeof window === 'undefined' || !window.__ROUTER_TEST_HARNESS__) {
  document.addEventListener('DOMContentLoaded', () => {
    initRouter().catch((error) => {
      console.error('Router failed to initialize:', error);
      if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
    });
  });
}
