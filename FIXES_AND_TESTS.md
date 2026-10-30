# Updated functional build

Build ID: `healthcare-fixed-2026-10-25`.

## Changes

* Approval and generic mutations exclude Mongoose-managed `createdAt`, `updatedAt`, and `_id` from the document setter. The normalized repository preserves its original metadata and only writes explicit editable fields. A regression test exercises approval with a real hydrated Mongoose document without a database.
* Normalized approval still uses targeted transactional writes, applies PKR 800,000 and three weeks once, and updates linked requirements/WBS.
* Server startup now runs the existing backed-up legacy migration, so starting directly with `npm run dev` no longer bypasses migration. Existing normalized data is retained.
* Deep comparison now detects nested-only progress-history edits. The previous JSON replacer discarded nested keys and could silently skip saves.
* Charter schema validation runs before dependent record writes.
* Interrupted standalone approvals reconcile linked scope as well as the baseline and increment the revision.
* Tasks cannot be scheduled against proposed/rejected WBS or linked to a different change than their WBS. Task dropdowns show approved WBS/changes.
* Requirement hierarchy cycles, invalid project status, missing milestone dates, invalid emails and duplicate team emails are rejected.
* Login trims and normalizes the email. The health endpoint identifies the build and storage mode.
* A new Windows launcher uses the included production frontend and starts from the extracted folder.

## Actual validation

| Check | Expected | Actual |
|---|---|---|
| Local backend tests | All pass | 30 passed |
| Frontend form tests | All pass | 3 passed |
| Production frontend compilation | Build succeeds | Passed |
| Timestamp regression using hydrated Mongoose document | Approval succeeds; creation timestamp unchanged | Passed |
| All 12 modules create/edit/delete via API | Persisted records match submitted updates | Passed with JSON persistence adapter |
| Approval, approved task creation, defect verification, plan and closure | Consistent integrated flow | Passed with JSON persistence adapter |
| Budget after CR-001 approval | PKR 5,800,000 | Passed |
| Duration after CR-001 approval | 19 weeks | Passed |
| Duplicate approval | Rejected | Passed |
| Real MongoDB replica-set suite | Database integration passes | BLOCKED: host refused MongoDB startup, `open: Operation not permitted` |
| User's Atlas deployment | End-to-end operation | Not accessed or tested |

The originally reported exception could not be reproduced against a live database here. Timestamp round-tripping is now explicitly prevented, but passing local tests is not a claim that every Atlas operation has been verified. `npm run test:db` includes additional creation-timestamp and nested-history regression cases, runnable with the bundled temporary replica set on a supported machine. Never point the tests at a production database: the test setup clears its test database.

## Included

Complete frontend/backend source, dependency lockfile, compiled frontend, existing schema/sample data documentation, test cases, actual local/build logs, and Windows launchers. No credentials, node_modules, or user database are included. Use `START_FIXED.bat` and the short Roman Urdu instructions in `PEHLE_YEH_PARHO.txt`.
