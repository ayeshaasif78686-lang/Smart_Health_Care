# Demonstration guide

1. Start demo or MongoDB mode following README. Login as Project Manager.
2. Dashboard shows live totals from the API. Set EVM status date to 24 October 2026 to reproduce seeded examples.
3. Open Project Charter, change manager/objectives, save, and refresh to show persistence.
4. View Requirements and WBS. AI and mobile features are Proposed.
5. Open Change Requests, select Review for CR-001. Record a comment and approve. Budget becomes PKR 5,800,000 and duration 19 weeks. Original budget remains PKR 5,000,000. Linked requirements/WBS become Approved.
6. Return to the same change. It has no second approval action. API tests also prove duplicate decisions are rejected.
7. Add approved-feature tasks through Schedule & Resources. Choose owners and an approved change; supply valid predecessor IDs, dates, planned cost and progress. Dates must start after all predecessors finish. New task allocations are a deliberate manager action.
8. Edit progress and actual effort. Completed means 100%; other statuses must be below 100%. View Resources workload.
9. Open Cost & EVM, add a dated actual cost record for a task and inspect totals/warnings.
10. Open Quality Management. Try to close a defect while verification is Pending, then set verification Passed and save again.
11. Open Risk Management, add a risk, and switch to the 5x5 matrix and PDPC.
12. Open Reports. Choose report, optional date/status filters, Export CSV, or Print then Save as PDF.
13. Record closure date, issues and lessons. Final cost is captured on save.
14. Stop and restart to demonstrate saved state. MongoDB mode persists in MongoDB; optional demo persists in the local JSON file.

## Suggested screenshots

Dashboard, Project Charter, Requirements, WBS, pending change, approved change with revised budget, Gantt, Resources, EVM, invalid defect closure message, risk matrix, and report export/print preview.

## Role verification

Sign out and use developer@healthcare.local or qa@healthcare.local. They can view project data and update allowed delivery records but cannot approve changes or update project baseline. QA can maintain quality checks.

## Source map

- frontend/src/App.jsx: routed screens, reusable components and API integration.
- frontend/src/config.js: editable form fields and table columns.
- frontend/src/styles.css: reference-based responsive theme.
- backend/src/domain.js: business rules and calculations.
- backend/src/models.js: Mongoose document schemas.
- backend/src/app.js: authenticated REST API and optimistic mutations.
- backend/src/seed-data.js: fictional baseline project.
- backend/src/json-store.js: optional single-process local adapter.
- backend/tests/: business and integration cases.

## API

POST /api/login. GET /api/project?date=YYYY-MM-DD. PUT /api/project with {version,data}. GET /api/:group with q/status/page/limit. POST /api/:group and PUT /api/:group/:id with {version,data}. DELETE /api/:group/:id with {version}. POST /api/changes/:id/decision with {version,status,comments}. All except login require Authorization: Bearer token. Group names are those in the schema table.
