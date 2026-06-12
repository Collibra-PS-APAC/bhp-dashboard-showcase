# BHP Dashboard Showcase

A static showcase of a custom Collibra dashboard styled to BHP brand guidelines,
built by Collibra Professional Services APAC as a proof of concept.

**Live demo:** the root page is a gateway with two paths:

- **Live dashboards** - the BHP Data Catalog landing page (`landing_page/`),
  with tiles through to the Data Privacy dashboard (`data_privacy/`) and the
  Data Lifecycle Management preview (`dlm/`). A Data Utilities preview stub
  (`data_utilities/`) is also included.
- **Design palette and components** - the BHP Orange theme system
  (`brand/palette-preview.html`): colour ramps, input and routing components,
  the chart gallery, the Collibra theme config sheet, and six full-page
  dashboard layout concepts (`design-explorations/dashboard-concepts/`). Use
  these galleries to choose the building blocks for future dashboards.

This copy is fully self-contained. All data is fictional and generated in the
page at load time; nothing here talks to a Collibra instance. The production
version of this dashboard reads live data through the Collibra REST API and
runs inside the Collibra dashboard framework.

Person names, work items, and metrics shown are demo fixtures, not real people
or real records.

## Stack

- Plain HTML/CSS/JS, no build step
- [ApexCharts](https://apexcharts.com/) (MIT), vendored
- [Arimo](https://fonts.google.com/specimen/Arimo) (Apache 2.0), self-hosted
