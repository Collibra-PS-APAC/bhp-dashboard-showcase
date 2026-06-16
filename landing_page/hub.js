/* BHP Data Catalog landing hub.
   Renders four category cards, greets the signed-in user, routes catalog
   searches, and runs the choreography that opens a category into a bento of its
   sub-sections and back again.

   Loaded as a plain <script> after ../shared/utils.js, so getCurrentUser is in
   the shared global scope. runSearch is declared global (not module-scoped) so
   the public showcase can stub it the same way it stubs getCurrentUser. */

/* ===== Line art (inline SVG, recoloured to the card accent via currentColor) ===== */
const ART = {
  business:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 3v18M3 12h18"/><circle cx="7.5" cy="7.5" r="1.1"/><circle cx="16.5" cy="7.5" r="1.1"/><circle cx="7.5" cy="16.5" r="1.1"/><circle cx="16.5" cy="16.5" r="1.1"/></svg>',
  technical:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="5.5" rx="7" ry="2.5"/><path d="M5 5.5v6c0 1.38 3.13 2.5 7 2.5s7-1.12 7-2.5v-6"/><path d="M5 11.5v6c0 1.38 3.13 2.5 7 2.5s7-1.12 7-2.5v-6"/></svg>',
  standards:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z"/><path d="M9 11.8l2 2 4-4.4"/></svg>',
  learning:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 8.5L12 4l10 4.5-10 4.5z"/><path d="M6 10.6v4.1c0 1.4 2.69 2.8 6 2.8s6-1.4 6-2.8v-4.1"/><path d="M22 8.5v5.2"/></svg>',
};
const ARROW_RIGHT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const ARROW_LEFT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>';

/* ===== Categories =====
   accent: the card's brand accent, set as --acc (orange leads, teal cools; laid
   out on the diagonal so the 2x2 reads as composed, not a uniform grid).
   Each item's `span` drives its bento placement: lead = 2x2 anchor, wide = 2x1,
   default = 1x1. The dense four-column grid then composes the asymmetric bento. */
const CATEGORIES = [
  {
    key: 'business', idx: '01', accent: 'var(--bhp-orange)', art: ART.business,
    title: 'Business Data',
    desc: 'Domains, metrics, terms, and the rules that keep them trustworthy.',
    items: [
      { no: '1.1', title: 'Data Domains', desc: "Subject areas that group BHP's data.", span: 'lead' },
      { no: '1.2', title: 'Business Metrics', desc: 'Defined measures and how they are calculated.' },
      { no: '1.3', title: 'Business Terms', desc: 'The shared vocabulary for the business.' },
      { no: '1.4', title: 'Data Quality Rules', desc: 'Checks that data must pass to be trusted.', span: 'wide' },
    ],
  },
  {
    key: 'technical', idx: '02', accent: 'var(--bhp-teal)', art: ART.technical,
    title: 'Technical Data',
    desc: 'Where data lives: platforms, utilities, and the Snowflake estate.',
    bentoClass: 'bento--two',
    items: [
      { no: '2.1', title: 'Data Utilities by Data Platform', desc: 'Consumption-ready data products, grouped by platform.' },
      { no: '2.2', title: 'Snowflake Databases', desc: 'Databases and schemas in the Snowflake estate.' },
    ],
  },
  {
    key: 'standards', idx: '03', accent: 'var(--bhp-teal)', art: ART.standards,
    title: 'Data Standards',
    desc: 'The global standard and the guidelines that govern BHP data.',
    items: [
      { no: '3.1', title: 'Data Global Standard', desc: 'The top-level standard for managing BHP data.', span: 'lead' },
      { no: '3.2', title: 'Data Governance Framework Guidelines', desc: 'How governance roles and decisions work.', span: 'wide' },
      { no: '3.3', title: 'Business Data Concepts - Definition & Creation', desc: 'Defining and creating business data concepts.' },
      { no: '3.4', title: 'Data Quality Guidelines', desc: 'Practices for measuring and improving quality.' },
      { no: '3.5', title: 'Using & Safeguarding our Data', desc: 'Handling data safely and within policy.', span: 'wide' },
      { no: '3.6', title: 'Technology Quality Data Standard', desc: 'Quality requirements for technology data.' },
      { no: '3.7', title: 'Data Utility Badge of Trust Specification', desc: 'What a data utility must meet to earn the badge.' },
    ],
  },
  {
    key: 'learning', idx: '04', accent: 'var(--bhp-orange)', art: ART.learning,
    title: 'Learning & Enablement',
    desc: 'Training, pathways, and the LMS for working with quality data.',
    items: [
      { no: '4.1', title: 'Training Materials & Quick Guides', desc: 'How-to guides and reference material.', span: 'lead' },
      { no: '4.2', title: 'Data@BHP', desc: 'The hub for data news and community at BHP.' },
      { no: '4.3', title: 'Data Learning Pathways', desc: 'Guided routes to build data skills.' },
      { no: '4.4', title: 'LMS: Discovery Quality Data', desc: 'Course: discovering quality data.', span: 'wide' },
      { no: '4.5', title: 'LMS: Working with Quality Data', desc: 'Course: working with quality data.', span: 'wide' },
      { no: '4.6', title: 'Data Focused Field Leadership Knowledge Centre', desc: 'Resources for field leaders working with data.', span: 'wide' },
    ],
  },
];

/* Escape text bound into innerHTML so an ampersand or angle bracket in a title
   (for example "Learning & Enablement") renders literally, never as markup. */
function esc(text) {
  return String(text).replace(/[&<>"]/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]
  ));
}

/* True when the user has asked the OS to minimise motion. Read live, so a change
   takes effect on the next interaction without a reload. */
function reducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/* ===== Greeting (REQ: greet the signed-in user, fall back gracefully) ===== */
async function greetUser() {
  const target = document.getElementById('userFirstName');
  if (!target) return;
  const user = await getCurrentUser();
  if (!user) return;
  const firstName = user.firstName || user.userName;
  if (firstName) target.textContent = firstName;
}

/* ===== Search (mirrors the admin landing so behaviour is identical) ===== */
const SEARCH_SCOPES = {
  all:                 { assetTypeId: null },
  dataUtility:         { assetTypeId: '00000000-0000-0000-0001-000400000001' },
  dataConcept:         { assetTypeId: '00000000-0000-0000-0000-000000031113' },
  businessApplication: { assetTypeId: '00000000-0000-0000-0000-000000031302' },
  businessTerm:        { assetTypeId: '00000000-0000-0000-0000-000000011001' },
};

function activeScopeKey() {
  const scope = document.getElementById('searchScope');
  const selected = scope && scope.querySelector('span.on');
  return (selected && selected.getAttribute('data-scope')) || 'all';
}

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

/* Build a catalog search URL from the query box and the active scope, then open
   the Collibra results. Global so the public showcase can stub it. */
function runSearch(event) {
  event.preventDefault();
  const query = document.getElementById('searchInput').value.trim();
  const scope = SEARCH_SCOPES[activeScopeKey()] || SEARCH_SCOPES.all;

  const params = new URLSearchParams({ q: query || '*', page: '1' });
  let url = `${COLLIBRA_BASE}/search?${params.toString()}`;
  if (scope.assetTypeId) {
    url += `&ASSET_TYPE=${encodeURIComponent(`'${scope.assetTypeId}'`)}`;
  }
  window.open(url, '_blank');
}

/* ===== The four cards ===== */
function buildGrid() {
  const grid = document.getElementById('hubGrid');
  if (!grid) return;

  grid.innerHTML = CATEGORIES.map((cat, i) => `
    <button type="button" class="cat" data-cat="${cat.key}" style="--i:${i}; --acc:${cat.accent}"
            aria-label="${esc(cat.title)}, ${cat.items.length} areas">
      <div class="cat__top">
        <span class="cat__idx">${cat.idx}</span>
        <span class="cat__art" aria-hidden="true">${cat.art}</span>
      </div>
      <h2 class="cat__title">${esc(cat.title)}</h2>
      <p class="cat__desc">${esc(cat.desc)}</p>
      <div class="cat__foot">
        <span class="cat__count">${cat.items.length} areas</span>
        <span class="cat__go" aria-hidden="true">${ARROW_RIGHT}</span>
      </div>
    </button>`).join('');

  grid.querySelectorAll('.cat').forEach((btn) => {
    btn.addEventListener('click', () => openCategory(btn.dataset.cat));
  });
}

/* ===== Open / close choreography ===== */
/* The card a category was opened from, so Back can return focus to it. */
let openerCard = null;

function tileMarkup(item, i) {
  const span = item.span === 'lead' ? ' bt--lead' : item.span === 'wide' ? ' bt--wide' : '';
  return `
    <article class="bt${span}" style="--i:${i}">
      <span class="bt__no">${esc(item.no)}</span>
      <h3 class="bt__title">${esc(item.title)}</h3>
      <p class="bt__desc">${esc(item.desc)}</p>
    </article>`;
}

function renderDetail(cat) {
  const detail = document.getElementById('hubDetail');
  detail.style.setProperty('--acc', cat.accent);
  detail.setAttribute('role', 'region');
  detail.setAttribute('aria-label', cat.title);
  detail.innerHTML = `
    <div class="detail__bar">
      <button type="button" class="detail__back">${ARROW_LEFT}<span>All categories</span></button>
      <p class="detail__hint">Destinations are being wired up</p>
    </div>
    <div class="detail__id">
      <span class="detail__art" aria-hidden="true">${cat.art}</span>
      <div>
        <h2 class="detail__title">${esc(cat.title)}</h2>
        <p class="detail__desc">${esc(cat.desc)}</p>
      </div>
    </div>
    <div class="bento ${cat.bentoClass || ''}">
      ${cat.items.map(tileMarkup).join('')}
    </div>`;
  detail.querySelector('.detail__back').addEventListener('click', closeCategory);
}

function openCategory(key) {
  const cat = CATEGORIES.find((c) => c.key === key);
  if (!cat) return;
  const hub = document.getElementById('hub');
  const grid = document.getElementById('hubGrid');
  const detail = document.getElementById('hubDetail');
  const cards = Array.from(grid.querySelectorAll('.cat'));

  openerCard = grid.querySelector(`.cat[data-cat="${key}"]`);
  // The picked card lifts; the rest exit. transform/opacity only.
  cards.forEach((c) => c.classList.add(c === openerCard ? 'is-pick' : 'is-exit'));

  renderDetail(cat);

  const swap = () => {
    cards.forEach((c) => c.classList.remove('is-exit', 'is-pick'));
    grid.hidden = true;
    detail.hidden = false;
    hub.classList.add('is-detail');
    const back = detail.querySelector('.detail__back');
    if (back) back.focus();
  };

  if (reducedMotion()) swap();
  else window.setTimeout(swap, 380);
}

function closeCategory() {
  const hub = document.getElementById('hub');
  const grid = document.getElementById('hubGrid');
  const detail = document.getElementById('hubDetail');

  detail.hidden = true;
  hub.classList.remove('is-detail');
  grid.hidden = false;

  // Re-enter the cards: hold them in the exit state for one frame, then release
  // so the .cat transition plays them back in.
  if (!reducedMotion()) {
    const cards = Array.from(grid.querySelectorAll('.cat'));
    cards.forEach((c) => c.classList.add('is-exit'));
    void grid.offsetWidth; // reflow so "is-exit" is the transition's start state
    window.requestAnimationFrame(() => cards.forEach((c) => c.classList.remove('is-exit')));
  }

  if (openerCard) openerCard.focus();
}

/* Esc closes an open category, matching the Back button. */
function onKeydown(event) {
  if (event.key !== 'Escape') return;
  const detail = document.getElementById('hubDetail');
  if (detail && !detail.hidden) closeCategory();
}

/* ===== Entrance ===== */
function markReady() {
  const wrap = document.querySelector('.wrap');
  if (wrap) wrap.classList.add('is-ready');
}

/* Single entry point. Build the grid and arm the entrance in the same tick (no
   await before markReady), so the cards paint straight into their staggered
   reveal with no flash of the settled state. The greeting resolves async. */
document.addEventListener('DOMContentLoaded', () => {
  buildGrid();
  setupScopePills();
  const searchForm = document.getElementById('catalogSearch');
  if (searchForm) searchForm.onsubmit = runSearch;
  document.addEventListener('keydown', onKeydown);
  markReady();
  greetUser();
});
