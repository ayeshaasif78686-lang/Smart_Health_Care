import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { User as MongoUser } from "./models.js";
import { createStore } from "./store.js";
import { groups, validate, summary, decide, tasksForChange, fail } from "./domain.js";
export function createApp(
  secret,
  models = createStore({ User: MongoUser }),
) {
  const { Project, User } = models;
  const app = express();
  app.use(
    cors({ origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173" }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.get("/api/health", (req, res) => res.json({
    build: "healthcare-fixed-2026-10-25", storage: models.decideChange ? "MongoDB" : "JSON demo"
  }));
  const wrap = (f) => (req, res, next) =>
    Promise.resolve(f(req, res)).catch(next);
  const attempts = new Map();
  app.post(
    "/api/login",
    wrap(async (req, res) => {
      const ip = req.ip;
      const old = attempts.get(ip);
      const a =
        old && Date.now() - old.time < 60000
          ? old
          : { count: 0, time: Date.now() };
      attempts.set(ip, a);
      if (++a.count > 20)
        fail("Too many attempts. Try again in a minute.", 429);
      const u = await User.findOne({ email: String(req.body.email || "").trim().toLowerCase() });
      if (!u || !(await bcrypt.compare(req.body.password || "", u.password)))
        fail("Incorrect email or password.", 401);
      res.json({
        data: {
          token: jwt.sign({ id: u.id, name: u.name, role: u.role }, secret, {
            expiresIn: "8h",
          }),
          user: { name: u.name, role: u.role },
        },
      });
    }),
  );
  app.use("/api", (req, res, next) => {
    try {
      req.user = jwt.verify(
        (req.headers.authorization || "").replace(/^Bearer /, ""),
        secret,
      );
      next();
    } catch {
      res.status(401).json({ error: "Please sign in again." });
    }
  });
  const manager = (req) => {
    if (req.user.role !== "Project Manager")
      fail("Only a Project Manager can perform this action.", 403);
  };
  const load = async () => {
    const d = await Project.findOne();
    if (!d) fail("No project. Run npm run seed first.", 404);
    return d;
  };
  const mutate = async (req, action, fn) => {
    const d = await load();
    const p = d.toObject({ flattenMaps: true });
    if (req.body.version !== p.__v)
      fail("Data changed. Refresh and try again.", 409);
    fn(p);
    validate(p);
    p.audit.unshift({
      id: randomUUID(),
      date: new Date().toISOString(),
      actor: req.user.name,
      action,
    });
    // Never round-trip Mongoose-managed immutable timestamps through Document.set().
    // The repository/database retains the originals; timestamps are not user-editable.
    const { createdAt, updatedAt, _id, ...editable } = p;
    d.set(editable);
    await d.save();
    return d.toObject({ flattenMaps: true });
  };
  app.get(
    "/api/project",
    wrap(async (req, res) => {
      const d = await load();
      const p = d.toObject({ flattenMaps: true });
      res.json({
        data: p,
        summary: summary(
          p,
          req.query.date || new Date().toISOString().slice(0, 10),
        ),
      });
    }),
  );
  app.put(
    "/api/project",
    wrap(async (req, res) => {
      manager(req);
      const fields = [
        "name",
        "description",
        "manager",
        "hospitals",
        "objectives",
        "businessNeed",
        "scope",
        "deliverables",
        "assumptions",
        "constraints",
        "plan",
        "status",
        "threshold",
        "closure",
      ];
      res.json({
        data: await mutate(req, "Updated project charter / plan", (p) => {
          for (const k of fields)
            if (req.body.data[k] !== undefined) p[k] = req.body.data[k];
          if (p.closure?.date) {
            p.closure.finalCost = p.costs.reduce((s, c) => s + c.amount, 0);
          }
        }),
      });
    }),
  );
  app.post(
    "/api/changes/:id/decision",
    wrap(async (req, res) => {
      manager(req);
      if (models.decideChange)
        return res.json({
          data: await models.decideChange({
            id: req.params.id,
            status: req.body.status,
            actor: req.user.name,
            comments: req.body.comments,
          }),
        });
      res.json({
        data: await mutate(
          req,
          `${req.body.status} change ${req.params.id}`,
          (p) =>
            decide(
              p,
              req.params.id,
              req.body.status,
              req.user.name,
              req.body.comments,
            ),
        ),
      });
    }),
  );
  // Creates schedule tasks (with cost and dependency) for the approved work packages of an
  // approved change request, so the schedule and budget visibly absorb the change.
  app.post(
    "/api/changes/:id/generate-tasks",
    wrap(async (req, res) => {
      manager(req);
      let created = [];
      const data = await mutate(
        req,
        `Generated tasks for change ${req.params.id}`,
        (p) => {
          created = tasksForChange(p, req.params.id);
        },
      );
      res.json({ data, created: created.length });
    }),
  );
  app.get(
    "/api/:group",
    wrap(async (req, res) => {
      const g = req.params.group;
      if (!groups.includes(g)) fail("Unknown module.", 404);
      const p = (await load()).toObject();
      let rows = p[g];
      if (req.query.status)
        rows = rows.filter((r) => r.status === req.query.status);
      if (req.query.q)
        rows = rows.filter((r) =>
          JSON.stringify(r).toLowerCase().includes(req.query.q.toLowerCase()),
        );
      const page = Math.max(1, parseInt(req.query.page) || 1),
        limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
      res.json({
        data: rows.slice((page - 1) * limit, page * limit),
        total: rows.length,
        page,
      });
    }),
  );
  for (const method of ["post", "put", "delete"])
    app[method](
      "/api/:group/:id?",
      wrap(async (req, res) => {
        const g = req.params.group;
        if (!groups.includes(g)) fail("Unknown module.", 404);
        if (!["tasks", "defects", "quality"].includes(g)) manager(req);
        if (g === "tasks" && method !== "put") manager(req);
        if (req.user.role === "Developer" && g === "quality")
          fail("QA or Project Manager required.", 403);
        res.json({
          data: await mutate(
            req,
            `${method.toUpperCase()} ${g} ${req.params.id || req.body.data?.title || ""}`,
            (p) => {
              const rows = p[g],
                i = rows.findIndex((r) => r.id === req.params.id);
              if (method !== "post" && i < 0) fail("Record not found.", 404);
              const old = rows[i];
              if (g === "changes" && old?.status !== "Pending" && old)
                fail("Decided requests are immutable.", 409);
              if (method === "delete") {
                if (
                  g === "changes" &&
                  [...p.requirements, ...p.wbs, ...p.tasks].some(
                    (r) => r.changeId === old.id,
                  )
                )
                  fail("Remove linked proposed items first.");
                rows.splice(i, 1);
                return;
              }
              const data = { ...req.body.data };
              delete data._id;
              delete data.__v;
              delete data.createdAt;
              delete data.updatedAt;
              const stamp = new Date().toISOString();
              const r = {
                ...old,
                ...data,
                id: old?.id || randomUUID().slice(0, 8).toUpperCase(),
                createdAt: old?.createdAt || stamp,
                updatedAt: stamp,
              };
              if (g === "changes") {
                if (data.status && data.status !== "Pending")
                  fail("Use the decision action to approve or reject.");
                r.status = "Pending";
                if (!Number.isInteger(r.weeks) || r.weeks < 0)
                  fail("Schedule impact must be whole weeks.");
              }
              if (g === "quality" && ["Passed", "Failed"].includes(r.status)) {
                if (!r.reviewer?.trim() || !r.date)
                  fail("Record the reviewer and review date for an inspection result.");
                if (!r.actualResult?.trim())
                  fail("Record the actual test or inspection result.");
              }
              if (g === "tasks") {
                if (
                  req.user.role !== "Project Manager" &&
                  old &&
                  r.plannedCost !== old.plannedCost
                )
                  fail("Only Project Manager can edit planned costs.", 403);
                if (r.changeId) {
                  const c = p.changes.find((c) => c.id === r.changeId);
                  if (!c || c.status !== "Approved")
                    fail("Schedule proposed features only after approval.");
                }
                r.baselineStart = old?.baselineStart || r.start;
                r.baselineEnd = old?.baselineEnd || r.end;
                r.baselineCost = old?.baselineCost ?? r.plannedCost;
                r.progressHistory = old?.progressHistory || [];
                if (!old || old.progress !== r.progress)
                  r.progressHistory = [
                    ...r.progressHistory,
                    {
                      date: new Date().toISOString().slice(0, 10),
                      value: r.progress,
                    },
                  ];
              }
              if (method === "post") rows.push(r);
              else rows[i] = r;
            },
          ),
        });
      }),
    );
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "API route not found." }),
  );
  const dist = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../frontend/dist",
  );
  app.use(express.static(dist));
  app.get("*", (req, res) => res.sendFile(path.join(dist, "index.html")));
  app.use((err, req, res, next) => {
    const conflict = err.name === "VersionError";
    res
      .status(conflict ? 409 : err.status || 400)
      .json({
        error: conflict
          ? "Another user saved first. Refresh and retry."
          : err.message,
      });
  });
  return app;
}
