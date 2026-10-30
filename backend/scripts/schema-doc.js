// Generates docs/database-schema.md from the real Mongoose schemas and real seeded documents.
// Usage: MONGO_URI=<a seeded database> npm run docs:schema
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { connectDb } from "../src/db.js";
import { ALL_MODELS, ENUMS } from "../src/models.js";

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../docs/database-schema.md");
await connectDb();
const { EJSON } = mongoose.mongo.BSON;

const typeOf = (p) => {
  const inner = p.embeddedSchemaType ?? p.caster;
  if (p.instance === "Array" && p.schema) return "Array<Subdocument>";
  if (p.instance === "Array" && inner) return `Array<${inner.instance === "ObjectId" ? "ObjectId" : inner.instance}>`;
  return p.instance;
};
const refOf = (p) => (p.options?.ref || (p.embeddedSchemaType ?? p.caster)?.options?.ref || "");
function describe(p) {
  const o = p.options || {};
  const notes = [];
  if (o.required) notes.push("required");
  if (o.unique) notes.push("unique");
  if (o.immutable) notes.push(typeof o.immutable === "function" ? "read-only once decided" : "immutable");
  if (p.enumValues?.length) notes.push("enum: " + p.enumValues.join(" / "));
  if (o.min !== undefined) notes.push("min " + (Array.isArray(o.min) ? o.min[0] : o.min));
  if (o.max !== undefined) notes.push("max " + (Array.isArray(o.max) ? o.max[0] : o.max));
  if (o.maxlength) notes.push("max length " + o.maxlength);
  if (o.lowercase) notes.push("lowercase");
  if (o.default !== undefined && typeof o.default !== "function") notes.push("default " + JSON.stringify(o.default));
  if (o.default === Date.now) notes.push("default now");
  if (p.validators?.some((v) => v.message === "{PATH} must be a whole number.")) notes.push("whole number");
  return notes.join("; ");
}
const rows = (schema, prefix = "") =>
  Object.entries(schema.paths).flatMap(([name, p]) => {
    if (["__v", "createdAt", "updatedAt"].includes(name)) return [];
    const line = `| \`${prefix}${name}\` | ${typeOf(p)} | ${refOf(p) ? "→ " + refOf(p) : ""} | ${describe(p)} |`;
    return p.schema ? [line, ...rows(p.schema, `${prefix}${name}[].`)] : [line];
  });

const sections = [];
const relationships = [];
for (const [name, Model] of Object.entries(ALL_MODELS)) {
  const schema = Model.schema, coll = Model.collection.name;
  for (const [pathName, p] of Object.entries(schema.paths)) {
    const ref = refOf(p);
    if (ref && pathName !== "projectId")
      relationships.push(`| ${coll}.${pathName} | ${ref} | ${typeOf(p).startsWith("Array") ? "many" : "one"} | ${p.options?.required ? "required" : "optional"} |`);
  }
  const indexes = [...new Set([
    ...Object.entries(schema.paths).filter(([, p]) => p.options?.unique && p.path !== "_id").map(([n]) => `{${n}:1} unique`),
    ...schema.indexes().map(([k, o]) => `${JSON.stringify(k).replace(/"/g, "")}${o?.unique ? " unique" : ""}${o?.partialFilterExpression ? " (partial: non-empty email)" : ""}`),
  ])];
  const sample = await Model.collection.findOne({}, { sort: { _id: 1 } });
  if (sample?.password) sample.password = "<bcrypt hash>";
  const json = sample ? EJSON.stringify(sample, null, 2, { relaxed: true }) : "(no documents)";
  sections.push(`### ${coll}  (Mongoose model \`${name}\`)

| Field | Type | Reference | Rules |
|---|---|---|---|
| \`_id\` | ObjectId | | primary key |
${rows(schema).filter((r) => !r.startsWith("| `_id`")).join("\n")}
| \`createdAt\`, \`updatedAt\` | Date | | automatic timestamps |

**Indexes:** ${indexes.map((i) => "`" + i + "`").join(", ") || "_id only"}

**Sample document**
\`\`\`json
${json}
\`\`\`
`);
}

const doc = `# MongoDB Atlas database schema

Persistent storage for the Smart Healthcare Project Management System. Everything in this
file after the introduction is generated from the real Mongoose schemas and a real seeded
database by \`npm run docs:schema\`; all names, hospitals, people and amounts are fictional.

## 1. Connecting to MongoDB Atlas (\`MONGO_URI\`)

1. Atlas → **Database Access** → create a database user and note the password.
2. Atlas → **Network Access** → **Add IP Address** → your IP (or \`0.0.0.0/0\` for a demo).
3. Atlas → **Clusters → Connect → Drivers** → copy the connection string.
4. Create \`backend/.env\` (copy \`.env.example\`, or run \`npm run setup\` and paste the string):

\`\`\`
MONGO_URI=mongodb+srv://<db_user>:<db_password>@<cluster-host>.mongodb.net/smart_healthcare?retryWrites=true&w=majority&appName=Cluster0
JWT_SECRET=<random string, 32+ characters>
SEED_PASSWORD=<demo login password, 10+ characters>
\`\`\`

Replace \`<db_password>\` with the real password **without** the \`<\` \`>\` brackets. If the password
contains characters such as \`@ : / ? #\`, URL-encode them. \`backend/.env\` is git-ignored; only
\`.env.example\` (placeholders) is committed. Never put a real password in code, docs or screenshots.
The older variable name \`MONGODB_URI\` is still read when \`MONGO_URI\` is absent.

\`\`\`
npm install
npm run db:check    # connection test + document count per collection
npm run seed        # safe, idempotent: creates the demo project once, never overwrites
npm run dev         # API :4000, UI :5173
\`\`\`

If the SRV DNS lookup is blocked by a network, the server retries with Google DNS automatically.

## 2. Design rules

* **One collection per entity** (15 collections + \`users\`). Every project-related document has
  \`projectId\` (ObjectId → \`projects\`) and a human-readable \`code\` (e.g. \`T-03\`, \`REQ-006\`).
  \`{projectId, code}\` is unique, so codes cannot repeat inside a project.
* **Relationships use ObjectId references** (\`ref\`), never copied names. Section 4 lists all of them.
  Model-level checks reject a reference to a record that does not exist in the *same* project and
  self-references (a task cannot precede itself, a WBS item cannot be its own parent).
* **Hierarchy:** \`requirements.parentId\` and \`wbsItems.parentId\` point at the same collection.
  Both also carry \`changeRequestId\`, linking scope that exists only because of a change request.
* **Tasks:** \`predecessorIds\` (array of task ObjectIds, finish-to-start) and \`assigneeIds\`
  (array of team-member ObjectIds). The API adds cycle and date-order checks.
* **Validation:** \`strict: "throw"\` (unknown fields are rejected), required fields, enums, numeric
  ranges, whole-number weeks, risk likelihood/impact 1–5, task end ≥ start, completed ⇔ 100 %,
  a defect cannot be Closed without verification \`Passed\`, email format, \`timestamps: true\`.
* **Baselines are separate.** \`projects.originalBaseline\` (PKR 5,000,000, 16 weeks) is declared
  \`immutable\`; Mongoose ignores/rejects any later write. \`projects.currentBaseline\` starts equal to
  it and changes only when a change request is approved.
* **Approval is atomic and applied once** (\`store.decideChange\`):
  1. \`changeRequests.findOneAndUpdate({code, status: "Pending"}, {status: "Approved", decision…})\` —
     only one caller can win; every other caller (double-click, retry, parallel request) matches nothing
     and receives HTTP 409.
  2. The winner promotes linked requirements/WBS items to Approved.
  3. \`projects.updateOne({appliedChangeIds: {$ne: changeId}}, {$inc: {currentBaseline.budget, currentBaseline.weeks}, $push: {appliedChangeIds: changeId}})\`
     — the \`$ne\` guard makes this step idempotent, so even a retry cannot add the cost or weeks twice.
  4. An audit-log entry is appended.
  On Atlas (a replica set) steps 1–4 run in one multi-document **transaction**. On a standalone server
  the same guards apply, and \`reconcileBaseline()\` (run at start-up and by \`npm run seed\`) finishes any
  approved-but-unapplied request exactly once. \`baselineIntegrity()\` checks stored baseline =
  original + approved changes.
* **Decided change requests are immutable** (cost/weeks cannot be edited, including by query updates).
  \`auditLogs\` is append-only (updates and deletes throw). Task baselines (\`baseline.*\`) are written once.
* **Concurrency:** \`projects.revision\` is a version counter. API writes carry the version they read;
  a stale write returns HTTP 409 and nothing is written.

## 3. Entity relationships

\`\`\`mermaid
erDiagram
  projects ||--o{ teamMembers : projectId
  projects ||--o{ stakeholders : projectId
  projects ||--o{ requirements : projectId
  projects ||--o{ wbsItems : projectId
  projects ||--o{ changeRequests : projectId
  projects ||--o{ tasks : projectId
  projects ||--o{ milestones : projectId
  projects ||--o{ costRecords : projectId
  projects ||--o{ defects : projectId
  projects ||--o{ qualityChecks : projectId
  projects ||--o{ risks : projectId
  projects ||--o{ pdpcActions : projectId
  projects ||--o{ auditLogs : projectId
  projects ||--o| projectClosures : projectId
  requirements ||--o{ requirements : parentId
  wbsItems ||--o{ wbsItems : parentId
  changeRequests ||--o{ requirements : changeRequestId
  changeRequests ||--o{ wbsItems : changeRequestId
  changeRequests ||--o{ tasks : changeRequestId
  wbsItems ||--o{ tasks : wbsItemId
  tasks }o--o{ tasks : predecessorIds
  tasks }o--o{ teamMembers : assigneeIds
  tasks ||--o{ costRecords : taskId
  tasks ||--o{ defects : taskId
  tasks }o--o{ milestones : taskIds
  teamMembers ||--o{ defects : ownerId
  teamMembers ||--o{ risks : ownerId
  risks ||--o{ pdpcActions : riskId
\`\`\`

## 4. Reference list (every ObjectId relationship)

| From (collection.field) | To | Cardinality | |
|---|---|---|---|
| every project-scoped collection.projectId | projects | many → one | required |
${relationships.join("\n")}

## 5. Collections, fields and sample documents

${sections.join("\n")}

## 6. Allowed values

\`\`\`json
${JSON.stringify(ENUMS, null, 2)}
\`\`\`

## 7. Testing

\`npm run test:db\` runs 34 tests against a real MongoDB (an in-memory replica set, or the server named
in \`TEST_MONGO_URI\`): collection names, sample data counts, \`projectId\` on every record, baseline
immutability, single and ten-way concurrent approval, rejection, crash recovery, unique constraints,
validation, cross-project reference rejection, append-only audit log, indexes, idempotent seed,
persistence across reconnect, and migration from the old embedded-document layout.

## 8. Limits

Project-scoped collections support several projects in the database, but the web application is
still written for one project at a time. Atlas M0 (free) allows 512 MB, enough for this dataset.
Healthcare data in this repository is fictional; real patient data would need a compliance review.
`;
fs.writeFileSync(out, doc);
console.log("Wrote " + out);
await mongoose.disconnect();
