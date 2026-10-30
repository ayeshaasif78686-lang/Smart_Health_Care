# Executed test report

Date: 24 October 2026. Production frontend build: PASS. Business-rule and local JSON HTTP integration: 23 PASS, 0 FAIL. Frontend form tests: 3 PASS, 0 FAIL.

MongoDB integration: 7 cases attempted but BLOCKED by environment setup failure (`open: Operation not permitted`, MongoDB exit 100). The raw Node runner reports these as failures of the suite before test bodies ran. They are not counted as passing. Run `npm test` on a machine where MongoDB binaries can execute.

| ID | Scenario and steps | Expected | Actual | Result |
|---|---|---|---|---|
| TC01 | Create seeded project; GET project | Project and summaries returned | Local adapter HTTP 200, correct name/totals; MongoDB setup blocked | Local PASS; MongoDB unverified |
| TC02 | Set original budget to -1; validate | Rejected | Non-negative validation error | PASS |
| TC03 | Promote linked pending requirement manually | Rejected | Approved-scope validation error | PASS |
| TC04 | Approve CR-001 | Budget 5,800,000; 19 weeks; approved linked scope | All asserted values matched | PASS |
| TC05 | Approve same request twice | Second decision rejected; no extra impact | Second decision error; budget unchanged | PASS |
| TC06 | Reject pending CR-001 | Original budget/duration preserved | 5,000,000 / 16 weeks retained | PASS |
| TC07 | Start T-02 before predecessor finishes | Rejected | Dependency validation error | PASS |
| TC08 | Add circular T-01/T-02 dependencies | Rejected | Circular dependency error | PASS |
| TC09 | PV 2,000,000; EV 1,500,000; AC 1,800,000 | CPI 0.83, SPI 0.75, CV -300,000, SV -500,000; warnings | All values and warnings matched; zero denominators return null | PASS |
| TC10 | Negative cost; nonexistent task reference | Rejected | Validation errors and HTTP 400 | PASS |
| TC11 | Summarize seeded defects | Two unresolved critical defects | Two returned | PASS |
| TC12 | Close defect with Pending verification, then Passed | Reject first, accept second | Both behaviors matched | PASS |
| TC13 | Compute 3×5; try likelihood 6 | Score 15; invalid range rejected | Both assertions matched | PASS |
| TC14 | Save project; recreate local repository and API; retrieve | Saved name remains | Persisted name returned from disk | PASS on real MongoDB (disconnect and reconnect) |
| TC15 | Developer submits approval request | HTTP 403; original budget retained | Both matched with local HTTP adapter | Local PASS; MongoDB unverified |
| TC16 | Compare summary to underlying records | Matching totals | AC/baseline assertions matched | PASS |

## Additional executed cases

- Historical EV excludes progress recorded after the chosen date.
- Overdue tasks affect downstream forecast and deadline warnings.
- Missing team references, invalid calendar dates and WBS cycles are rejected.
- Two concurrent local approval HTTP requests produce one success and one conflict; one audit decision only.
- Invalid cost API writes and deletion of referenced tasks are blocked.
- Missing token and incorrect login password are rejected; valid login succeeds.
- Risk create/update/delete persists and stale version writes fail with HTTP 409.
- Frontend task form converts numeric cost and comma-separated predecessor IDs into the correct API payload.
- Frontend required title validation prevents submission.
- Frontend edit form loads existing defect values and displays server errors; Cancel works.

## Browser visual verification

Rendered the actual React components in an isolated visual harness using the fictional seed project and a mock API transport. Checked dashboard rendering and module navigation. Captures in `docs/screenshots` are UI verification evidence only, not MongoDB or live API evidence. The harness is removed from the deliverable build. API behavior is covered by the local HTTP tests above.

## Still to verify on the user's computer

- MongoDB integration suite and real MongoDB process restart.
- Full manual end-to-end walkthrough using MongoDB.
- Tablet/mobile device interaction and print/CSV behavior across browsers.

Raw evidence: `local-tests.txt`, `frontend-tests.txt`, `build-output.txt`, `test-output.txt`.


## MongoDB Atlas schema tests (executed against a real MongoDB 8 server)

Run with `npm run test:db`. Evidence: `db-test-output.txt` (57 tests passed on a replica set, the same topology as Atlas; 34 database tests also passed on a standalone server without transactions).

| ID | Check | Result |
|---|---|---|
| DB01 | All 15 collections exist with the specified names | PASS |
| DB02 | 5 hospitals, 7 team members, requirements, tasks, costs, defects, quality checks, risks, milestones and the pending AI/mobile change request are seeded | PASS |
| DB03 | Every project-related record carries the project's `projectId` | PASS |
| DB04-05 | Original baseline PKR 5,000,000 / 16 weeks stored separately; save and query updates cannot change it | PASS |
| DB06-08 | Approval updates only the current baseline (PKR 5,800,000 / 19 weeks) once; duplicate and ten concurrent approvals produce one winner | PASS |
| DB09-10 | Rejection keeps baseline; comments and valid decision required | PASS |
| DB11 | Interrupted approval is finished exactly once by `reconcileBaseline` | PASS |
| DB12 | Decided change requests cannot be edited | PASS |
| DB13-15 | Predecessors, several assignees, hierarchy, change-request links and cost-to-task references resolve | PASS |
| DB16 | Unique constraints (project code, email, project name, one closure per project) | PASS |
| DB17 | Validation of ranges, enums, dates, whole numbers, unknown fields | PASS |
| DB18 | References to missing, self or other-project records rejected | PASS |
| DB19 | Audit log is append-only | PASS |
| DB20 | Timestamps and indexes present | PASS |
| DB21 | Seed is idempotent | PASS |
| DB22-23 | API edits persist to the correct collections, survive reconnect; task baselines written once | PASS |
| DB24 | Old embedded project migrated, original kept as `projects_legacy_backup` | PASS |

Not verified here: a live connection to your own Atlas cluster (the test environment has no route to Atlas). Run `npm run db:check` then `npm test` with `TEST_MONGO_URI` pointing at a test database to repeat on Atlas.
