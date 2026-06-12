# BHP Dashboard Showcase

A static showcase of a custom Collibra dashboard styled to BHP brand guidelines,
built by Collibra Professional Services APAC as a proof of concept.

**Live demo:** starts on the BHP Data Catalog landing page (`landing_page/`),
with tiles through to the Data Lifecycle Management preview (`dlm/`) and the
full Data Privacy persona dashboard (`data_privacy/`). A Data Utilities preview
stub (`data_utilities/`) is also included.

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
