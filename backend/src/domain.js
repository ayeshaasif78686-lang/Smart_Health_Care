export const DAY = 86400000;
export const groups = [
  "stakeholders",
  "team",
  "requirements",
  "wbs",
  "changes",
  "tasks",
  "costs",
  "defects",
  "quality",
  "risks",
  "pdpc",
  "milestones",
];
export function fail(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  throw e;
}
export function date(s) {
  const n = Date.parse(s);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s || "") ||
    !Number.isFinite(n) ||
    new Date(n).toISOString().slice(0, 10) !== s
  )
    fail("Use a valid date (YYYY-MM-DD).");
  return n;
}
export function baseline(p) {
  const a = p.changes.filter((c) => c.status === "Approved");
  const weeks = p.originalWeeks + a.reduce((s, c) => s + c.weeks, 0);
  return {
    budget: p.originalBudget + a.reduce((s, c) => s + c.cost, 0),
    weeks,
    deadline: new Date(date(p.startDate) + weeks * 7 * DAY - DAY)
      .toISOString()
      .slice(0, 10),
  };
}
const ref = (xs, id, label, optional = true) => {
  if (!id && optional) return;
  if (!xs.some((x) => x.id === id)) fail(`${label} does not exist: ${id}`);
};
export function validate(p) {
  if (!p.name?.trim()) fail("Project name is required.");
  date(p.startDate);
  for (const k of ["originalBudget", "originalWeeks", "threshold"])
    if (!Number.isFinite(p[k]) || p[k] < 0)
      fail(`${k} must be a non-negative number.`);
  if (!Number.isInteger(p.originalWeeks) || p.originalWeeks < 1)
    fail("Duration must be positive whole weeks.");
  if (!["Planning", "In Progress", "On Hold", "Completed"].includes(p.status)) fail("Invalid project status.");
  for (const group of ["team", "stakeholders"]) {
    const emails = new Set();
    for (const r of p[group]) {
      if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) fail("Invalid email.");
      const email = r.email?.trim().toLowerCase();
      if (group === "team" && email && emails.has(email)) fail("Team email already exists.");
      if (email) emails.add(email);
    }
  }
  for (const m of p.milestones) date(m.date);
  if (p.threshold > 1) fail("Warning threshold must be between 0 and 1.");
  for (const group of groups) {
    const ids = new Set();
    for (const r of p[group]) {
      if (!r.id || ids.has(r.id)) fail(`Duplicate or missing ID in ${group}.`);
      ids.add(r.id);
      if (!r.title?.trim()) fail(`${group}: title is required.`);
      for (const k of [
        "cost",
        "weeks",
        "effort",
        "actualEffort",
        "plannedCost",
        "amount",
        "progress",
        "likelihood",
        "impact",
      ])
        if (r[k] !== undefined && (!Number.isFinite(r[k]) || r[k] < 0))
          fail(`${k} must be non-negative.`);
      for (const k of ["start", "end", "date", "due"]) if (r[k]) date(r[k]);
      if (r.owner) ref(p.team, r.owner, "Team member");
      for (const a of r.assignees || []) ref(p.team, a, "Team member", false);
    }
  }
  const statuses = {
    requirements: [
      "Proposed",
      "Approved",
      "In Progress",
      "Completed",
      "Rejected",
    ],
    wbs: ["Proposed", "Approved", "Rejected"],
    changes: ["Pending", "Approved", "Rejected"],
    tasks: ["Not Started", "In Progress", "Completed"],
    defects: ["Open", "In Progress", "Fixed", "Retest", "Closed"],
    quality: ["Pending", "Passed", "Failed"],
    risks: ["Open", "Mitigated", "Closed"],
    pdpc: ["Pending", "In Progress", "Completed"],
    milestones: ["Pending", "Completed"],
  };
  for (const [g, values] of Object.entries(statuses))
    for (const r of p[g])
      if (!values.includes(r.status)) fail(`Invalid ${g} status.`);
  for (const r of [...p.requirements, ...p.wbs]) {
    if (r.changeId) {
      ref(p.changes, r.changeId, "Change request", false);
      const c = p.changes.find((c) => c.id === r.changeId);
      if (
        c.status !== "Approved" &&
        !["Proposed", "Rejected"].includes(r.status)
      )
        fail(
          "Pending or rejected change features cannot enter approved scope.",
        );
    }
  }
  for (const c of p.changes) {
    if (
      !Number.isFinite(c.cost) ||
      c.cost < 0 ||
      !Number.isInteger(c.weeks) ||
      c.weeks < 0
    )
      fail("Change cost and whole weeks must be non-negative.");
  }
  for (const w of p.wbs) ref(p.wbs, w.parent, "Parent WBS");
  function cycle(rows, edges) {
    const visited = new Set(),
      active = new Set();
    function visit(r) {
      if (active.has(r.id)) fail("Circular dependencies are not allowed.");
      if (visited.has(r.id)) return;
      active.add(r.id);
      for (const id of edges(r)) {
        ref(rows, id, "Dependency", false);
        visit(rows.find((t) => t.id === id));
      }
      active.delete(r.id);
      visited.add(r.id);
    }
    rows.forEach(visit);
  }
  cycle(p.requirements, (r) => (r.parent ? [r.parent] : []));
  cycle(p.wbs, (w) => (w.parent ? [w.parent] : []));
  cycle(p.tasks, (t) => t.dependencies || []);
  for (const t of p.tasks) {
    if (!Number.isFinite(t.progress) || !Number.isFinite(t.plannedCost))
      fail("Task progress and planned cost are required.");
    if (t.changeId) {
      ref(p.changes, t.changeId, "Change request", false);
      if (p.changes.find((c) => c.id === t.changeId).status !== "Approved")
        fail("Only approved changes may have scheduled tasks.");
    }
    if (date(t.end) < date(t.start))
      fail("Task end must be on or after start.");
    if (t.progress > 100) fail("Progress cannot exceed 100%.");
    if ((t.status === "Completed") !== (t.progress === 100))
      fail(
        "Completed tasks must have 100% progress, and only completed tasks may have 100%.",
      );
    ref(p.wbs, t.wbsId, "WBS");
    const workPackage = p.wbs.find((w) => w.id === t.wbsId);
    if (workPackage && workPackage.status !== "Approved")
      fail("Tasks can only be scheduled under approved WBS items.");
    if (workPackage?.changeId && t.changeId !== workPackage.changeId)
      fail("Task and WBS must reference the same approved change.");
    for (const id of t.dependencies || []) {
      const pred = p.tasks.find((x) => x.id === id);
      if (date(t.start) <= date(pred.end))
        fail(`${t.title} must start after ${pred.title} finishes.`);
    }
    for (const h of t.progressHistory || []) {
      date(h.date);
      if (h.value < 0 || h.value > 100) fail("Invalid historical progress.");
    }
  }
  for (const c of p.costs) {
    if (!Number.isFinite(c.amount) || c.amount < 0)
      fail("Cost amount must be non-negative.");
    ref(p.tasks, c.taskId, "Task", false);
    if (!c.date) fail("Cost date is required.");
  }
  for (const d of p.defects) {
    if (d.taskId) ref(p.tasks, d.taskId, "Related task");
    if (d.requirementId) ref(p.requirements, d.requirementId, "Related requirement");
    if (d.status === "Closed" && d.verification !== "Passed")
      fail("A defect needs successful verification before closure.");
    if (!["Critical", "High", "Medium", "Low"].includes(d.severity))
      fail("Invalid defect severity.");
  }
  for (const q of p.quality) if (q.wbsId) ref(p.wbs, q.wbsId, "Deliverable (WBS item)");
  for (const r of p.risks)
    for (const k of ["likelihood", "impact"])
      if (!Number.isInteger(r[k]) || r[k] < 1 || r[k] > 5)
        fail("Risk likelihood and impact must be integers from 1 to 5.");
  if (p.closure?.date) date(p.closure.date);
  return p;
}
export function evmValues(PV, EV, AC, threshold = 0.9, BAC = null) {
  const CPI = AC ? EV / AC : null;
  const out = {
    PV,
    EV,
    AC,
    CPI,
    SPI: PV ? EV / PV : null,
    CV: EV - AC,
    SV: EV - PV,
    costWarning: AC > 0 && EV / AC < threshold,
    scheduleWarning: PV > 0 && EV / PV < threshold,
  };
  if (BAC !== null) {
    // Forecasts: EAC = BAC / CPI (typical variance), ETC = EAC - AC, VAC = BAC - EAC.
    out.BAC = BAC;
    out.EAC = CPI ? BAC / CPI : null;
    out.ETC = out.EAC === null ? null : Math.max(0, out.EAC - AC);
    out.VAC = out.EAC === null ? null : BAC - out.EAC;
    out.budgetExceeded = AC > BAC;
    out.overrunForecast = out.EAC !== null && out.EAC > BAC;
  }
  return out;
}
export function evm(p, at) {
  const end = date(at);
  let PV = 0,
    EV = 0;
  for (const t of p.tasks) {
    if (
      t.changeId &&
      p.changes.find((c) => c.id === t.changeId)?.status !== "Approved"
    )
      continue;
    const s = date(t.baselineStart || t.start),
      e = date(t.baselineEnd || t.end);
    const cost = t.baselineCost ?? t.plannedCost ?? 0;
    PV += cost * Math.min(1, Math.max(0, (end - s + DAY) / (e - s + DAY)));
    const h = (t.progressHistory || [])
      .filter((h) => date(h.date) <= end)
      .sort((a, b) => a.date.localeCompare(b.date));
    EV += (cost * (h.at(-1)?.value || 0)) / 100;
  }
  const AC = p.costs
    .filter((c) => date(c.date) <= end)
    .reduce((s, c) => s + c.amount, 0);
  return {
    ...evmValues(PV, EV, AC, p.threshold, baseline(p).budget),
    remaining: baseline(p).budget - AC,
  };
}
export function schedule(p, at) {
  const today = date(at);
  const delayed = p.tasks.filter(
    (t) => date(t.end) < today && t.progress < 100,
  );
  const affected = new Set();
  const forecasts = {};
  function calc(t) {
    if (forecasts[t.id]) return forecasts[t.id];
    const duration = (date(t.end) - date(t.start)) / DAY + 1;
    let start = date(t.start);
    for (const id of t.dependencies || []) {
      const dep = p.tasks.find((x) => x.id === id);
      start = Math.max(start, calc(dep) + DAY);
      if (delayed.some((d) => d.id === id) || affected.has(id))
        affected.add(t.id);
    }
    let finish = start + (duration - 1) * DAY;
    if (t.progress < 100 && finish < today)
      finish =
        today + Math.max(1, Math.ceil(duration * (1 - t.progress / 100))) * DAY;
    return (forecasts[t.id] = finish);
  }
  p.tasks.forEach(calc);
  const finish = Math.max(date(p.startDate), ...Object.values(forecasts));
  return {
    delayed,
    affected: [...affected],
    forecast: new Date(finish).toISOString().slice(0, 10),
    deadlineAtRisk: finish > date(baseline(p).deadline),
    originalDeadlineAtRisk:
      finish > date(p.startDate) + (p.originalWeeks * 7 - 1) * DAY,
  };
}
export function changeImpact(p) {
  const b = baseline(p);
  const allocated = p.tasks.reduce((v, t) => v + (t.plannedCost || 0), 0);
  const changes = p.changes.map((c) => {
    const linked = (rows) => rows.filter((r) => r.changeId === c.id);
    const after = {
      budget: b.budget + (c.status === "Pending" ? c.cost : 0),
      weeks: b.weeks + (c.status === "Pending" ? c.weeks : 0),
    };
    after.deadline = new Date(date(p.startDate) + after.weeks * 7 * DAY - DAY)
      .toISOString()
      .slice(0, 10);
    return {
      id: c.id,
      title: c.title,
      status: c.status,
      cost: c.cost,
      weeks: c.weeks,
      requirements: linked(p.requirements).length,
      wbs: linked(p.wbs).length,
      tasks: linked(p.tasks).length,
      // For a pending request this is the projected baseline if it were approved.
      projected: after,
    };
  });
  return {
    original: {
      budget: p.originalBudget,
      weeks: p.originalWeeks,
      deadline: new Date(date(p.startDate) + p.originalWeeks * 7 * DAY - DAY)
        .toISOString()
        .slice(0, 10),
    },
    current: b,
    allocatedCost: allocated,
    unallocatedBudget: b.budget - allocated,
    changes,
  };
}
// Builds schedule tasks for the approved WBS work packages of one approved change request.
// Cost and the extra weeks are split equally; the new work follows the last baseline task.
export function tasksForChange(p, id) {
  const c = p.changes.find((c) => c.id === id);
  if (!c) fail("Change not found.", 404);
  if (c.status !== "Approved")
    fail("Tasks can only be generated for an approved change request.", 409);
  const parents = new Set(p.wbs.map((w) => w.parent).filter(Boolean));
  const items = p.wbs.filter(
    (w) =>
      w.changeId === id &&
      w.status === "Approved" &&
      !parents.has(w.id) &&
      !p.tasks.some((t) => t.wbsId === w.id && t.changeId === id),
  );
  if (!items.length)
    fail("No approved work packages without tasks for this change request.", 409);
  const base = p.tasks.filter((t) => !t.changeId);
  const last = (base.length ? base : p.tasks).reduce(
    (a, t) => (!a || date(t.end) > date(a.end) ? t : a),
    null,
  );
  const start = last ? date(last.end) + DAY : date(p.startDate);
  const days = Math.max(items.length, c.weeks * 7);
  const share = Math.floor(c.cost / items.length);
  let n = p.tasks.length;
  const used = new Set(p.tasks.map((t) => t.id));
  const stamp = new Date().toISOString();
  const created = items.map((w, i) => {
    let id2;
    do id2 = "T-" + String(++n).padStart(2, "0");
    while (used.has(id2));
    used.add(id2);
    const cost = share + (i === 0 ? c.cost - share * items.length : 0);
    const iso = (d) => new Date(d).toISOString().slice(0, 10);
    return {
      id: id2,
      title: w.title,
      description: `Generated from approved change ${c.id}`,
      wbsId: w.id,
      changeId: c.id,
      start: iso(start),
      end: iso(start + (days - 1) * DAY),
      dependencies: last ? [last.id] : [],
      progress: 0,
      status: "Not Started",
      priority: "High",
      effort: w.effort || 40,
      actualEffort: 0,
      plannedCost: cost,
      baselineStart: iso(start),
      baselineEnd: iso(start + (days - 1) * DAY),
      baselineCost: cost,
      progressHistory: [],
      createdAt: stamp,
      updatedAt: stamp,
    };
  });
  p.tasks.push(...created);
  return created;
}
export function summary(p, at) {
  const b = baseline(p),
    e = evm(p, at),
    s = schedule(p, at);
  const total = p.tasks.reduce((v, t) => v + (t.effort || 1), 0);
  return {
    baseline: b,
    impact: changeImpact(p),
    evm: e,
    schedule: s,
    progress: total
      ? Math.round(
          p.tasks.reduce((v, t) => v + t.progress * (t.effort || 1), 0) / total,
        )
      : 0,
    pending: p.changes.filter((c) => c.status === "Pending").length,
    critical: p.defects.filter(
      (d) => d.severity === "Critical" && d.status !== "Closed",
    ),
    remainingDays: Math.max(0, Math.ceil((date(b.deadline) - date(at)) / DAY)),
    chart: Array.from({ length: 6 }, (_, i) => {
      const d = new Date(
        date(p.startDate) + ((date(at) - date(p.startDate)) * i) / 5,
      )
        .toISOString()
        .slice(0, 10);
      return { date: d, ...evm(p, d) };
    }),
  };
}
export function decide(p, id, status, actor, comments) {
  const c = p.changes.find((c) => c.id === id);
  if (!c) fail("Change not found.", 404);
  if (c.status !== "Pending")
    fail("This request has already been decided.", 409);
  if (!["Approved", "Rejected"].includes(status)) fail("Invalid decision.");
  if (!comments?.trim()) fail("Decision comments are required.");
  c.status = status;
  c.reviewer = actor;
  c.reviewDate = new Date().toISOString().slice(0, 10);
  c.comments = comments;
  for (const r of [...p.requirements, ...p.wbs])
    if (r.changeId === id)
      r.status = status === "Approved" ? "Approved" : "Rejected";
  return p;
}
