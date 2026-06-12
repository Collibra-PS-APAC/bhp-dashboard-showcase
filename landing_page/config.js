/* Routing configuration and pure resolution helpers for the landing-page router.

   This file holds the single source of truth for "which group means which
   persona, and where does that persona's dashboard live" (REQ-004), plus two
   pure functions the router uses: resolvePersona (pick one persona from the
   user's groups) and assertSameOrigin (guard every navigation target, REQ-016).

   It defines globals on window (loaded as a plain <script>, no build step).
   router.js loads after this file and reads CONFIG, resolvePersona, and
   assertSameOrigin from the shared global scope. */

/* CONFIG: the one place to edit group patterns, personas, and dashboard URLs.

   Schema:
   - routes[]            ordered by precedence. The first route whose pattern
                         matches any of the user's group names wins. No match
                         resolves to General. An empty routes array is valid and
                         always resolves to General.
       persona           persona key (utilities | privacy | dlm).
       match.type        'exact' | 'prefix' | 'regex'.
       match.value       the literal (exact/prefix) or pattern source (regex).
       dashboardUrl      the persona's Collibra dashboard URL. '' is the unset
                         sentinel: the router keeps the user on the general
                         landing and shows a notice (REQ-013) rather than
                         navigating to a blank target.
       autoNavigate      true  -> navigate the whole tab on match (Utilities,
                                  Privacy).
                         false -> stay on the general landing and surface the
                                  persona another way (DLM shows a link tile).
   - matchCaseInsensitive  when true (default), group names match patterns
                           regardless of case, so BHP casing variants resolve
                           with one route each.
   - allowedOrigin (getter)  the only origin the router may navigate to
                             (REQ-016). Derived from window.location.origin at
                             read time, so the same bundle works on the dev instance,
                             the test instance, or production with no per-environment
                             edit, and the guard can never drift from the origin
                             that actually served the page.

   The group patterns below are the real the dev instance groups (Open Question 6):
   Utilities is the DataUtilities_* family; Privacy spans the DataPrivacy_*,
   Privacy Workflow, and DSAR groups, so it matches on a regex rather than one
   prefix; DLM is the DLM * family. The dashboard destinations point at this
   bundle's persona stub pages until BHP supplies the real dashboard URLs
   (Open Question 3); swap the stubUrl calls for those URLs in one edit. */

/* Resolve a persona stub page relative to wherever the landing page is served,
   so the same bundle works on any Collibra instance with no
   per-environment edit. The stubs sit one level up from landing_page/, in
   sibling folders at the bundle root. */
function stubUrl(folder) {
  return new URL('../' + folder + '/index.html', window.location.href).href;
}

const CONFIG = {
  routes: [
    { persona: 'utilities', match: { type: 'prefix', value: 'DataUtilities' },
      get dashboardUrl() { return stubUrl('data_utilities'); }, autoNavigate: true },
    { persona: 'privacy',   match: { type: 'regex', value: 'privacy|dsar' },
      get dashboardUrl() { return stubUrl('data_privacy'); }, autoNavigate: true },
    { persona: 'dlm',       match: { type: 'prefix', value: 'DLM' },
      get dashboardUrl() { return stubUrl('dlm'); }, autoNavigate: false },
  ],
  matchCaseInsensitive: true,
  get allowedOrigin() { return window.location.origin; },
};

/* Freeze CONFIG so code loaded later in the shared global scope cannot rewrite a
   route or flip matchCaseInsensitive at runtime and silently break resolution.
   Freezing is deep over routes; the allowedOrigin getter still evaluates after a
   freeze, so the origin guard keeps working. Editing destinations still happens
   here in the source before deploy, which is the intended single edit point. */
CONFIG.routes.forEach((route) => {
  Object.freeze(route.match);
  Object.freeze(route);
});
Object.freeze(CONFIG.routes);
Object.freeze(CONFIG);

/* The General persona: the default when no route matches, and the persona for a
   user with no groups. It never auto-navigates and has no dashboard URL; the
   router renders the general landing for it. Frozen so callers cannot mutate the
   shared default. */
const GENERAL_PERSONA = Object.freeze({
  persona: 'general',
  match: null,
  dashboardUrl: '',
  autoNavigate: false,
});

/* Does one group name match one route's pattern?
   exact  -> full-string equality.
   prefix -> the group name starts with the pattern value.
   regex  -> the pattern (developer-controlled, from CONFIG only) tests the name.
   Case-insensitive unless the caller passes caseInsensitive = false.
   A malformed regex returns false rather than throwing, so one bad pattern can
   never break resolution for a user. */
function groupMatchesRoute(groupName, match, caseInsensitive) {
  if (typeof groupName !== 'string' || !match) return false;
  // exact and prefix compare folded strings; regex keeps the original name and
  // folds via the 'i' flag instead (folding before RegExp.test would be wrong).
  const name = caseInsensitive ? groupName.toLowerCase() : groupName;
  const value = caseInsensitive ? String(match.value).toLowerCase() : String(match.value);

  switch (match.type) {
    case 'exact':
      return name === value;
    case 'prefix':
      return name.startsWith(value);
    case 'regex':
      try {
        // Patterns come only from the static CONFIG, never from an API response,
        // so they are trusted; keep them simple and anchored (see design doc).
        return new RegExp(match.value, caseInsensitive ? 'i' : '').test(groupName);
      } catch (error) {
        console.error('Skipping malformed regex route pattern:', match.value, error);
        return false;
      }
    default:
      return false;
  }
}

/* Resolve exactly one persona from the user's group names (REQ-001, REQ-002).

   Pure: it reads only its arguments, so it is testable in a plain HTML harness
   with no live instance. Walks config.routes in array order (the precedence
   Utilities > Privacy > DLM) and returns the first route any group matches.
   Returns the frozen General default when nothing matches, when the group list
   is empty, or when routes is empty.

   @param {string[]} groupNames  the user's Collibra group names (any falsy value
                                  is treated as no groups).
   @param {object}   config      a CONFIG-shaped object (routes, matchCaseInsensitive).
   @returns {object} the matched route entry, or GENERAL_PERSONA. */
function resolvePersona(groupNames, config) {
  const groups = Array.isArray(groupNames) ? groupNames : [];
  const routes = config && Array.isArray(config.routes) ? config.routes : [];
  const caseInsensitive = !config || config.matchCaseInsensitive !== false;

  for (const route of routes) {
    if (!route || !route.match) continue;
    const hit = groups.some((name) => groupMatchesRoute(name, route.match, caseInsensitive));
    if (hit) return route;
  }
  return GENERAL_PERSONA;
}

/* Is url an absolute URL on the origin that served this page (REQ-016)?

   Returns true only when new URL(url) parses and its origin equals
   window.location.origin. Returns false (never throws) on an empty, relative,
   malformed, or off-origin value. The router navigates the tab only when this
   returns true; any other target routes through the unset/notice path (REQ-013),
   which blocks an open redirect from a misconfigured CONFIG URL.

   @param {string} url  the navigation target to validate.
   @returns {boolean} */
function assertSameOrigin(url) {
  try {
    if (typeof url !== 'string' || url === '') return false;
    // No base argument: a relative URL throws here and is correctly rejected.
    return new URL(url).origin === window.location.origin;
  } catch (error) {
    return false;
  }
}
