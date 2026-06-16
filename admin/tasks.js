/* Workflow-task side panel (REQ-006, REQ-007).

   Shows the signed-in user's open Collibra workflow tasks on the general landing:
   a header with a count badge and a scrollable list, with distinct loading,
   empty, and error states. The router calls initTaskPanel on the general-landing
   path; page.js and utils.js load alongside in the shared global scope.

   Data comes from GET /rest/2.0/workflowTasks (Task 17 probe A1): a GET, no CSRF,
   offset/limit paging, a total count. The endpoint is not scoped to the caller
   (probe A5), so this filters client-side to the current user by matching
   candidateUsers[].id against the id from the shared getCurrentUser() call.

   Per-row link (REQ-007, probe A4 corrected): most tasks are global "create new"
   workflows with no related asset, but asset-started tasks (DLM retention, asset
   relationship, add-control) carry a businessItemReference of type Asset. When
   one is present the row opens that asset page (/asset/<id>); otherwise it opens
   the Collibra Tasks page. */

/* Paging for the workflowTasks fetch. MAX_TASKS_PAGES caps a runaway endpoint at
   a bounded number of requests, the same guard shape as the user-groups fetch. */
const TASKS_PAGE_SIZE = 50;
const MAX_TASKS_PAGES = 20;

/* Link targets. The asset page restores REQ-007 for asset-started tasks; the
   Tasks page is the fallback for global tasks that have no related asset. Both
   resolve against the serving origin, so the same bundle works on any instance. */
const TASK_ASSET_PATH = '/asset/';
const TASKS_FALLBACK_PATH = '/tasks';

/* Friendly work-type labels, keyed by the workflow processId seen on the dev instance
   (probe A3). An unknown process falls back to a neutral "Task". */
const WORK_TYPE_LABELS = {
  dSAR: 'DSAR',
  createDsarResponse: 'DSAR response',
  workItem1: 'Work item',
  retentionAssignment: 'DLM retention',
  createDLMUseCase: 'DLM use case',
  addDLMControl: 'DLM control',
  escalationProcess: 'Escalation',
  BHPAddConceptsWizard: 'Add concepts',
  imageTest: 'Test',
};

/* The current user's open workflow tasks (REQ-006).
   Pages /rest/2.0/workflowTasks to completion, filters to tasks where the user is
   a candidate (probe A5), and maps each to the small shape the panel renders.
   Throws on a failed request so initTaskPanel can show the error state; the panel
   is the defensive boundary that keeps a failure from breaking the page.

   fetchImpl is injectable for tests; production uses the global fetch.

   @param {string} userId      the signed-in user's id.
   @param {function} fetchImpl  optional fetch, defaults to window.fetch.
   @returns {Promise<object[]>} mapped tasks: {id, title, processId, priority,
            createTime, dueDate, asset:{id,name}|null}. */
async function fetchMyWorkflowTasks(userId, fetchImpl) {
  const doFetch = fetchImpl || ((url) => fetch(url, { credentials: 'include' }));
  const mine = [];

  for (let page = 0; page < MAX_TASKS_PAGES; page++) {
    const offset = page * TASKS_PAGE_SIZE;
    const url = `${COLLIBRA_BASE}/rest/2.0/workflowTasks?offset=${offset}&limit=${TASKS_PAGE_SIZE}`;
    const response = await doFetch(url);
    if (!response.ok) throw new Error(`Task lookup failed: ${response.status}`);
    const data = await response.json();
    const results = data.results || [];

    for (const task of results) {
      const candidates = task.candidateUsers || [];
      if (!candidates.some((user) => user && user.id === userId)) continue;

      // businessItemReference carries the related asset id and name when the task
      // was started against an asset; it is absent for global workflows.
      const ref = task.businessItemReference;
      const asset = ref && ref.resourceType === 'Asset' && ref.id
        ? { id: ref.id, name: ref.name || '' }
        : null;

      mine.push({
        id: task.id,
        title: task.title || 'Untitled task',
        processId: (task.workflowDefinition && task.workflowDefinition.processId) || '',
        // priority and createTime are carried for a later sort or detail view; the
        // panel does not render them yet.
        priority: task.priority,
        createTime: task.createTime,
        dueDate: task.dueDate || null,
        asset,
      });
    }

    if (results.length < TASKS_PAGE_SIZE) break;
  }
  return mine;
}

/* The same-origin link for a task row (REQ-007).
   Asset-started task -> its asset page; any other task -> the Tasks page. Always
   absolute on the serving origin, so the row anchor (target="_top") sends the
   whole tab and the URL passes assertSameOrigin. */
function taskHref(task) {
  const base = window.location.origin;
  if (task && task.asset && task.asset.id) {
    return base + TASK_ASSET_PATH + encodeURIComponent(task.asset.id);
  }
  return base + TASKS_FALLBACK_PATH;
}

/* A short, human due-date label. Returns '' when there is no due date.
   now is injectable so the label is testable without a clock. */
function formatTaskDue(dueDate, now) {
  if (!dueDate) return '';
  const current = (typeof now === 'number') ? now : Date.now();
  const dayMs = 86400000;
  // Compare whole calendar-ish days from now, rounding down toward "today".
  const days = Math.floor((Number(dueDate) - current) / dayMs);
  if (Number.isNaN(days)) return '';
  if (days < 0) return 'Overdue';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

/* A friendly label for a workflow processId (probe A3). */
function workTypeLabel(processId) {
  return WORK_TYPE_LABELS[processId] || 'Task';
}

/* Whole-day offset of a due date from now: negative is overdue, 0 today, 1
   tomorrow. null when there is no due date. now is injectable for tests. */
function dueOffsetDays(dueDate, now) {
  if (!dueDate) return null;
  const current = (typeof now === 'number') ? now : Date.now();
  const days = Math.floor((Number(dueDate) - current) / 86400000);
  return Number.isNaN(days) ? null : days;
}

/* Sort tasks by due date ascending (most overdue / soonest first); tasks with no
   due date sort to the end. */
function sortTasksByDue(tasks, now) {
  return tasks.slice().sort((a, b) => {
    const oa = dueOffsetDays(a.dueDate, now);
    const ob = dueOffsetDays(b.dueDate, now);
    if (oa === null && ob === null) return 0;
    if (oa === null) return 1;
    if (ob === null) return -1;
    return oa - ob;
  });
}

/* Timeboxed buckets, in display order. Urgent ones open by default; the rest
   start collapsed. Empty buckets are hidden. Each tests a whole-day due offset. */
const TASK_BUCKETS = [
  { label: 'Overdue',     danger: true,  open: true,  test: (o) => o !== null && o < 0 },
  { label: 'Today',       danger: false, open: true,  test: (o) => o === 0 },
  { label: 'Tomorrow',    danger: false, open: true,  test: (o) => o === 1 },
  { label: 'This week',   danger: false, open: false, test: (o) => o !== null && o >= 2 && o <= 6 },
  { label: 'This month',  danger: false, open: false, test: (o) => o !== null && o >= 7 && o <= 30 },
  { label: 'Upcoming',    danger: false, open: false, test: (o) => o !== null && o > 30 },
  { label: 'No due date', danger: false, open: false, test: (o) => o === null },
];

const TASK_CHEVRON = '<span class="tgroup__chev" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></span>';

/* One task row as a same-origin link (REQ-007 hybrid: the asset page when the
   task is asset-started, the Tasks page otherwise). Titles are set with
   textContent, so a task title can never inject markup. */
function taskRowEl(task, now) {
  const row = document.createElement('a');
  row.className = 'titem';
  row.setAttribute('target', '_top');
  row.setAttribute('href', taskHref(task));

  const left = document.createElement('div');
  const title = document.createElement('div');
  title.className = 'titem__t';
  title.textContent = task.title;
  const type = document.createElement('div');
  type.className = 'titem__m';
  type.textContent = workTypeLabel(task.processId);
  left.appendChild(title);
  left.appendChild(type);
  row.appendChild(left);

  const dueText = formatTaskDue(task.dueDate, now);
  if (dueText) {
    const due = document.createElement('span');
    // An overdue task gets the error tone so it reads as urgent at a glance.
    due.className = 'titem__due' + (dueText === 'Overdue' ? ' over' : '');
    due.textContent = dueText;
    row.appendChild(due);
  }
  return row;
}

/* Tag an element for the per-row entrance cascade (see .wrap.is-ready in
   styles.css). counter threads the running index across calls. */
function cascadeTask(el, counter) {
  el.classList.add('task-anim');
  el.style.setProperty('--ti', String(counter.i++));
}

/* Render the timeboxed, collapsible task groups into the container. Empty buckets
   are skipped; urgent ones open, the rest start collapsed. Only visible (rendered)
   rows join the entrance cascade, so collapsed rows neither animate nor leave gaps.

   animate (default true) tags rows for the first-load cascade; a refresh passes
   false so it does not re-animate. A bucket's open/collapsed state is preserved
   across refreshes (keyed by label), so a re-poll never collapses what the user
   opened. */
function renderTaskBuckets(container, tasks, now, animate) {
  // Capture the current open/collapsed state so a refresh can restore it.
  const wasCollapsed = {};
  container.querySelectorAll('.tgroup').forEach((group) => {
    const label = group.querySelector('.tgroup__label');
    if (label) wasCollapsed[label.textContent] = group.classList.contains('collapsed');
  });

  container.replaceChildren();
  const counter = { i: 0 };
  const tag = animate !== false;

  TASK_BUCKETS.forEach((bucket) => {
    const items = tasks.filter((t) => bucket.test(dueOffsetDays(t.dueDate, now)));
    if (!items.length) return;

    const collapsed = (bucket.label in wasCollapsed) ? wasCollapsed[bucket.label] : !bucket.open;

    const group = document.createElement('div');
    group.className = 'tgroup' + (collapsed ? ' collapsed' : '');

    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'tgroup__head';
    head.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    head.innerHTML = TASK_CHEVRON +
      '<span class="tgroup__label' + (bucket.danger ? ' overdue' : '') + '"></span>' +
      '<span class="tgroup__count"></span>';
    head.querySelector('.tgroup__label').textContent = bucket.label;
    head.querySelector('.tgroup__count').textContent = String(items.length);
    if (tag) cascadeTask(head, counter);

    const body = document.createElement('div');
    body.className = 'tgroup__body';
    items.forEach((task) => {
      const row = taskRowEl(task, now);
      if (tag && !collapsed) cascadeTask(row, counter);
      body.appendChild(row);
    });

    head.addEventListener('click', () => {
      const isCollapsed = group.classList.toggle('collapsed');
      head.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
    });

    group.appendChild(head);
    group.appendChild(body);
    container.appendChild(group);
  });
}

/* Set the "N open" text in the task-panel caption. */
function setTaskHeaderCount(text) {
  const countEl = document.getElementById('taskCount');
  if (countEl) countEl.textContent = text;
}

/* Render the loading skeleton into the container. */
function renderTasksLoading(container) {
  container.replaceChildren();
  [80, 60, 72, 50].forEach((width) => {
    const bar = document.createElement('div');
    bar.className = 'tskel';
    bar.style.width = width + '%';
    container.appendChild(bar);
  });
}

/* Render an empty or error message into the container. */
function renderTasksMessage(container, kind, message) {
  container.replaceChildren();
  const div = document.createElement('div');
  div.className = 'tstate' + (kind === 'error' ? ' err' : '');
  div.textContent = message;
  container.appendChild(div);
}

/* Fill the "My open tasks" KPI (the row tasks.js owns). On first render it counts
   the value up and, for a non-zero count, draws a sparkline scaled to it. On a
   silent refresh it updates the value in place with a brief flash and leaves the
   sparkline as is. */
function renderTasksKpi(count, silent) {
  const valEl = document.getElementById('kpi-myTasks');
  if (valEl) {
    if (silent) {
      const formatted = count.toLocaleString();
      if (valEl.textContent !== formatted) {
        valEl.textContent = formatted;
        valEl.classList.add('is-updated');
        setTimeout(() => valEl.classList.remove('is-updated'), 600);
      }
    } else if (typeof countUp === 'function') {
      countUp(valEl, count, (n) => n.toLocaleString());
    } else {
      valEl.textContent = count.toLocaleString();
    }
  }
  const sparkEl = document.getElementById('spark-myTasks');
  // Draw the sparkline on the first render, or on a refresh that first gives this
  // card a non-zero count (so a user who gains their first task mid-session is not
  // left with the only empty sparkline in the row).
  const sparkEmpty = sparkEl && sparkEl.childElementCount === 0;
  if (count > 0 && sparkEl && (!silent || sparkEmpty) && typeof ApexCharts !== 'undefined' && typeof BHPApex !== 'undefined' && typeof DashboardData !== 'undefined') {
    sparkEl.replaceChildren();
    new ApexCharts(sparkEl, BHPApex.sparkline({
      series: [{ name: 'My open tasks', data: DashboardData.scaleSparkline(count) }],
      height: 34, color: BHPApex.tokens.ORANGE,
      extra: {
        xaxis: { categories: DashboardData.representative.sparkMonths },
        tooltip: { x: { show: true }, y: { formatter: (v) => v.toLocaleString() }, marker: { show: false } },
      },
    })).render();
  }
}

/* Initialize and fill the task panel (REQ-006).
   Shows the loading skeleton, then loads the user's tasks and renders the
   timeboxed buckets, the empty state, or the error state into #myTasks; it also
   sets the caption count and the "My open tasks" KPI. Never throws: a failure to
   load the user or the tasks lands on the error state, so the panel can never
   break the surrounding page.

   opts is injectable for tests: getUser, fetchTasks, containerId, now. opts.silent
   (used by refreshTaskPanel) skips the loading skeleton, the entrance cascade, and
   the error-state replacement, so a 30s re-poll updates in place and keeps the
   existing list if a single refresh fails.

   @param {object} route    the resolved route (reserved; kept for symmetry).
   @param {string[]} groups  the user's groups (reserved).
   @param {object} opts     optional injection points. */
async function initTaskPanel(route, groups, opts) {
  opts = opts || {};
  const container = document.getElementById(opts.containerId || 'myTasks');
  if (!container) return;

  const getUser = opts.getUser || getCurrentUser;
  const fetchTasks = opts.fetchTasks || fetchMyWorkflowTasks;
  const nowMs = (typeof opts.now === 'function') ? opts.now() : Date.now();
  const silent = !!opts.silent;

  if (!silent) {
    setTaskHeaderCount('loading…');
    renderTasksLoading(container);
  }

  try {
    const user = await getUser();
    if (!user) throw new Error('Current user unavailable.');
    const sorted = sortTasksByDue(await fetchTasks(user.id), nowMs);
    setTaskHeaderCount(sorted.length + ' open');
    renderTasksKpi(sorted.length, silent);
    if (!sorted.length) {
      renderTasksMessage(container, 'empty', 'No open tasks');
    } else {
      renderTaskBuckets(container, sorted, nowMs, !silent);
    }
  } catch (error) {
    console.error('Could not load the workflow tasks:', error);
    // On a silent refresh, keep the existing list rather than wiping it for a
    // transient failure; only the first load shows the error state.
    if (!silent) {
      setTaskHeaderCount('—');
      renderTasksMessage(container, 'error', "Couldn't load your tasks");
    }
  }
}

/* Re-poll and re-render the task list in place for the 30s refresh (page.js).
   Silent: no loading skeleton, no re-animation, open/collapsed state preserved,
   and a transient failure keeps the current list. */
function refreshTaskPanel(opts) {
  return initTaskPanel(null, null, Object.assign({ silent: true }, opts || {}));
}
