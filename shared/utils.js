/* Shared Collibra utilities.
   The landing page and the router both load this file (as a plain <script>, so
   the names below are globals on window). It holds the base URL, the cached
   current-user fetch, and the paginated user-groups fetch that both the router
   and the session panel rely on.

   getCurrentUser (REQ-017): one /users/current call serves the greeting, the
   session panel, and the router. fetchAllUserGroups (REQ-019): pages to
   completion so the panel can never show fewer groups than the router resolved
   against. */

/* Base URL for the Collibra instance.
   Leave empty ('') when the bundle is hosted on the Collibra origin itself:
   relative paths then carry the session cookie automatically, which is the
   design the dashboard targets.
   Set it to the instance URL only for off-origin testing (for example when the
   bundle is hosted on DigitalOcean Spaces). The user fetch is then cross-origin,
   subject to the instance CORS policy, and the session cookie travels only if it
   is SameSite=None. Search still works either way, because opening a URL is
   navigation, not a fetch. */
const COLLIBRA_BASE = '';

/* userGroups page size and a hard cap on pages. The cap stops a malfunctioning
   endpoint (one that never returns a short page) from looping forever: at worst
   the loop makes MAX_GROUPS_PAGES requests and returns what it gathered. */
const GROUPS_PAGE_SIZE = 100;
const MAX_GROUPS_PAGES = 20;

/* Fetch the signed-in user. Returns the user object, or null on failure so every
   caller can degrade on its own (the greeting keeps its fallback, the session
   panel stays hidden, the router lands the user on the general page).
   Prefer getCurrentUser for shared use; this is the single fetch it wraps. */
async function fetchCurrentUser() {
  try {
    // credentials:'include' so the session cookie is sent on a cross-origin call.
    const response = await fetch(`${COLLIBRA_BASE}/rest/2.0/users/current`, { credentials: 'include' });
    if (!response.ok) throw new Error(`User lookup failed: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Could not load the current user:', error);
    return null;
  }
}

/* Module-scoped current-user cache (REQ-017).
   userPromise dedupes concurrent callers onto one in-flight request; cachedUser
   holds the resolved user for synchronous reads after the first await. */
let cachedUser = null;
let userPromise = null;

/* Return the signed-in user, fetching at most once across all consumers.
   Concurrent calls share the same in-flight promise, so the greeting, the
   session panel, and the router together trigger a single /users/current call.
   On failure the cache is cleared so a later call can retry rather than being
   stuck on a transient error.

   router.js and page.js both call this (they share the global scope); neither
   fetches /users/current directly.

   @returns {Promise<object|null>} the user, or null if the fetch failed. */
function getCurrentUser() {
  if (cachedUser) return Promise.resolve(cachedUser);
  if (!userPromise) {
    userPromise = fetchCurrentUser().then((user) => {
      if (user) {
        cachedUser = user;
      } else {
        // Clear so the next caller retries instead of caching a failure.
        userPromise = null;
      }
      return user;
    });
  }
  return userPromise;
}

/* All group names for the user, paged to completion (REQ-019).
   Requests pages of GROUPS_PAGE_SIZE, advancing the offset, until a page returns
   fewer than a full page (the last page) or the MAX_GROUPS_PAGES guard trips.
   Returns a flat array of names, empty on any failure so one bad call never
   breaks the page. This is the single source of group names for both the router
   (persona resolution) and the session panel (group chips). */
async function fetchAllUserGroups(userId) {
  const names = [];
  try {
    for (let page = 0; page < MAX_GROUPS_PAGES; page++) {
      const offset = page * GROUPS_PAGE_SIZE;
      const url = `${COLLIBRA_BASE}/rest/2.0/userGroups?userId=${userId}&offset=${offset}&limit=${GROUPS_PAGE_SIZE}`;
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error(`Group lookup failed: ${response.status}`);
      const data = await response.json();
      const results = data.results || [];
      for (const group of results) {
        if (group && group.name) names.push(group.name);
      }
      // A short page is the last page; stop without an extra empty request.
      if (results.length < GROUPS_PAGE_SIZE) break;
    }
    return names;
  } catch (error) {
    console.error('Could not load the user groups:', error);
    return [];
  }
}
