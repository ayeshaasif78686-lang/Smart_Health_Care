import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {
  ALL_MODELS, Project, TeamMember, Stakeholder, Requirement, WbsItem, ChangeRequest, Task,
  Milestone, CostRecord, Defect, QualityCheck, Risk, PdpcAction, AuditLog, ProjectClosure, User,
} from "../src/models.js";
import { createStore, supportsTransactions } from "../src/store.js";
import { ensureSeed, migrateLegacy } from "../src/seeding.js";
import { seedData } from "../src/seed-data.js";
import { startDb, connect, freshDatabase } from "./helpers.js";

let db, store, project;
before(async () => {
  db = await startDb("healthcare_schema_test");
  await connect(db);
});
after(async () => {
  await mongoose.disconnect();
  await db?.stop();
});
beforeEach(async () => {
  await freshDatabase();
  store = createStore({ User });
  assert.equal(await ensureSeed(store), true);
  project = await Project.findOne();
});
const code = (Model, c) => Model.findOne({ projectId: project._id, code: c });

test("DB01 all 15 required collections exist with the specified names", async () => {
  const names = (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name);
  for (const n of [
    "projects", "stakeholders", "teamMembers", "requirements", "wbsItems", "changeRequests", "tasks",
    "milestones", "costRecords", "defects", "qualityChecks", "risks", "pdpcActions", "auditLogs", "projectClosures",
  ])
    assert.ok(names.includes(n), `missing collection ${n}`);
});

test("DB02 sample data: 5 hospitals, 7 team members, and every module populated", async () => {
  assert.equal(project.hospitals.length, 5);
  assert.equal(await TeamMember.countDocuments(), 7);
  assert.equal(await Requirement.countDocuments(), 7);
  assert.equal(await Task.countDocuments(), 7);
  assert.equal(await CostRecord.countDocuments(), 5);
  assert.equal(await Defect.countDocuments(), 3);
  assert.equal(await QualityCheck.countDocuments(), 9);
  assert.equal(await Risk.countDocuments(), 7);
  assert.equal(await Milestone.countDocuments(), 5);
  assert.equal(await WbsItem.countDocuments(), 9);
  assert.equal(await PdpcAction.countDocuments(), 1);
  assert.equal(await Stakeholder.countDocuments(), 7);
  assert.ok((await AuditLog.countDocuments()) >= 1);
  const pending = await ChangeRequest.find();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].status, "Pending");
  assert.equal(pending[0].costImpact, 800000);
  assert.equal(pending[0].scheduleImpactWeeks, 3);
});

test("DB03 every project-related record references its project via projectId", async () => {
  for (const [name, Model] of Object.entries(ALL_MODELS)) {
    if (["Project", "User"].includes(name)) continue;
    const total = await Model.countDocuments();
    const owned = await Model.countDocuments({ projectId: project._id });
    assert.equal(owned, total, `${name} has records without the project's projectId`);
  }
});

test("DB04 original baseline is stored separately and equals PKR 5,000,000 / 16 weeks", async () => {
  assert.equal(project.originalBaseline.budget, 5000000);
  assert.equal(project.originalBaseline.weeks, 16);
  assert.equal(project.currentBaseline.budget, 5000000);
  assert.equal(project.currentBaseline.weeks, 16);
  assert.deepEqual((await store.baselineIntegrity()).ok, true);
});

test("DB05 original baseline cannot be changed by save or update", async () => {
  const doc = await Project.findById(project._id);
  doc.originalBaseline.budget = 1;
  doc.originalBaseline.weeks = 1;
  await doc.save().catch(() => {});
  await Project.updateOne({ _id: project._id }, { $set: { "originalBaseline.budget": 1 } }).catch(() => {});
  await Project.findOneAndUpdate({ _id: project._id }, { $set: { "originalBaseline.weeks": 1 } }).catch(() => {});
  const after = await Project.findById(project._id).lean();
  assert.equal(after.originalBaseline.budget, 5000000);
  assert.equal(after.originalBaseline.weeks, 16);
});

test("DB06 approving a change updates only the current baseline, exactly once", async () => {
  const agg = await store.decideChange({ id: "CR-001", status: "Approved", actor: "Ayesha Khan", comments: "Approved" });
  assert.equal(agg.changes[0].status, "Approved");
  const p = await Project.findById(project._id).lean();
  assert.equal(p.currentBaseline.budget, 5800000);
  assert.equal(p.currentBaseline.weeks, 19);
  assert.equal(p.originalBaseline.budget, 5000000);
  assert.equal(p.originalBaseline.weeks, 16);
  assert.equal(p.appliedChangeIds.length, 1);
  const cr = await ChangeRequest.findOne({ code: "CR-001" });
  assert.equal(cr.appliedToBaseline, true);
  assert.equal(cr.decision.by, "Ayesha Khan");
  const linked = await Requirement.find({ changeRequestId: cr._id });
  assert.ok(linked.length === 2 && linked.every((r) => r.status === "Approved"));
});

test("DB07 duplicate approval is rejected and never applies the change twice", async () => {
  const decide = () => store.decideChange({ id: "CR-001", status: "Approved", actor: "A", comments: "ok" });
  await decide();
  await assert.rejects(decide, /already been decided/);
  await assert.rejects(() => store.decideChange({ id: "CR-001", status: "Rejected", actor: "A", comments: "late" }), /already/);
  const p = await Project.findById(project._id).lean();
  assert.equal(p.currentBaseline.budget, 5800000);
  assert.equal(p.currentBaseline.weeks, 19);
  assert.equal(await AuditLog.countDocuments({ action: "Approved change CR-001" }), 1);
});

test("DB08 ten simultaneous approvals produce exactly one winner and one baseline update", async () => {
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () => store.decideChange({ id: "CR-001", status: "Approved", actor: "A", comments: "ok" })),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const p = await Project.findById(project._id).lean();
  assert.equal(p.currentBaseline.budget, 5800000);
  assert.equal(p.currentBaseline.weeks, 19);
  assert.equal(p.appliedChangeIds.length, 1);
  assert.equal((await store.baselineIntegrity()).ok, true);
});

test("DB09 rejection leaves the baseline unchanged and rejects linked scope", async () => {
  await store.decideChange({ id: "CR-001", status: "Rejected", actor: "A", comments: "No budget" });
  const p = await Project.findById(project._id).lean();
  assert.equal(p.currentBaseline.budget, 5000000);
  assert.equal(p.currentBaseline.weeks, 16);
  assert.equal(p.appliedChangeIds.length, 0);
  assert.ok((await Requirement.find({ changeRequestId: { $ne: null } })).every((r) => r.status === "Rejected"));
});

test("DB10 approval requires comments and a valid decision", async () => {
  await assert.rejects(() => store.decideChange({ id: "CR-001", status: "Approved", actor: "A", comments: " " }), /comments/);
  await assert.rejects(() => store.decideChange({ id: "CR-001", status: "Maybe", actor: "A", comments: "x" }), /Invalid decision/);
  await assert.rejects(() => store.decideChange({ id: "CR-404", status: "Approved", actor: "A", comments: "x" }), /not found/);
  assert.equal((await Project.findById(project._id).lean()).currentBaseline.budget, 5000000);
});

test("DB11 reconcile repairs an approved change whose baseline step was interrupted, once", async () => {
  // Simulate a crash on a server without transactions: status written, baseline not yet applied.
  await ChangeRequest.updateOne({ code: "CR-001" }, { $set: { status: "Approved", "decision.by": "A", "decision.at": new Date(), "decision.comments": "ok" } });
  assert.equal((await store.baselineIntegrity()).ok, false);
  assert.equal(await store.reconcileBaseline(), 1);
  assert.equal(await store.reconcileBaseline(), 0);
  const p = await Project.findById(project._id).lean();
  assert.equal(p.currentBaseline.budget, 5800000);
  assert.equal((await store.baselineIntegrity()).ok, true);
});

test("DB12 decided change requests are immutable", async () => {
  await store.decideChange({ id: "CR-001", status: "Approved", actor: "A", comments: "ok" });
  const cr = await ChangeRequest.findOne({ code: "CR-001" });
  cr.costImpact = 1;
  await cr.save().catch(() => {});
  await ChangeRequest.updateOne({ code: "CR-001" }, { $set: { costImpact: 2 } }).catch(() => {});
  assert.equal((await ChangeRequest.findOne({ code: "CR-001" })).costImpact, 800000);
});

test("DB13 tasks support predecessor dependencies and several assigned team members", async () => {
  const t06 = await code(Task, "T-06");
  const preds = await Task.find({ _id: { $in: t06.predecessorIds } });
  assert.deepEqual(preds.map((t) => t.code).sort(), ["T-03", "T-04", "T-05"]);
  const t03 = await code(Task, "T-03");
  const extra = await code(TeamMember, "FE-02");
  t03.assigneeIds.push(extra._id);
  await t03.save();
  const reloaded = await Task.findById(t03._id).populate("assigneeIds");
  assert.deepEqual(reloaded.assigneeIds.map((m) => m.code).sort(), ["BE-02", "FE-02"]);
  assert.equal((await Task.find({ projectId: project._id, assigneeIds: extra._id })).length, 2); // T-03 and T-07
});

test("DB14 requirements and WBS support hierarchy and change-request links", async () => {
  const wbs = await code(WbsItem, "3.1");
  const parent = await WbsItem.findById(wbs.parentId);
  assert.equal(parent.code, "3");
  const cr = await code(ChangeRequest, "CR-001");
  assert.equal(String(wbs.changeRequestId), String(cr._id));
  assert.equal((await Requirement.find({ changeRequestId: cr._id })).length, 2);
  const children = await WbsItem.find({ parentId: parent._id });
  assert.deepEqual(children.map((c) => c.code).sort(), ["3.1", "3.2"]);
  const parentReq = await code(Requirement, "REQ-001");
  const child = await Requirement.create({ projectId: project._id, code: "REQ-001.1", title: "Child", parentId: parentReq._id });
  assert.equal(String(child.parentId), String(parentReq._id));
});

test("DB15 cost records reference tasks and totals match", async () => {
  const total = await CostRecord.aggregate([{ $match: { projectId: project._id } }, { $group: { _id: null, sum: { $sum: "$amount" } } }]);
  assert.equal(total[0].sum, 3200000);
  const c = await code(CostRecord, "C-03");
  assert.equal((await Task.findById(c.taskId)).code, "T-03");
});

test("DB16 unique constraints: duplicate code per project, duplicate email, duplicate project name", async () => {
  await assert.rejects(() => TeamMember.create({ projectId: project._id, code: "PM-01", name: "Duplicate" }), /E11000|duplicate/i);
  await assert.rejects(() => User.create({ email: "a@x.pk", password: "x", role: "QA" }).then(() => User.create({ email: "a@x.pk", password: "x", role: "QA" })), /E11000|duplicate/i);
  await assert.rejects(() => TeamMember.create({ projectId: project._id, code: "X1", name: "A", email: "same@x.pk" }).then(() => TeamMember.create({ projectId: project._id, code: "X2", name: "B", email: "same@x.pk" })), /E11000|duplicate/i);
  await assert.rejects(() => Project.create({ name: project.name, startDate: new Date(), originalBaseline: { budget: 1, weeks: 1 }, currentBaseline: { budget: 1, weeks: 1 } }), /E11000|duplicate/i);
  await ProjectClosure.create({ projectId: project._id, date: new Date(), finalCost: 1 });
  await assert.rejects(() => ProjectClosure.create({ projectId: project._id, date: new Date(), finalCost: 2 }), /E11000|duplicate/i);
});

test("DB17 schema validation rejects bad values", async () => {
  const base = { projectId: project._id };
  await assert.rejects(() => Risk.create({ ...base, code: "R-X", title: "x", likelihood: 6, impact: 3 }), /likelihood/);
  await assert.rejects(() => Risk.create({ ...base, code: "R-X", title: "x", likelihood: 2.5, impact: 3 }), /whole/);
  const t01 = await code(Task, "T-01");
  await assert.rejects(() => CostRecord.create({ ...base, code: "C-X", title: "x", amount: -1, date: new Date(), taskId: t01._id }), /amount/);
  await assert.rejects(() => Task.create({ ...base, code: "T-X", title: "x", startDate: new Date("2026-10-10"), endDate: new Date("2026-10-01"), plannedCost: 1 }), /end must be on or after/);
  await assert.rejects(() => Task.create({ ...base, code: "T-Y", title: "x", startDate: new Date("2026-10-01"), endDate: new Date("2026-10-02"), plannedCost: 1, progress: 100, status: "In Progress" }), /Completed/);
  await assert.rejects(() => Defect.create({ ...base, code: "D-X", title: "x", severity: "Severe" }), /severity/);
  await assert.rejects(() => Defect.create({ ...base, code: "D-Y", title: "x", severity: "Low", status: "Closed", verification: "Pending" }), /verification/);
  await assert.rejects(() => TeamMember.create({ ...base, code: "M-X", name: "x", email: "not-an-email" }), /email/i);
  await assert.rejects(() => Project.create({ name: "Bad", startDate: new Date(), originalBaseline: { budget: -5, weeks: 16 }, currentBaseline: { budget: 1, weeks: 16 } }), /budget/);
  await assert.rejects(() => Project.create({ name: "Bad2", startDate: new Date(), originalBaseline: { budget: 5, weeks: 1.5 }, currentBaseline: { budget: 5, weeks: 2 } }), /whole|weeks/);
  await assert.rejects(() => Requirement.create({ ...base, code: "Q", title: "x", unknownField: 1 }), /unknownField|strict/);
});

test("DB18 relationship integrity: references must exist in the same project and not point at themselves", async () => {
  const t01 = await code(Task, "T-01");
  await assert.rejects(() => Task.create({ projectId: project._id, code: "T-Z", title: "x", startDate: new Date("2026-10-01"), endDate: new Date("2026-10-02"), plannedCost: 1, predecessorIds: [new mongoose.Types.ObjectId()] }), /does not exist/);
  t01.predecessorIds = [t01._id];
  await assert.rejects(() => t01.save(), /itself|does not exist/);
  const other = await Project.create({ name: "Other project", startDate: new Date(), originalBaseline: { budget: 1, weeks: 1 }, currentBaseline: { budget: 1, weeks: 1 } });
  await assert.rejects(() => CostRecord.create({ projectId: other._id, code: "C-1", title: "x", amount: 1, date: new Date(), taskId: t01._id }), /does not exist in this project/);
});

test("DB19 audit log is append-only", async () => {
  const a = await AuditLog.findOne();
  a.action = "tampered";
  await assert.rejects(() => a.save(), /append-only/);
  await assert.rejects(() => AuditLog.updateOne({ _id: a._id }, { $set: { action: "x" } }), /append-only/);
  await assert.rejects(() => AuditLog.deleteMany({}), /append-only/);
  assert.notEqual((await AuditLog.findById(a._id)).action, "tampered");
});

test("DB20 timestamps and indexes exist", async () => {
  const t = await Task.findOne().lean();
  assert.ok(t.createdAt && t.updatedAt);
  const idx = await Task.collection.indexes();
  const names = idx.map((i) => Object.keys(i.key).join(","));
  assert.ok(names.includes("projectId,code"));
  assert.ok(idx.find((i) => Object.keys(i.key).join(",") === "projectId,code").unique);
  assert.ok(names.includes("projectId,assigneeIds"));
  assert.ok((await Project.collection.indexes()).some((i) => i.key.name === 1 && i.unique));
  assert.ok((await User.collection.indexes()).some((i) => i.key.email === 1 && i.unique));
});

test("DB21 seed is safe to re-run and never duplicates data", async () => {
  assert.equal(await ensureSeed(store), false);
  assert.equal(await ensureSeed(store), false);
  assert.equal(await Project.countDocuments(), 1);
  assert.equal(await Task.countDocuments(), 7);
  assert.equal(await TeamMember.countDocuments(), 7);
});

test("DB22 edits through the aggregate persist to the right collections and survive reconnect", async () => {
  const doc = await store.Project.findOne();
  const p = doc.toObject();
  p.tasks[2].progress = 70;
  p.tasks[2].owner = "BE-01";
  p.risks.push({ id: "R-NEW", title: "Network outage", likelihood: 2, impact: 4, status: "Open", owner: "PM-01" });
  p.closure = { date: "2026-12-30", status: "Accepted", notes: "ok", finalCost: 123 };
  p.audit.unshift({ id: "A-NEW", date: new Date().toISOString(), actor: "Test", action: "Edited" });
  doc.set(p);
  await doc.save();
  await mongoose.disconnect();
  await connect(db);
  const t = await code(Task, "T-03");
  assert.equal(t.progress, 70);
  assert.equal((await TeamMember.findById(t.assigneeIds[0])).code, "BE-01");
  assert.equal((await code(Risk, "R-NEW")).score, 8);
  assert.equal((await ProjectClosure.findOne()).finalCost, 123);
  assert.ok(await code(AuditLog, "A-NEW"));
  const fresh = (await createStore({ User }).loadAggregate());
  assert.equal(fresh.__v, 1);
  assert.equal(fresh.tasks[2].baselineCost, 1300000);
  assert.equal((await Project.findOne()).originalBaseline.budget, 5000000);
});

test("DB23 task baselines are written once and survive later edits", async () => {
  const doc = await store.Project.findOne();
  const p = doc.toObject();
  p.tasks[0].plannedCost = 1;
  p.tasks[0].baselineCost = 1;
  doc.set(p);
  await doc.save();
  assert.equal((await code(Task, "T-01")).baseline.cost, 400000);
});

test("DB24 legacy embedded project is migrated without losing data", async () => {
  await freshDatabase();
  const legacy = { ...seedData(), __v: 4 };
  legacy.changes[0].status = "Approved";
  legacy.changes[0].reviewer = "Ayesha Khan";
  legacy.changes[0].reviewDate = "2026-10-22";
  legacy.changes[0].comments = "Accepted";
  legacy.requirements.slice(5).forEach((r) => (r.status = "Approved"));
  legacy.wbs.filter((w) => w.changeId).forEach((w) => (w.status = "Approved"));
  await mongoose.connection.db.collection("projects").insertOne(legacy);
  const migrated = createStore({ User });
  const backup = await migrateLegacy(migrated);
  assert.equal(backup, "projects_legacy_backup");
  assert.equal(await mongoose.connection.db.collection(backup).countDocuments(), 1);
  const p = await Project.findOne();
  assert.equal(p.originalBaseline.budget, 5000000);
  assert.equal(p.currentBaseline.budget, 5800000);
  assert.equal(p.currentBaseline.weeks, 19);
  assert.equal(p.appliedChangeIds.length, 1);
  assert.equal(await Task.countDocuments(), 7);
  assert.equal((await migrated.baselineIntegrity()).ok, true);
  assert.equal(await migrateLegacy(migrated), null);
});

test("DB25 transaction support is detected for this server", async () => {
  assert.equal(typeof (await supportsTransactions()), "boolean");
});

test("DB26 approval preserves project and linked-record creation timestamps", async () => {
  const before = await Project.findById(project._id).lean();
  const beforeReq = await Requirement.findOne({ code: "REQ-006" }).lean();
  await store.decideChange({ id: "CR-001", status: "Approved", actor: "Manager", comments: "Timestamp regression" });
  const after = await Project.findById(project._id).lean();
  assert.equal(after.createdAt.getTime(), before.createdAt.getTime());
  if (beforeReq) assert.equal((await Requirement.findById(beforeReq._id)).createdAt.getTime(), beforeReq.createdAt.getTime());
});

test("DB27 nested-only task history edit persists", async () => {
  const doc = await store.Project.findOne();
  const p = doc.toObject();
  const t = p.tasks[0];
  t.progressHistory = [...t.progressHistory, { date: "2026-10-25", value: 100 }];
  doc.set(p);
  await doc.save();
  const fresh = await store.loadAggregate();
  assert.deepEqual(fresh.tasks[0].progressHistory.at(-1), { date: "2026-10-25", value: 100 });
});
