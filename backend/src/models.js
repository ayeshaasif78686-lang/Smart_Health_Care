// Normalized MongoDB model layer: one collection per entity, ObjectId references,
// every project-related record carries `projectId` and a human-readable `code`.
import mongoose from "mongoose";
import { AsyncLocalStorage } from "node:async_hooks";
const { Schema, Types } = mongoose;

// The store validates whole-aggregate integrity itself and writes in bulk, so it turns
// the per-document relationship lookups off for its own writes (they run for direct model use).
export const relationChecks = new AsyncLocalStorage();

export const ENUMS = {
  projectStatus: ["Planning", "In Progress", "On Hold", "Completed"],
  priority: ["High", "Medium", "Low"],
  teamStatus: ["Active", "On Leave"],
  requirementStatus: ["Proposed", "Approved", "In Progress", "Completed", "Rejected"],
  wbsStatus: ["Proposed", "Approved", "Rejected"],
  changeStatus: ["Pending", "Approved", "Rejected"],
  taskStatus: ["Not Started", "In Progress", "Completed"],
  defectStatus: ["Open", "In Progress", "Fixed", "Retest", "Closed"],
  severity: ["Critical", "High", "Medium", "Low"],
  verification: ["Pending", "Passed", "Failed"],
  qualityStatus: ["Pending", "Passed", "Failed"],
  riskStatus: ["Open", "Mitigated", "Closed"],
  pdpcStatus: ["Pending", "In Progress", "Completed"],
  milestoneStatus: ["Pending", "Completed"],
  userRole: ["Project Manager", "Developer", "QA"],
};

const str = (extra = {}) => ({ type: String, trim: true, ...extra });
const req = (extra = {}) => str({ required: true, minlength: 1, ...extra });
const money = (extra = {}) => ({ type: Number, min: 0, ...extra });
const oid = (ref, extra = {}) => ({ type: Schema.Types.ObjectId, ref, ...extra });
const whole = {
  validator: Number.isInteger,
  message: "{PATH} must be a whole number.",
};

// Async relationship guard: every referenced ObjectId must exist in the SAME project.
function guardRefs(schema, rules) {
  schema.pre("validate", async function () {
    if (relationChecks.getStore() === "skip") return;
    for (const [path, target] of Object.entries(rules)) {
      if (!this.isNew && !this.isModified(path)) continue;
      const value = this.get(path);
      const ids = (Array.isArray(value) ? value : [value]).filter(Boolean);
      if (!ids.length) continue;
      const unique = [...new Set(ids.map(String))];
      const found = await mongoose
        .model(target)
        .countDocuments({ _id: { $in: unique }, projectId: this.projectId })
        .session(this.$session());
      if (found !== unique.length)
        this.invalidate(path, `${path} references a ${target} that does not exist in this project.`);
      if (
        String(this.get(path)) === String(this._id) ||
        (Array.isArray(value) && value.some((v) => String(v) === String(this._id)))
      )
        this.invalidate(path, `${path} cannot reference the record itself.`);
    }
  });
}

// Shared shape of every project-scoped collection.
function scoped(name, collection, definition, indexes = []) {
  const schema = new Schema(
    {
      projectId: oid("Project", { required: true, index: true, immutable: true }),
      code: req({ immutable: true }),
      ...definition,
    },
    { timestamps: true, strict: "throw", collection },
  );
  schema.index({ projectId: 1, code: 1 }, { unique: true });
  for (const [fields, options] of indexes) schema.index(fields, options || {});
  return { schema, name };
}
const build = ({ schema, name }) => mongoose.models[name] || mongoose.model(name, schema);

/* ---------------- projects ---------------- */
const baselineBudget = (extra) => ({ type: Number, required: true, min: 0, ...extra });
const baselineWeeks = (extra) => ({ type: Number, required: true, min: 1, validate: whole, ...extra });
const projectSchema = new Schema(
  {
    name: req({ unique: true, maxlength: 120 }),
    description: str(),
    manager: str(),
    managerId: oid("TeamMember"),
    hospitals: [
      new Schema({ code: req(), name: req(), city: str() }, { _id: false, strict: "throw" }),
    ],
    objectives: str(),
    businessNeed: str(),
    scope: str(),
    deliverables: str(),
    assumptions: str(),
    constraints: str(),
    plan: { type: Map, of: String },
    startDate: { type: Date, required: true },
    status: { type: String, enum: ENUMS.projectStatus, default: "Planning" },
    threshold: { type: Number, min: 0, max: 1, default: 0.9 },
    // Original approved baseline: written once, never changes.
    originalBaseline: {
      budget: baselineBudget({ immutable: true }),
      weeks: baselineWeeks({ immutable: true }),
      approvedAt: { type: Date, default: Date.now, immutable: true },
    },
    // Current approved baseline: original + approved change requests only.
    currentBaseline: {
      budget: baselineBudget(),
      weeks: baselineWeeks(),
      lastAppliedAt: Date,
    },
    // Change requests already applied to currentBaseline (guards double application).
    appliedChangeIds: [oid("ChangeRequest")],
    revision: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, strict: "throw", collection: "projects" },
);
projectSchema.path("currentBaseline.budget").validate(function (v) {
  return v >= this.originalBaseline.budget;
}, "Current budget cannot be lower than the original baseline.");
projectSchema.path("currentBaseline.weeks").validate(function (v) {
  return v >= this.originalBaseline.weeks;
}, "Current duration cannot be lower than the original baseline.");
projectSchema.index({ status: 1 });

/* ---------------- people ---------------- */
const teamMemberDef = scoped("TeamMember", "teamMembers", {
  name: req(),
  role: str(),
  email: str({ lowercase: true, match: [/^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email."] }),
  status: { type: String, enum: ENUMS.teamStatus, default: "Active" },
}, [[{ projectId: 1, email: 1 }, { unique: true, partialFilterExpression: { email: { $gt: "" } } }]]);

const stakeholderDef = scoped("Stakeholder", "stakeholders", {
  name: req(),
  role: str(),
  organization: str(),
  email: str({ lowercase: true, match: [/^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email."] }),
  description: str(),
  influence: { type: String, enum: ENUMS.priority },
  interest: { type: String, enum: ENUMS.priority },
});

/* ---------------- scope ---------------- */
const requirementDef = scoped("Requirement", "requirements", {
  title: req(),
  description: str(),
  category: str(),
  priority: { type: String, enum: ENUMS.priority },
  status: { type: String, enum: ENUMS.requirementStatus, default: "Proposed" },
  source: str(),
  effort: money(),
  parentId: oid("Requirement"),
  changeRequestId: oid("ChangeRequest"),
  ownerId: oid("TeamMember"),
}, [[{ projectId: 1, parentId: 1 }], [{ projectId: 1, changeRequestId: 1 }], [{ projectId: 1, status: 1 }]]);

const wbsDef = scoped("WbsItem", "wbsItems", {
  title: req(),
  description: str(),
  status: { type: String, enum: ENUMS.wbsStatus, default: "Proposed" },
  effort: money(),
  parentId: oid("WbsItem"),
  changeRequestId: oid("ChangeRequest"),
  ownerId: oid("TeamMember"),
}, [[{ projectId: 1, parentId: 1 }], [{ projectId: 1, changeRequestId: 1 }]]);

// Cost/schedule impact become read-only once a change request is decided.
// (Mongoose calls this with the document on save() and with the Query on updates.)
function decided(doc) {
  const d = doc instanceof mongoose.Document ? doc : this;
  return d instanceof mongoose.Document && d.status !== "Pending";
}
const changeDef = scoped("ChangeRequest", "changeRequests", {
  title: req(),
  description: str(),
  reason: str(),
  requester: str(),
  requestDate: Date,
  priority: { type: String, enum: ENUMS.priority },
  scopeImpact: str(),
  riskImpact: str(),
  costImpact: { type: Number, required: true, min: 0, immutable: decided },
  scheduleImpactWeeks: { type: Number, required: true, min: 0, validate: whole, immutable: decided },
  status: { type: String, enum: ENUMS.changeStatus, default: "Pending" },
  decision: {
    by: str(),
    at: Date,
    comments: str(),
  },
  appliedToBaseline: { type: Boolean, default: false },
  appliedAt: Date,
}, [[{ projectId: 1, status: 1 }]]);
// Query updates cannot rewrite the impact of an already-decided request.
changeDef.schema.pre(["updateOne", "updateMany", "findOneAndUpdate"], function () {
  const u = this.getUpdate() || {};
  const touched = { ...u, ...(u.$set || {}) };
  if ("costImpact" in touched || "scheduleImpactWeeks" in touched) this.where({ status: "Pending" });
});
changeDef.schema.path("decision.comments").validate(function (v) {
  return this.status === "Pending" || Boolean(v && v.trim());
}, "Decision comments are required.");

/* ---------------- schedule & cost ---------------- */
const taskDef = scoped("Task", "tasks", {
  title: req(),
  description: str(),
  wbsItemId: oid("WbsItem"),
  changeRequestId: oid("ChangeRequest"),
  assigneeIds: [oid("TeamMember")],
  predecessorIds: [oid("Task")],
  startDate: { type: Date, required: true },
  endDate: {
    type: Date,
    required: true,
    validate: {
      validator(v) { return !this.startDate || v >= this.startDate; },
      message: "Task end must be on or after start.",
    },
  },
  progress: {
    type: Number, required: true, min: 0, max: 100, default: 0,
    validate: {
      validator(v) { return !this.status || (this.status === "Completed") === (v === 100); },
      message: "Completed tasks must be 100%, and only completed tasks may be 100%.",
    },
  },
  status: { type: String, enum: ENUMS.taskStatus, default: "Not Started" },
  priority: { type: String, enum: ENUMS.priority },
  effort: money(),
  actualEffort: money(),
  plannedCost: { type: Number, required: true, min: 0 },
  baseline: {
    start: { type: Date, immutable: true },
    end: { type: Date, immutable: true },
    cost: { type: Number, min: 0, immutable: true },
  },
  progressHistory: [
    new Schema(
      { date: { type: Date, required: true }, value: { type: Number, min: 0, max: 100, required: true } },
      { _id: false, strict: "throw" },
    ),
  ],
}, [
  [{ projectId: 1, status: 1 }],
  [{ projectId: 1, assigneeIds: 1 }],
  [{ projectId: 1, wbsItemId: 1 }],
  [{ projectId: 1, predecessorIds: 1 }],
]);

const milestoneDef = scoped("Milestone", "milestones", {
  title: req(),
  date: { type: Date, required: true },
  status: { type: String, enum: ENUMS.milestoneStatus, default: "Pending" },
  notes: str(),
  taskIds: [oid("Task")],
}, [[{ projectId: 1, date: 1 }]]);

const costDef = scoped("CostRecord", "costRecords", {
  title: req(),
  taskId: oid("Task", { required: true }),
  category: str(),
  amount: money({ required: true }),
  date: { type: Date, required: true },
  notes: str(),
}, [[{ projectId: 1, taskId: 1, date: 1 }]]);

/* ---------------- quality & risk ---------------- */
const defectDef = scoped("Defect", "defects", {
  title: req(),
  description: str(),
  module: str(),
  severity: { type: String, enum: ENUMS.severity, required: true },
  priority: { type: String, enum: ENUMS.priority },
  status: { type: String, enum: ENUMS.defectStatus, default: "Open" },
  verification: { type: String, enum: ENUMS.verification, default: "Pending" },
  ownerId: oid("TeamMember"),
  taskId: oid("Task"),
  requirementId: oid("Requirement"),
  reportedDate: Date,
  targetDate: Date,
  resolution: str(),
}, [[{ projectId: 1, status: 1, severity: 1 }], [{ projectId: 1, ownerId: 1 }]]);
defectDef.schema.path("status").validate(function (v) {
  return v !== "Closed" || this.verification === "Passed";
}, "A defect needs successful verification before closure.");

const qualityDef = scoped("QualityCheck", "qualityChecks", {
  title: req(),
  status: { type: String, enum: ENUMS.qualityStatus, default: "Pending" },
  ownerId: oid("TeamMember"),
  wbsItemId: oid("WbsItem"),
  testType: str(),
  expectedResult: str(),
  actualResult: str(),
  reviewer: str(),
  reviewDate: Date,
  notes: str(),
}, [[{ projectId: 1, status: 1 }]]);

const riskDef = scoped("Risk", "risks", {
  title: req(),
  description: str(),
  category: str(),
  likelihood: { type: Number, required: true, min: 1, max: 5, validate: whole },
  impact: { type: Number, required: true, min: 1, max: 5, validate: whole },
  status: { type: String, enum: ENUMS.riskStatus, default: "Open" },
  ownerId: oid("TeamMember"),
  mitigation: str(),
  contingency: str(),
}, [[{ projectId: 1, likelihood: -1, impact: -1 }], [{ projectId: 1, status: 1 }]]);
riskDef.schema.virtual("score").get(function () { return this.likelihood * this.impact; });
riskDef.schema.virtual("level").get(function () {
  const s = this.likelihood * this.impact;
  return s >= 20 ? "Critical" : s >= 12 ? "High" : s >= 6 ? "Medium" : "Low";
});

const pdpcDef = scoped("PdpcAction", "pdpcActions", {
  title: req(),
  objective: str(),
  problem: str(),
  prevention: str(),
  contingency: str(),
  ownerId: oid("TeamMember"),
  riskId: oid("Risk"),
  status: { type: String, enum: ENUMS.pdpcStatus, default: "Pending" },
});

/* ---------------- audit & closure ---------------- */
const auditDef = scoped("AuditLog", "auditLogs", {
  actor: req(),
  action: req(),
  entity: { collection: str(), entityId: { type: Schema.Types.ObjectId }, code: str() },
}, [[{ projectId: 1, createdAt: -1 }]]);
// The audit trail is append-only.
for (const hook of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "deleteOne", "deleteMany", "findOneAndDelete"])
  auditDef.schema.pre(hook, function () {
    throw new Error("Audit logs are append-only.");
  });
auditDef.schema.pre("save", function () {
  if (!this.isNew) throw new Error("Audit logs are append-only.");
});

const closureSchema = new Schema(
  {
    projectId: oid("Project", { required: true, unique: true, immutable: true }),
    date: Date,
    status: str(),
    finalCost: money(),
    issues: str(),
    lessons: str(),
    notes: str(),
  },
  { timestamps: true, strict: "throw", collection: "projectClosures" },
);

/* ---------------- users ---------------- */
const userSchema = new Schema({
  email: { type: String, unique: true, required: true, lowercase: true, trim: true },
  name: String,
  password: String,
  role: { type: String, enum: ENUMS.userRole },
}, { timestamps: true });

// Cross-collection reference rules (checked on model save()/create()).
guardRefs(requirementDef.schema, { parentId: "Requirement", changeRequestId: "ChangeRequest", ownerId: "TeamMember" });
guardRefs(wbsDef.schema, { parentId: "WbsItem", changeRequestId: "ChangeRequest", ownerId: "TeamMember" });
guardRefs(taskDef.schema, { wbsItemId: "WbsItem", changeRequestId: "ChangeRequest", assigneeIds: "TeamMember", predecessorIds: "Task" });
guardRefs(costDef.schema, { taskId: "Task" });
guardRefs(milestoneDef.schema, { taskIds: "Task" });
guardRefs(defectDef.schema, { ownerId: "TeamMember", taskId: "Task", requirementId: "Requirement" });
guardRefs(qualityDef.schema, { ownerId: "TeamMember", wbsItemId: "WbsItem" });
guardRefs(riskDef.schema, { ownerId: "TeamMember" });
guardRefs(pdpcDef.schema, { ownerId: "TeamMember", riskId: "Risk" });

export const Project = mongoose.models.Project || mongoose.model("Project", projectSchema);
export const TeamMember = build(teamMemberDef);
export const Stakeholder = build(stakeholderDef);
export const Requirement = build(requirementDef);
export const WbsItem = build(wbsDef);
export const ChangeRequest = build(changeDef);
export const Task = build(taskDef);
export const Milestone = build(milestoneDef);
export const CostRecord = build(costDef);
export const Defect = build(defectDef);
export const QualityCheck = build(qualityDef);
export const Risk = build(riskDef);
export const PdpcAction = build(pdpcDef);
export const AuditLog = build(auditDef);
export const ProjectClosure = mongoose.models.ProjectClosure || mongoose.model("ProjectClosure", closureSchema);
export const User = mongoose.models.User || mongoose.model("User", userSchema);

export const ALL_MODELS = {
  Project, TeamMember, Stakeholder, Requirement, WbsItem, ChangeRequest, Task,
  Milestone, CostRecord, Defect, QualityCheck, Risk, PdpcAction, AuditLog, ProjectClosure, User,
};
export { Types };
