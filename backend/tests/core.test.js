import { test } from "node:test";
import assert from "node:assert/strict";
import { seedData } from "../src/seed-data.js";
import {
  validate,
  baseline,
  decide,
  evmValues,
  summary,
  evm,
  schedule,
} from "../src/domain.js";
test("TC02 rejects a negative project budget", () => {
  const p = seedData();
  p.originalBudget = -1;
  assert.throws(() => validate(p), /non-negative/);
});
test("TC03 pending requirements never enter approved scope", () => {
  const p = seedData();
  p.requirements.at(-1).status = "Approved";
  assert.throws(() => validate(p), /approved scope/);
});
test("TC04 approval updates budget duration and scope", () => {
  const p = seedData();
  decide(p, "CR-001", "Approved", "Manager", "Accepted");
  validate(p);
  assert.equal(baseline(p).budget, 5800000);
  assert.equal(baseline(p).weeks, 19);
  assert.equal(p.requirements.at(-1).status, "Approved");
});
test("TC05 repeated approval cannot apply twice", () => {
  const p = seedData();
  decide(p, "CR-001", "Approved", "Manager", "Accepted");
  assert.throws(
    () => decide(p, "CR-001", "Approved", "Manager", "Again"),
    /already/,
  );
  assert.equal(baseline(p).budget, 5800000);
});
test("TC06 rejection preserves baseline", () => {
  const p = seedData();
  decide(p, "CR-001", "Rejected", "Manager", "Not justified");
  validate(p);
  assert.equal(baseline(p).budget, 5000000);
  assert.equal(baseline(p).weeks, 16);
});
test("TC07 predecessor scheduling constraint", () => {
  const p = seedData();
  p.tasks[1].start = "2026-09-10";
  assert.throws(() => validate(p), /must start after/);
});
test("TC08 circular dependencies rejected", () => {
  const p = seedData();
  p.tasks[0].dependencies = ["T-02"];
  assert.throws(() => validate(p), /Circular/);
});
test("TC09 supplied EVM example warnings and zero denominators", () => {
  const e = evmValues(2000000, 1500000, 1800000);
  assert.equal(e.CPI.toFixed(2), "0.83");
  assert.equal(e.SPI, 0.75);
  assert.equal(e.CV, -300000);
  assert.equal(e.SV, -500000);
  assert.ok(e.costWarning && e.scheduleWarning);
  assert.equal(evmValues(0, 0, 0).CPI, null);
});
test("TC10 invalid cost records rejected", () => {
  const p = seedData();
  p.costs[0].amount = -1;
  assert.throws(() => validate(p), /non-negative/);
  p.costs[0].amount = 1;
  p.costs[0].taskId = "missing";
  assert.throws(() => validate(p), /does not exist/);
});
test("TC11 critical unresolved defects included on dashboard", () => {
  assert.equal(summary(seedData(), "2026-10-24").critical.length, 2);
});
test("TC12 successful verification required to close defect", () => {
  const p = seedData();
  p.defects[0].status = "Closed";
  assert.throws(() => validate(p), /verification/);
  p.defects[0].verification = "Passed";
  validate(p);
});
test("TC13 risk score bounds", () => {
  const p = seedData();
  assert.equal(p.risks[0].likelihood * p.risks[0].impact, 15);
  p.risks[0].likelihood = 6;
  assert.throws(() => validate(p), /integers from 1 to 5/);
});
test("TC16 dashboard matches underlying records", () => {
  const p = seedData(),
    s = summary(p, "2026-10-24");
  assert.equal(
    s.evm.AC,
    p.costs.reduce((a, c) => a + c.amount, 0),
  );
  assert.equal(s.baseline.budget, 5000000);
});
test("Historical EVM uses dated progress only", () => {
  const p = seedData();
  assert.equal(evm(p, "2026-09-13").EV, 0);
  assert.equal(evm(p, "2026-09-14").EV, 400000);
});
test("Forecast responds to overdue work and dependent tasks", () => {
  const s = schedule(seedData(), "2026-12-25");
  assert.ok(s.delayed.length > 0);
  assert.ok(s.affected.includes("T-06"));
  assert.ok(s.deadlineAtRisk);
});
test("Invalid references WBS cycles and invalid dates rejected", () => {
  let p = seedData();
  p.team = p.team.filter((t) => t.id !== "PM-01");
  assert.throws(() => validate(p), /Team member/);
  p = seedData();
  p.wbs[0].parent = "1.1";
  assert.throws(() => validate(p), /Circular/);
  p = seedData();
  p.tasks[0].end = "2026-02-30";
  assert.throws(() => validate(p), /valid date/);
});
