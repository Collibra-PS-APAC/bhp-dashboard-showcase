/* Shared sample data for the BHP dashboard-layout concepts.
   Mirrors the real landing's data shapes (dashboard-data.js): KPI counts, the
   catalog-growth curve, composition-by-domain, and the workflow tasks. Numbers
   are representative so the concepts read as a live dashboard without an API.
   Each concept renders these through the real BHPApex chart helpers. */
window.DASH = {
  user: 'Shane',
  assetsTotal: 24843,
  months: ['Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun'],
  /* cumulative curated assets, in thousands */
  growth: [15.2, 16.8, 18.1, 19.3, 20.4, 21.3, 22.0, 22.8, 23.4, 23.9, 24.4, 24.8],
  /* a second series some concepts use: monthly searches (hundreds) */
  searches: [44, 55, 57, 70, 78, 95, 102, 110, 121, 128, 140, 156],
  kpis: [
    { key:'dataUtilities',        label:'Data Utilities',         value:1247,  spark:[31,36,34,40,44,48,52,58,63,71,79] },
    { key:'businessDataConcepts', label:'Business Data Concepts', value:9569,  spark:[78,80,83,85,88,90,92,94,96,95,98] },
    { key:'businessApplications', label:'Business Applications',  value:13794, spark:[110,116,120,124,128,131,134,137,139,141,138] },
    { key:'users',                label:'Active users',           value:318,   spark:[210,260,245,300,355,420,398,440,470,455,510] },
    { key:'myTasks',              label:'My open tasks',          value:3,     spark:[1,2,2,4,3,5,4,3,2,3,3] }
  ],
  domains: [
    { name:'Business Applications',  n:13794 },
    { name:'Business Data Concepts', n:9569 },
    { name:'Lifecycle Management',   n:540 },
    { name:'Data Privacy',           n:410 },
    { name:'Data Domains & Views',   n:320 },
    { name:'Policies & Standards',   n:210 }
  ],
  tasks: [
    { title:'Review DSAR request #1042',   type:'DSAR',      due:'Due in 2 days', soon:true },
    { title:'Complete privacy work item',  type:'Work item', due:'Due tomorrow',  soon:true },
    { title:'Assign retention schedule',   type:'DLM',       due:'Due in 6 days', soon:false }
  ],
  fairScore: 78,
  quality: 62
};
