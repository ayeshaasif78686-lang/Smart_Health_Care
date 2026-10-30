import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import request from "supertest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { User } from "../src/models.js";
import { createStore } from "../src/store.js";
import { createApp } from "../src/app.js";
import { seedData } from "../src/seed-data.js";
import { startDb, connect, freshDatabase } from "./helpers.js";

let db, store, app, token, dev;
const secret = "integration-test-secret-for-healthcare-only";
before(async () => {
  db = await startDb("healthcare_api_test");
  await connect(db);
  token = jwt.sign({ name: "Manager", role: "Project Manager" }, secret);
  dev = jwt.sign({ name: "Developer", role: "Developer" }, secret);
});
after(async () => {
  await mongoose.disconnect();
  await db?.stop();
});
const get = () =>
  request(app).get("/api/project?date=2026-10-24").set("Authorization", "Bearer " + token);
async function reset() {
  await freshDatabase();
  await User.create({
    email: "test@example.com",
    name: "Manager",
    role: "Project Manager",
    password: await bcrypt.hash("test-password", 4),
  });
  store = createStore({ User });
  await store.createFromAggregate(seedData());
  app = createApp(secret, store);
}

test("TC01 create and retrieve persisted project", async () => {
  await reset();
  const r = await get();
  assert.equal(r.status, 200);
  assert.equal(r.body.data.name, "Smart Healthcare Project");
  assert.equal(r.body.summary.evm.AC, 3200000);
});
test("TC14 data persists after API recreation and database reconnection", async () => {
  await reset();
  const p = (await get()).body.data;
  await request(app)
    .put("/api/project")
    .set("Authorization", "Bearer " + token)
    .send({ version: p.__v, data: { name: "Persistent name" } })
    .expect(200);
  await mongoose.disconnect();
  await connect(db);
  app = createApp(secret, createStore({ User }));
  assert.equal((await get()).body.data.name, "Persistent name");
});
test("TC15 unauthorized user cannot approve changes", async () => {
  await reset();
  await request(app)
    .post("/api/changes/CR-001/decision")
    .set("Authorization", "Bearer " + dev)
    .send({ version: 0, status: "Approved", comments: "Attempt" })
    .expect(403);
  assert.equal((await get()).body.summary.baseline.budget, 5000000);
});
test("Concurrent approvals have exactly one winner", async () => {
  await reset();
  const payload = { version: 0, status: "Approved", comments: "Approved" };
  const results = await Promise.all(
    [1, 2].map(() =>
      request(app).post("/api/changes/CR-001/decision").set("Authorization", "Bearer " + token).send(payload),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const p = (await get()).body;
  assert.equal(p.summary.baseline.budget, 5800000);
  assert.equal(p.summary.baseline.weeks, 19);
  assert.equal(p.data.audit.filter((a) => a.action === "Approved change CR-001").length, 1);
  assert.equal((await store.baselineIntegrity()).ok, true);
});
test("Invalid cost and deletion of referenced task rejected", async () => {
  await reset();
  await request(app)
    .post("/api/costs")
    .set("Authorization", "Bearer " + token)
    .send({ version: 0, data: { title: "Invalid", amount: -100, taskId: "T-01", date: "2026-10-24" } })
    .expect(400);
  await request(app)
    .delete("/api/tasks/T-01")
    .set("Authorization", "Bearer " + token)
    .send({ version: 0 })
    .expect(400);
});
test("Login and authentication", async () => {
  await reset();
  await request(app).get("/api/project").expect(401);
  await request(app).post("/api/login").send({ email: "test@example.com", password: "wrong" }).expect(401);
  const r = await request(app).post("/api/login").send({ email: "test@example.com", password: "test-password" }).expect(200);
  assert.ok(r.body.data.token);
});
test("Risk CRUD persists create update and delete", async () => {
  await reset();
  const r = await request(app)
    .post("/api/risks")
    .set("Authorization", "Bearer " + token)
    .send({ version: 0, data: { title: "New risk", likelihood: 2, impact: 3, status: "Open" } })
    .expect(200);
  const p = r.body.data, id = p.risks.at(-1).id;
  const edited = await request(app)
    .put("/api/risks/" + id)
    .set("Authorization", "Bearer " + token)
    .send({ version: p.__v, data: { title: "Updated risk" } })
    .expect(200);
  assert.equal(edited.body.data.risks.find((x) => x.id === id).title, "Updated risk");
  await request(app)
    .delete("/api/risks/" + id)
    .set("Authorization", "Bearer " + token)
    .send({ version: edited.body.data.__v })
    .expect(200);
  assert.equal((await get()).body.data.risks.length, 7);
});
test("Stale version is rejected with 409 and nothing is written", async () => {
  await reset();
  const first = await request(app)
    .post("/api/risks")
    .set("Authorization", "Bearer " + token)
    .send({ version: 0, data: { title: "A", likelihood: 2, impact: 3, status: "Open" } })
    .expect(200);
  await request(app)
    .post("/api/risks")
    .set("Authorization", "Bearer " + token)
    .send({ version: 0, data: { title: "B", likelihood: 2, impact: 3, status: "Open" } })
    .expect(409);
  assert.equal(first.body.data.risks.length, 8);
  assert.equal((await get()).body.data.risks.length, 8);
});
test("Task owner change updates assigned team member in the database", async () => {
  await reset();
  const p = (await get()).body.data;
  const t = p.tasks.find((x) => x.id === "T-03");
  const r = await request(app)
    .put("/api/tasks/T-03")
    .set("Authorization", "Bearer " + token)
    .send({ version: p.__v, data: { owner: "BE-01" } })
    .expect(200);
  assert.equal(r.body.data.tasks.find((x) => x.id === "T-03").owner, "BE-01");
  assert.equal(t.owner, "BE-02");
});
