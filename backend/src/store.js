// Repository: exposes the normalized collections through the aggregate shape used by
// the API/domain layer, and applies changes back as per-collection writes.
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  Project, TeamMember, Stakeholder, Requirement, WbsItem, ChangeRequest, Task,
  Milestone, CostRecord, Defect, QualityCheck, Risk, PdpcAction, AuditLog,
  ProjectClosure, relationChecks,
} from "./models.js";
import { baseline, fail } from "./domain.js";

const { Types } = mongoose;
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : undefined);
const day = (s) => (s ? new Date(s + "T00:00:00.000Z") : undefined);
const empty = (v) => v === undefined || v === null || v === "";

// legacy group -> collection mapping. scalars: legacy->db, dates: legacy->db,
// refs: legacy->[dbField, targetGroup], refArrays: same for arrays.
const OWNER = ["ownerId", "team"];
export const SPEC = {
  team: { Model: TeamMember, scalars: { title: "name", role: "role", email: "email", status: "status" } },
  stakeholders: {
    Model: Stakeholder,
    scalars: { title: "name", role: "role", email: "email", description: "description", organization: "organization" },
  },
  requirements: {
    Model: Requirement,
    scalars: { title: "title", description: "description", category: "category", priority: "priority", status: "status", source: "source", effort: "effort" },
    refs: { parent: ["parentId", "requirements"], changeId: ["changeRequestId", "changes"], owner: OWNER },
  },
  wbs: {
    Model: WbsItem,
    scalars: { title: "title", description: "description", status: "status", effort: "effort" },
    refs: { parent: ["parentId", "wbs"], changeId: ["changeRequestId", "changes"], owner: OWNER },
  },
  changes: {
    Model: ChangeRequest,
    scalars: {
      title: "title", description: "description", reason: "reason", requester: "requester",
      priority: "priority", scopeImpact: "scopeImpact", riskImpact: "riskImpact",
      cost: "costImpact", weeks: "scheduleImpactWeeks",
    },
    dates: { date: "requestDate" },
    guarded: ["status"],
  },
  tasks: {
    Model: Task,
    scalars: {
      title: "title", description: "description", status: "status", priority: "priority",
      progress: "progress", effort: "effort", actualEffort: "actualEffort", plannedCost: "plannedCost",
    },
    dates: { start: "startDate", end: "endDate" },
    refs: { wbsId: ["wbsItemId", "wbs"], changeId: ["changeRequestId", "changes"] },
    refArrays: { dependencies: ["predecessorIds", "tasks"] },
  },
  costs: {
    Model: CostRecord,
    scalars: { title: "title", category: "category", amount: "amount", notes: "notes" },
    dates: { date: "date" },
    refs: { taskId: ["taskId", "tasks"] },
  },
  defects: {
    Model: Defect,
    scalars: {
      title: "title", description: "description", module: "module", severity: "severity",
      priority: "priority", status: "status", verification: "verification", resolution: "resolution",
    },
    dates: { date: "reportedDate", due: "targetDate" },
    refs: { owner: OWNER, taskId: ["taskId", "tasks"], requirementId: ["requirementId", "requirements"] },
  },
  quality: {
    Model: QualityCheck,
    scalars: {
      title: "title", status: "status", reviewer: "reviewer", notes: "notes",
      testType: "testType", expectedResult: "expectedResult", actualResult: "actualResult",
    },
    dates: { date: "reviewDate" },
    refs: { owner: OWNER, wbsId: ["wbsItemId", "wbs"] },
  },
  risks: {
    Model: Risk,
    scalars: {
      title: "title", description: "description", category: "category", likelihood: "likelihood",
      impact: "impact", status: "status", mitigation: "mitigation", contingency: "contingency",
    },
    refs: { owner: OWNER },
  },
  pdpc: {
    Model: PdpcAction,
    scalars: { title: "title", objective: "objective", problem: "problem", prevention: "prevention", contingency: "contingency", status: "status" },
    refs: { owner: OWNER },
  },
  milestones: {
    Model: Milestone,
    scalars: { title: "title", status: "status", notes: "notes" },
    dates: { date: "date" },
  },
};
const GROUPS = Object.keys(SPEC);
const CHARTER = ["name", "description", "manager", "objectives", "businessNeed", "scope", "deliverables", "assumptions", "constraints", "status", "threshold"];

/* ---------- transactions (Atlas/replica sets) with safe fallback ---------- */
let txSupport;
export async function supportsTransactions() {
  if (txSupport === undefined) {
    try {
      const h = await mongoose.connection.db.admin().command({ hello: 1 });
      txSupport = Boolean(h.setName) || h.msg === "isdbgrid";
    } catch {
      txSupport = false;
    }
  }
  return txSupport;
}
export function resetTransactionDetection() { txSupport = undefined; }
export async function inTransaction(work) {
  return relationChecks.run("skip", () => runTransaction(work));
}
async function runTransaction(work) {
  if (!(await supportsTransactions())) return work(undefined);
  const session = await mongoose.startSession();
  try {
    let out;
    await session.withTransaction(async () => { out = await work(session); });
    return out;
  } finally {
    await session.endSession();
  }
}

/* ---------- load: collections -> aggregate ---------- */
export async function loadAggregate(project) {
  const projectId = project._id;
  const rows = await Promise.all(
    GROUPS.map((g) => SPEC[g].Model.find({ projectId }).sort({ _id: 1 }).lean()),
  );
  const [audit, closure] = await Promise.all([
    AuditLog.find({ projectId }).sort({ createdAt: -1, _id: -1 }).lean(),
    ProjectClosure.findOne({ projectId }).lean(),
  ]);
  const docs = Object.fromEntries(GROUPS.map((g, i) => [g, rows[i]]));
  const codeOf = {}, idOf = {};
  for (const g of GROUPS) {
    codeOf[g] = new Map(docs[g].map((d) => [String(d._id), d.code]));
    idOf[g] = new Map(docs[g].map((d) => [d.code, d._id]));
  }
  const agg = {
    _id: String(project._id),
    name: project.name,
    description: project.description,
    manager: project.manager,
    hospitals: (project.hospitals || []).map((h) => h.name).join("\n"),
    objectives: project.objectives,
    businessNeed: project.businessNeed,
    scope: project.scope,
    deliverables: project.deliverables,
    assumptions: project.assumptions,
    constraints: project.constraints,
    plan: project.plan instanceof Map ? Object.fromEntries(project.plan) : { ...(project.plan || {}) },
    originalBudget: project.originalBaseline.budget,
    originalWeeks: project.originalBaseline.weeks,
    startDate: iso(project.startDate),
    status: project.status,
    threshold: project.threshold,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    __v: project.revision,
  };
  for (const g of GROUPS) {
    const spec = SPEC[g];
    agg[g] = docs[g].map((d) => {
      const o = { id: d.code };
      for (const [l, db] of Object.entries(spec.scalars)) if (!empty(d[db])) o[l] = d[db];
      for (const [l, db] of Object.entries(spec.dates || {})) if (d[db]) o[l] = iso(d[db]);
      for (const [l, [db, target]] of Object.entries(spec.refs || {}))
        if (d[db]) o[l] = codeOf[target].get(String(d[db])) || undefined;
      for (const [l, [db, target]] of Object.entries(spec.refArrays || {}))
        o[l] = (d[db] || []).map((x) => codeOf[target].get(String(x))).filter(Boolean);
      o.createdAt = d.createdAt && new Date(d.createdAt).toISOString();
      o.updatedAt = d.updatedAt && new Date(d.updatedAt).toISOString();
      if (g === "tasks") {
        const a = (d.assigneeIds || []).map((x) => codeOf.team.get(String(x))).filter(Boolean);
        o.assignees = a;
        if (a[0]) o.owner = a[0];
        o.baselineStart = iso(d.baseline?.start);
        o.baselineEnd = iso(d.baseline?.end);
        o.baselineCost = d.baseline?.cost;
        o.progressHistory = (d.progressHistory || []).map((h) => ({ date: iso(h.date), value: h.value }));
      }
      if (g === "changes") {
        o.status = d.status;
        if (d.decision?.by) o.reviewer = d.decision.by;
        if (d.decision?.at) o.reviewDate = iso(d.decision.at);
        if (d.decision?.comments) o.comments = d.decision.comments;
      }
      return o;
    });
  }
  agg.audit = audit.map((a) => ({ id: a.code, date: new Date(a.createdAt).toISOString(), actor: a.actor, action: a.action }));
  agg.closure = closure
    ? Object.fromEntries(
        Object.entries({
          date: iso(closure.date), status: closure.status, notes: closure.notes,
          lessons: closure.lessons, issues: closure.issues, finalCost: closure.finalCost,
        }).filter(([, v]) => v !== undefined && v !== null),
      )
    : {};
  return { agg, ids: idOf };
}

/* ---------- save: aggregate diff -> per-collection writes ---------- */
const strip = (r) => {
  const { createdAt, updatedAt, ...rest } = r;
  return rest;
};
export const sameRecord = (a, b) => isDeepStrictEqual(strip(a), strip(b));

function buildDoc(g, rec, ctx, existing, creating) {
  const spec = SPEC[g];
  const set = {}, unset = {};
  const put = (path, value) => (empty(value) ? (unset[path] = "") : (set[path] = value));
  for (const [l, db] of Object.entries(spec.scalars)) put(db, rec[l]);
  for (const [l, db] of Object.entries(spec.dates || {})) put(db, day(rec[l]));
  for (const [l, [db, target]] of Object.entries(spec.refs || {})) {
    if (empty(rec[l])) unset[db] = "";
    else {
      const id = ctx.idOf[target].get(rec[l]);
      if (!id) fail(`${g}: ${l} refers to unknown ${target} record ${rec[l]}.`);
      set[db] = id;
    }
  }
  for (const [l, [db, target]] of Object.entries(spec.refArrays || {}))
    set[db] = (rec[l] || []).map((c) => {
      const id = ctx.idOf[target].get(c);
      if (!id) fail(`${g}: ${l} refers to unknown ${target} record ${c}.`);
      return id;
    });
  const initial = creating ? {} : null;
  if (g === "tasks") {
    const prior = existing?.assignees || [];
    let codes = prior;
    if (rec.assignees && JSON.stringify(rec.assignees) !== JSON.stringify(prior)) codes = rec.assignees;
    else if ((rec.owner || undefined) !== prior[0])
      codes = rec.owner ? [rec.owner, ...prior.slice(1).filter((x) => x !== rec.owner)] : [];
    set.assigneeIds = codes.map((c) => {
      const id = ctx.idOf.team.get(c);
      if (!id) fail(`tasks: unknown team member ${c}.`);
      return id;
    });
    set.progressHistory = (rec.progressHistory || []).map((h) => ({ date: day(h.date), value: h.value }));
    if (creating)
      initial.baseline = {
        start: day(rec.baselineStart || rec.start),
        end: day(rec.baselineEnd || rec.end),
        cost: rec.baselineCost ?? rec.plannedCost,
      };
  }
  if (g === "changes" && creating) {
    initial.status = ctx.migrate ? rec.status || "Pending" : "Pending";
    if (initial.status !== "Pending") {
      initial.decision = { by: rec.reviewer, at: day(rec.reviewDate) || new Date(), comments: rec.comments };
      initial.appliedToBaseline = initial.status === "Approved";
      initial.appliedAt = initial.decision.at;
    }
  }
  return { set, unset, initial };
}

function check(Model, doc) {
  const err = new Model(doc).validateSync();
  if (err) fail(Object.values(err.errors)[0]?.message || err.message);
}

function parseHospitals(text, existing = []) {
  const byName = new Map(existing.map((h) => [h.name, h]));
  return String(text || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean).map((name, i) => ({
    code: byName.get(name)?.code || `H-${String(i + 1).padStart(2, "0")}`,
    name,
    city: byName.get(name)?.city,
  }));
}

async function persist(project, prev, next, { session, creating = false, migrate = false } = {}) {
  const projectId = project._id;
  const fields = Object.fromEntries(CHARTER.filter((k) => next[k] !== undefined).map((k) => [k, next[k]]));
  const charter = { ...fields, plan: next.plan || {}, hospitals: parseHospitals(next.hospitals, project.hospitals) };
  checkProject({ ...project, ...charter });
  const ctx = { idOf: {}, migrate };
  for (const g of GROUPS) {
    ctx.idOf[g] = new Map(prev.ids[g] || []);
    for (const r of next[g]) if (!ctx.idOf[g].has(r.id)) ctx.idOf[g].set(r.id, new Types.ObjectId());
  }
  const ops = [];
  for (const g of GROUPS) {
    const spec = SPEC[g], before = new Map(prev.agg[g].map((r) => [r.id, r]));
    const bulk = [];
    for (const rec of next[g]) {
      const old = before.get(rec.id);
      if (old && sameRecord(old, rec)) continue;
      const { set, unset, initial } = buildDoc(g, rec, ctx, old, !old);
      const _id = ctx.idOf[g].get(rec.id);
      if (!old) {
        const doc = { _id, projectId, code: rec.id, ...Object.fromEntries(Object.entries(set)), ...initial };
        check(spec.Model, doc);
        bulk.push({ insertOne: { document: doc } });
      } else {
        const probe = { _id, projectId, code: rec.id, ...set };
        check(spec.Model, probe);
        const update = { $set: set };
        if (Object.keys(unset).length) update.$unset = unset;
        const filter = { _id, projectId };
        if (g === "changes") filter.status = "Pending";
        bulk.push({ updateOne: { filter, update } });
      }
    }
    for (const old of prev.agg[g]) if (!next[g].some((r) => r.id === old.id))
      bulk.push({ deleteOne: { filter: { _id: ctx.idOf[g].get(old.id), projectId, ...(g === "changes" ? { status: "Pending" } : {}) } } });
    if (bulk.length) ops.push([g, spec.Model, bulk]);
  }
  for (const [g, Model, bulk] of ops) {
    const res = await Model.bulkWrite(bulk, { session, ordered: true });
    const updates = bulk.filter((b) => b.updateOne).length, deletes = bulk.filter((b) => b.deleteOne).length;
    if (g === "changes" && (res.matchedCount < updates || res.deletedCount < deletes))
      fail("Decided requests are immutable.", 409);
  }
  // audit: append-only
  const known = new Set(prev.agg.audit.map((a) => a.id));
  const fresh = next.audit.filter((a) => !known.has(a.id)).reverse();
  if (fresh.length)
    await AuditLog.insertMany(
      fresh.map((a) => ({ projectId, code: a.id, actor: a.actor, action: a.action, createdAt: new Date(a.date) })),
      { session, ordered: true },
    );
  // closure
  const c = next.closure || {};
  const hasClosure = Object.values(c).some((v) => !empty(v));
  if (hasClosure) {
    await ProjectClosure.updateOne(
      { projectId },
      { $set: { date: day(c.date), status: c.status, notes: c.notes, lessons: c.lessons, issues: c.issues, finalCost: c.finalCost } },
      { session, upsert: true, runValidators: true },
    );
  } else await ProjectClosure.deleteOne({ projectId }, { session });
  const out = ctx;
  // project charter (original baseline is immutable; current baseline changes only on approval)
  const update = { $set: charter };
  if (!creating) {
    update.$inc = { revision: 1 };
    const res = await Project.updateOne({ _id: projectId, revision: prev.agg.__v }, update, { session, runValidators: true });
    if (res.matchedCount !== 1) {
      const e = new Error("Concurrent update");
      e.name = "VersionError";
      throw e;
    }
  }
  return out;
}

function checkProject(project) {
  const err = new Project(project).validateSync();
  if (err) fail(Object.values(err.errors)[0]?.message || err.message);
}

/* ---------- public store ---------- */
export function createStore({ User } = {}) {
  async function currentProject() {
    return Project.findOne().lean();
  }
  async function open(project) {
    const snapshot = await loadAggregate(project);
    let local = structuredClone(snapshot.agg);
    return {
      toObject() { return structuredClone(local); },
      set(p) {
        const { createdAt, updatedAt, _id, ...editable } = p;
        local = { ...local, ...structuredClone(editable) };
      },
      async save() {
        const fresh = await currentProject();
        if (!fresh || String(fresh._id) !== String(project._id)) fail("Project no longer exists.", 404);
        if (fresh.revision !== snapshot.agg.__v) {
          const e = new Error("Concurrent update");
          e.name = "VersionError";
          throw e;
        }
        await inTransaction((session) => persist(fresh, snapshot, local, { session }));
        const reloaded = await loadAggregate(await currentProject());
        snapshot.agg = reloaded.agg;
        snapshot.ids = reloaded.ids;
        local = structuredClone(reloaded.agg);
      },
    };
  }
  const blank = () => ({ agg: { ...Object.fromEntries(GROUPS.map((g) => [g, []])), audit: [], closure: {}, __v: 0 }, ids: {} });

  return {
    User,
    Project: { async findOne() { const p = await currentProject(); return p ? open(p) : null; } },

    // Create a project from an aggregate (seed, migration). Never overwrites.
    async createFromAggregate(agg, { migrate = false, appliedChanges } = {}) {
      const b = baseline(agg);
      const approved = agg.changes.filter((c) => c.status === "Approved");
      const _id = new Types.ObjectId();
      const projectDoc = {
        _id,
        name: agg.name, description: agg.description, manager: agg.manager,
        hospitals: parseHospitals(agg.hospitals),
        objectives: agg.objectives, businessNeed: agg.businessNeed, scope: agg.scope,
        deliverables: agg.deliverables, assumptions: agg.assumptions, constraints: agg.constraints,
        plan: agg.plan, startDate: day(agg.startDate), status: agg.status, threshold: agg.threshold,
        originalBaseline: { budget: agg.originalBudget, weeks: agg.originalWeeks },
        currentBaseline: { budget: b.budget, weeks: b.weeks, lastAppliedAt: approved.length ? new Date() : undefined },
        revision: agg.__v || 0,
      };
      checkProject(projectDoc);
      return inTransaction(async (session) => {
        const [project] = await Project.create([projectDoc], { session });
        const prev = blank();
        prev.agg.__v = projectDoc.revision;
        const ctx = await persist(project.toObject(), prev, agg, { session, creating: true, migrate });
        if (approved.length)
          await Project.updateOne(
            { _id },
            { $set: { appliedChangeIds: approved.map((c) => ctx.idOf.changes.get(c.id)) } },
            { session },
          );
        return _id;
      });
    },

    // Atomic decision. Approving applies cost/duration to the current baseline exactly once.
    async decideChange({ id, status, actor, comments }) {
      if (!["Approved", "Rejected"].includes(status)) fail("Invalid decision.");
      if (!comments?.trim()) fail("Decision comments are required.");
      const project = await currentProject();
      if (!project) fail("No project. Run npm run seed first.", 404);
      await inTransaction(async (session) => {
        const now = new Date();
        const cr = await ChangeRequest.findOneAndUpdate(
          { projectId: project._id, code: id, status: "Pending" },
          { $set: { status, "decision.by": actor, "decision.at": now, "decision.comments": comments.trim() } },
          { new: true, session },
        );
        if (!cr) {
          const exists = await ChangeRequest.exists({ projectId: project._id, code: id }).session(session || null);
          if (!exists) fail("Change not found.", 404);
          fail("This request has already been decided.", 409);
        }
        const linked = { projectId: project._id, changeRequestId: cr._id };
        const scope = status === "Approved" ? "Approved" : "Rejected";
        await Requirement.updateMany(linked, { $set: { status: scope } }, { session });
        await WbsItem.updateMany(linked, { $set: { status: scope } }, { session });
        if (status === "Approved") await applyToBaseline(project._id, cr, now, session);
        await AuditLog.create([{ projectId: project._id, code: randomUUID(), actor, action: `${status} change ${id}` }], { session });
        await Project.updateOne({ _id: project._id }, { $inc: { revision: 1 } }, { session });
      });
      return (await loadAggregate(await currentProject())).agg;
    },

    // Repair after a crash on servers without transactions: apply any approved-but-unapplied change once.
    async reconcileBaseline() {
      const project = await currentProject();
      if (!project) return 0;
      let fixed = 0;
      const pending = await ChangeRequest.find({ projectId: project._id, status: "Approved", appliedToBaseline: false });
      for (const cr of pending) {
        const linked = { projectId: project._id, changeRequestId: cr._id };
        await Requirement.updateMany(linked, { $set: { status: "Approved" } });
        await WbsItem.updateMany(linked, { $set: { status: "Approved" } });
        if (await applyToBaseline(project._id, cr, new Date())) fixed++;
      }
      if (pending.length) await Project.updateOne({ _id: project._id }, { $inc: { revision: 1 } });
      return fixed;
    },

    // Stored current baseline must equal original + approved changes.
    async baselineIntegrity() {
      const project = await currentProject();
      const approved = await ChangeRequest.find({ projectId: project._id, status: "Approved" }).lean();
      const derived = {
        budget: project.originalBaseline.budget + approved.reduce((s, c) => s + c.costImpact, 0),
        weeks: project.originalBaseline.weeks + approved.reduce((s, c) => s + c.scheduleImpactWeeks, 0),
      };
      const stored = { budget: project.currentBaseline.budget, weeks: project.currentBaseline.weeks };
      const applied = new Set((project.appliedChangeIds || []).map(String));
      const ok =
        stored.budget === derived.budget &&
        stored.weeks === derived.weeks &&
        approved.every((c) => applied.has(String(c._id))) &&
        applied.size === approved.length;
      return { ok, stored, derived, original: { ...project.originalBaseline } };
    },
    loadAggregate: async () => {
      const p = await currentProject();
      return p ? (await loadAggregate(p)).agg : null;
    },
  };
}

// Idempotent: the $ne guard means a second call (or a retry) matches nothing.
async function applyToBaseline(projectId, cr, now, session) {
  const res = await Project.updateOne(
    { _id: projectId, appliedChangeIds: { $ne: cr._id } },
    {
      $inc: { "currentBaseline.budget": cr.costImpact, "currentBaseline.weeks": cr.scheduleImpactWeeks },
      $push: { appliedChangeIds: cr._id },
      $set: { "currentBaseline.lastAppliedAt": now },
    },
    { session },
  );
  await ChangeRequest.updateOne({ _id: cr._id }, { $set: { appliedToBaseline: true, appliedAt: now } }, { session });
  return res.modifiedCount === 1;
}
