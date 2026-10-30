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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "healthcare-test-"));
const file = path.join(dir, "data.json");
const secret = "local-adapter-integration-test-secret";
let app, users;
const token = jwt.sign({ name: "Manager", role: "Project Manager" }, secret);
const dev = jwt.sign({ name: "Developer", role: "Developer" }, secret);
function reset() {
  fs.writeFileSync(file, JSON.stringify({ ...seedData(), __v: 0 }));
  app = createApp(secret, jsonStore(file, users));
}
const get = () =>
  request(app)
    .get("/api/project?date=2026-10-24")
    .set("Authorization", "Bearer " + token);
before(async () => {
  users = [
    {
      id: "manager",
      email: "test@example.com",
      name: "Manager",
      role: "Project Manager",
      password: await bcrypt.hash("test-password", 4),
    },
  ];
  reset();
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));
test("LOCAL TC01 creates and retrieves demo project", async () => {
  reset();
  const r = await get();
  assert.equal(r.status, 200);
  assert.equal(r.body.summary.evm.AC, 3200000);
});
test("LOCAL TC14 data persists across adapter/API recreation", async () => {
  reset();
  await request(app)
    .put("/api/project")
    .set("Authorization", "Bearer " + token)
    .send({ version: 0, data: { name: "Persisted project" } })
    .expect(200);
  app = createApp(secret, jsonStore(file, users));
  assert.equal((await get()).body.data.name, "Persisted project");
});
test("LOCAL TC15 unauthorized approval rejected", async () => {
  reset();
  await request(app)
    .post("/api/changes/CR-001/decision")
    .set("Authorization", "Bearer " + dev)
    .send({ version: 0, status: "Approved", comments: "Attempt" })
    .expect(403);
  assert.equal((await get()).body.summary.baseline.budget, 5000000);
});
test("LOCAL atomic approval and double approval prevention", async () => {
  reset();
  const payload = { version: 0, status: "Approved", comments: "Accepted" };
  const rs = await Promise.all(
    [1, 2].map(() =>
      request(app)
        .post("/api/changes/CR-001/decision")
        .set("Authorization", "Bearer " + token)
        .send(payload),
    ),
  );
  assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409]);
  const p = (await get()).body;
  assert.equal(p.summary.baseline.budget, 5800000);
  assert.equal(
    p.data.audit.filter((a) => a.action === "Approved change CR-001").length,
    1,
  );
});
test("LOCAL invalid cost and referenced delete blocked", async () => {
  reset();
  await request(app)
    .post("/api/costs")
    .set("Authorization", "Bearer " + token)
    .send({
      version: 0,
      data: {
        title: "Invalid",
        amount: -10,
        taskId: "T-01",
        date: "2026-10-24",
      },
    })
    .expect(400);
  await request(app)
    .delete("/api/tasks/T-01")
    .set("Authorization", "Bearer " + token)
    .send({ version: 0 })
    .expect(400);
});
test("LOCAL login and protected endpoints", async () => {
  await request(app).get("/api/project").expect(401);
  await request(app)
    .post("/api/login")
    .send({ email: "test@example.com", password: "wrong" })
    .expect(401);
  await request(app)
    .post("/api/login")
    .send({ email: "test@example.com", password: "test-password" })
    .expect(200);
});
test("LOCAL risk CRUD and stale write rejection", async () => {
  reset();
  const r = await request(app)
    .post("/api/risks")
    .set("Authorization", "Bearer " + token)
    .send({
      version: 0,
      data: { title: "Risk test", likelihood: 2, impact: 3, status: "Open" },
    })
    .expect(200);
  const id = r.body.data.risks.at(-1).id;
  await request(app)
    .put("/api/risks/" + id)
    .set("Authorization", "Bearer " + token)
    .send({ version: 0, data: { title: "Stale" } })
    .expect(409);
  const edit = await request(app)
    .put("/api/risks/" + id)
    .set("Authorization", "Bearer " + token)
    .send({ version: 1, data: { title: "Updated" } })
    .expect(200);
  await request(app)
    .delete("/api/risks/" + id)
    .set("Authorization", "Bearer " + token)
    .send({ version: edit.body.data.__v })
    .expect(200);
});
