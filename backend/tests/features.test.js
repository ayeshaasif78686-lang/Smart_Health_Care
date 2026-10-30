import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { jsonStore } from "../src/json-store.js";
import { createApp } from "../src/app.js";
import { seedData } from "../src/seed-data.js";
import { validate, decide, evm, evmValues, changeImpact, tasksForChange, summary } from "../src/domain.js";

test("TC17 EVM forecasts EAC, ETC, VAC and flags a forecast overrun", () => {
  const r = evmValues(2000000, 1500000, 1800000, 0.9, 5000000);
  assert.equal(Math.round(r.CPI * 100), 83);
  assert.equal(Math.round(r.EAC), 6000000); // 5,000,000 / (1.5/1.8)
  assert.equal(Math.round(r.ETC), 4200000);
  assert.equal(Math.round(r.VAC), -1000000);
  assert.equal(r.overrunForecast, true);
  assert.equal(r.budgetExceeded, false);
  assert.equal(evmValues(0, 0, 0, 0.9, 5000000).EAC, null); // zero AC: no divide by zero
});
test("TC17b seeded project reports BAC and an exceeded budget when AC > BAC", () => {
  const p = seedData();
  assert.equal(evm(p, "2026-10-24").BAC, 5000000);
  p.costs.push({ id: "C-99", title: "Overspend", taskId: "T-03", amount: 2000000, date: "2026-10-24" });
  assert.equal(evm(p, "2026-10-24").budgetExceeded, true);
});
test("TC18 change impact shows before/after for a pending change and the current baseline", () => {
  const p = seedData();
  const i = changeImpact(p);
  assert.equal(i.original.budget, 5000000);
  assert.equal(i.changes[0].projected.budget, 5800000);
  assert.equal(i.changes[0].projected.weeks, 19);
  assert.equal(i.changes[0].projected.deadline, "2027-01-11");
  assert.equal(i.changes[0].requirements, 2);
  decide(p, "CR-001", "Approved", "Manager", "OK");
  const after = changeImpact(p);
  assert.equal(after.current.budget, 5800000);
  assert.equal(after.unallocatedBudget, 800000); // approved money not yet scheduled
});
test("TC19 generating tasks for an approved change absorbs cost and schedule", () => {
  const p = seedData();
  assert.throws(() => tasksForChange(p, "CR-001"), /approved change/);
  decide(p, "CR-001", "Approved", "Manager", "OK");
  const created = tasksForChange(p, "CR-001");
  assert.equal(created.length, 2);
  assert.equal(created.reduce((s, t) => s + t.plannedCost, 0), 800000);
  validate(p); // dependencies, WBS approval and change link all valid
  assert.ok(created.every((t) => t.end <= "2027-01-11"));
  assert.equal(changeImpact(p).unallocatedBudget, 0);
  assert.throws(() => tasksForChange(p, "CR-001"), /without tasks/); // idempotent
  assert.equal(summary(p, "2026-10-24").schedule.deadlineAtRisk, false);
});
test("TC20 defect and quality links must reference existing records", () => {
  const p = seedData();
  validate(p);
  p.defects[0].taskId = "T-99";
  assert.throws(() => validate(p), /Related task/);
  p.defects[0].taskId = "T-03";
  p.quality[0].wbsId = "9.9";
  assert.throws(() => validate(p), /Deliverable/);
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "healthcare-feat-"));
const file = path.join(dir, "data.json");
const secret = "features-test-secret";
const mgr = "Bearer " + jwt.sign({ name: "Manager", role: "Project Manager" }, secret);
const dev = "Bearer " + jwt.sign({ name: "Dev", role: "Developer" }, secret);
let app;
before(async () => {
  const users = [{ id: "m", email: "t@e.com", name: "Manager", role: "Project Manager", password: await bcrypt.hash("x", 4) }];
  fs.writeFileSync(file, JSON.stringify({ ...seedData(), __v: 0 }));
  app = createApp(secret, jsonStore(file, users));
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));
test("TC21 API: generate-tasks needs manager role and an approved change, then works once", async () => {
  await request(app).post("/api/changes/CR-001/generate-tasks").set("Authorization", mgr).send({ version: 0 }).expect(409);
  await request(app).post("/api/changes/CR-001/decision").set("Authorization", mgr).send({ version: 0, status: "Approved", comments: "Approved" }).expect(200);
  const v = (await request(app).get("/api/project").set("Authorization", mgr)).body.data.__v;
  await request(app).post("/api/changes/CR-001/generate-tasks").set("Authorization", dev).send({ version: v }).expect(403);
  const r = await request(app).post("/api/changes/CR-001/generate-tasks").set("Authorization", mgr).send({ version: v }).expect(200);
  assert.equal(r.body.created, 2);
  const p = (await request(app).get("/api/project?date=2026-10-24").set("Authorization", mgr)).body;
  assert.equal(p.summary.impact.unallocatedBudget, 0);
  assert.equal(p.data.tasks.length, 9);
});
test("TC22 API: a Passed/Failed quality check needs reviewer, date and actual result", async () => {
  const get = async () => (await request(app).get("/api/project").set("Authorization", mgr)).body.data;
  let p = await get();
  const id = p.quality[0].id;
  const bad = await request(app).put("/api/quality/" + id).set("Authorization", mgr).send({ version: p.__v, data: { status: "Passed" } });
  assert.equal(bad.status, 400);
  p = await get();
  const ok = await request(app).put("/api/quality/" + id).set("Authorization", mgr)
    .send({ version: p.__v, data: { status: "Passed", reviewer: "Zainab Shah", date: "2026-10-25", actualResult: "12/12 cases passed" } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
});
