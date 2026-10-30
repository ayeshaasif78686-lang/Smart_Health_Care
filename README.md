> Updated build: use `START_FIXED.bat` for the included compiled app on port 4000. Read `FIXES_AND_TESTS.md` for fixes and actual verification limits.

# Smart Healthcare Project Management System

React + Vite frontend, Express backend, Mongoose/MongoDB persistence, and an optional JSON file demo adapter. The navy sidebar, white cards, blue accents, Gantt, EVM chart, tables and module layouts follow the supplied reference images. It is a close implementation, not a certified pixel-perfect reproduction. Values are calculated from saved records and intentionally differ from contradictory figures in the images.

## Fastest way to run on Windows

1. Install Node.js LTS (22 or newer).
2. Extract the ZIP fully. Do not run inside the ZIP window.
3. Open `smart-healthcare-pms` and double-click `START_DEMO.bat`.
4. The first run installs packages, creates `backend/.env`, prints a generated password, builds the interface and starts the app.
5. Open `http://localhost:4000` in your browser.
6. Email: `manager@healthcare.local`. Password: the generated `SEED_PASSWORD` shown during setup, also available in your own `backend/.env`.

The optional demo saves changes in `backend/data/demo-project.json` and does not require MongoDB. Keep that file if you want to preserve demo changes. Demo mode is for one local process, not shared public hosting. It is not the MongoDB implementation.

Equivalent terminal commands, run inside the extracted project:

```sh
npm install
npm run setup
npm run demo
```

For later demo launches, `npm run demo` is enough. Keep the terminal open. Ctrl+C stops the app. Demo accounts `developer@healthcare.local` and `qa@healthcare.local` use the same locally configured seed password.

## Required MongoDB version of the project

1. Install and start MongoDB Community Server, or create a MongoDB Atlas database.
2. Run `npm install` and `npm run setup` once.
3. In `backend/.env`, set `MONGO_URI` (run `npm run setup` to create the file). A local server uses `mongodb://127.0.0.1:27017/smart_healthcare`. Atlas uses your private connection string. `.env` is git-ignored; never commit real credentials.
4. Run `npm run seed`. It creates fictional demo data and three users only when they do not already exist. Repeated runs preserve existing project data and passwords.
5. Run `npm run dev`.
6. Open `http://localhost:5173`. API is on port 4000.

Alternatively, double-click `START_MONGODB.bat` after starting MongoDB and configuring the environment.

Production-style local serving:

```sh
npm run build
npm start
```

Then open `http://localhost:4000`. The backend serves the built React application and API together.

## Tests

```sh
npm run test:unit -w backend
npm test
npm test -w frontend
```

`npm run test:unit` runs business-rule tests and HTTP tests on the local JSON adapter. `npm test` also runs 34 database tests (`tests/db.test.js`, `tests/api.test.js`) against a real MongoDB: set `TEST_MONGO_URI` to a test server, otherwise a temporary in-memory replica set is started (the test helper may download a MongoDB binary on first run). Never point `TEST_MONGO_URI` at data you want to keep: the tests drop their own `healthcare_*_test` databases.

Actual verification in this delivery: frontend production build passed; 23 business-rule/local-adapter tests and 3 frontend form tests passed. Seven MongoDB integration cases could not run because this environment refused the MongoDB process with `open: Operation not permitted`. They are included as executable tests and are not marked passed. See `docs/test-cases.md`, `docs/local-tests.txt`, `docs/test-output.txt`, and `docs/build-output.txt`.

## Included functionality

- Dashboard totals, EVM time series, health, milestones, delayed tasks and activities.
- Editable charter, management plan, stakeholders, original/current baseline display and closure record.
- Requirements, nested WBS, approved vs proposed scope, CRUD and filtering.
- Pending AI/mobile request: PKR 800,000 and three weeks. Approval changes the baseline from PKR 5,000,000/16 weeks to PKR 5,800,000/19 weeks once, promotes linked scope and records reviewer/history. Rejection leaves budget and duration unchanged.
- Tasks, dependencies, calendar-day Gantt, dates, progress history, owners, effort and derived delay forecasts.
- Resource allocation and milestones.
- Costs, dated PV/EV/AC, CPI/SPI, CV/SV, zero-denominator handling and configurable warnings.
- Defects and quality checklist. Closure requires successful verification.
- Risk register, risk priority categories, 5x5 matrix and PDPC actions.
- Filtered reports, CSV download and browser print/save as PDF.
- Password login, role checks, optimistic concurrency protection and audit entries.

## Important implementation choices and limits

- One project per installation. MongoDB stores the data in 15 normalized collections (plus `users`) linked by ObjectId references and `projectId`; the original approved baseline (PKR 5,000,000, 16 weeks) is stored separately and immutably from the current approved baseline, which changes only through an atomic, once-only change-request approval. See `docs/database-schema.md`.
- This is an academic project management application, not a patient records system or an AI diagnosis engine. All sample names and records are fictional.
- Original task baseline dates/cost stay fixed after task creation. Working dates can change subject to dependency validation. Creating new baseline tasks is restricted to Project Manager. A full historical baseline version editor is not included.
- Calendar days include weekends. A successor starts after, not on, the predecessor's last day. Schedule forecast recalculates automatically; invalid date edits are rejected rather than silently moving saved successor dates. Dependency IDs are available on hover; arrow connectors/drag-and-drop scheduling are not implemented.
- EV uses dated progress history. An update is recorded on the date it is entered. Progress backdating is not available in this version.
- Planned task costs should be allocated by the manager. An approved change increases available project budget but does not invent detailed task allocations. Add approved-feature tasks and costs after approval.
- Closing a project records final cost and notes. Formal hospital acceptance signatures, email notifications, password recovery and multi-project switching are not included.
- The local JSON adapter is single-process only. Use the MongoDB server for the required database demonstration. MongoDB behavior still needs verification on your machine.
- Reference avatars and hospital artwork are approximated with initials and an original SVG illustration. Screenshots use the actual React interface with fictional fixture data; screenshot QA does not verify MongoDB.

## Troubleshooting

- `node` or `npm` not recognized: install Node.js, close and reopen the terminal.
- `Cannot connect`: keep the terminal running. MongoDB mode needs both API and database.
- `ECONNREFUSED 127.0.0.1:27017`: start the MongoDB service or correct your URI.
- `Please sign in again`: login again after restarting with a different secret.
- `Data changed`: another save happened first; refresh and retry.
- Form save rejected: read the displayed validation message. For a completed task use 100% progress. A successor cannot begin before its predecessor is finished.
- Backend port changed: update the Vite API proxy in `frontend/vite.config.js` too.
- Forgot the local demo password: read your own `backend/.env`. Changing SEED_PASSWORD changes demo login, but does not replace already seeded MongoDB user passwords.

## Suggested demo

Read `docs/user-guide.md` for the short demonstration sequence and `PEHLE_YEH_PARHO.txt` for Roman Urdu setup steps.

## MongoDB Atlas quick start

1. Atlas: create a database user, then Network Access -> add your IP (or 0.0.0.0/0 for a demo).
2. `npm install`, then `npm run setup` and paste your Atlas string as `MONGO_URI` (or copy `.env.example` to `backend/.env` and edit it). Replace `<db_password>` with the real password without the angle brackets.
3. Run:

```sh
npm run db:check   # verifies the connection and lists the collections
npm run seed       # creates the demo project once (safe to re-run; migrates the old embedded layout if found)
npm run dev        # API on :4000, UI on http://localhost:5173
```

Windows shortcut: `START_ATLAS.bat`. `backend/.env` is git-ignored; rotate the Atlas password if it has ever been shared. Regenerate the schema document with `npm run docs:schema`.
