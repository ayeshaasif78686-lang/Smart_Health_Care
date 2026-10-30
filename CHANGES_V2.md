# Version 2 improvements (against the Mid-term question paper)

| # | Paper requirement | What was added | Where |
|---|---|---|---|
| 1 | Module 4 – warnings for cost overrun / schedule deviation | BAC, EAC (=BAC/CPI), ETC, VAC cards on Cost & EVM; "Forecast overrun" warning when EAC > approved budget (existing CPI/SPI and budget-exceeded warnings kept) | `domain.js` `evmValues`, `App.jsx` |
| 2 | Mandatory #4 – approved change must visibly affect scope, schedule, budget | "Change Impact" panel (original vs current baseline, projected baseline for pending requests, linked requirements/WBS/tasks, unscheduled approved budget) and a **Generate tasks** button that creates dependent, costed tasks for the approved WBS work packages | `domain.js` `changeImpact`, `tasksForChange`; `POST /api/changes/:id/generate-tasks` |
| 3 | Module 5 – checklist for deliverables + inspection/testing results | Quality checks link to a WBS deliverable and have test type, expected result, actual result; Passed/Failed needs reviewer, date and actual result | `models.js`, `store.js`, `config.js`, `app.js` |
| 4 | Module 6 – consistency between requirements, tasks, quality | Defects link to a task and a requirement (validated references) | `domain.js` `validate`, `models.js`, `store.js` |

New tests: `backend/tests/features.test.js` (TC17–TC22). Run `npm run test:local`.
Existing databases keep working: the new fields are optional. Seed data (links) only applies to a new database.
