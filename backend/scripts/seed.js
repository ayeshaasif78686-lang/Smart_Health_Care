import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { ALL_MODELS, User } from "../src/models.js";
import { ensureSeed, migrateLegacy } from "../src/seeding.js";
import { connectDb, mongoUri } from "../src/db.js";
import { createStore } from "../src/store.js";

if (!mongoUri() || !process.env.SEED_PASSWORD || process.env.SEED_PASSWORD.length < 10)
  throw new Error("Set MONGO_URI and SEED_PASSWORD (10+ characters) in backend/.env.");
try {
  await connectDb();
} catch (err) {
  console.error("\n" + err.message + "\n");
  process.exit(1);
}
const db = mongoose.connection.db;
const dbName = mongoose.connection.name;
console.log("Connected to database: " + dbName);

// Optional, explicit reset of the project collections only (never users, never other databases).
if (process.argv.includes("--reset")) {
  if (process.env.CONFIRM_RESET !== dbName) {
    console.error(`Refusing to reset. Re-run with CONFIRM_RESET=${dbName} to confirm.`);
    process.exit(1);
  }
  for (const [name, Model] of Object.entries(ALL_MODELS))
    if (name !== "User") await Model.collection.deleteMany({});
  console.log("Project collections cleared (users kept).");
}

const store = createStore({ User });
const backup = await migrateLegacy(store);
if (backup) console.log(`Legacy embedded project migrated to separate collections (old data kept in '${backup}').`);

for (const Model of Object.values(ALL_MODELS)) await Model.createIndexes();
if (await ensureSeed(store)) console.log("Demo project created in 15 collections.");
else console.log("Existing project preserved (seed is safe to re-run).");
const fixed = await store.reconcileBaseline();
if (fixed) console.log("Applied " + fixed + " approved change(s) missing from the baseline.");
const integrity = await store.baselineIntegrity();
console.log(
  `Baseline original PKR ${integrity.original.budget.toLocaleString("en-US")} / ${integrity.original.weeks} weeks; ` +
    `current PKR ${integrity.stored.budget.toLocaleString("en-US")} / ${integrity.stored.weeks} weeks (${integrity.ok ? "consistent" : "INCONSISTENT"}).`,
);

for (const [email, name, role] of [
  ["manager@healthcare.local", "Ayesha Khan", "Project Manager"],
  ["developer@healthcare.local", "Ahmed Ali", "Developer"],
  ["qa@healthcare.local", "Zainab Shah", "QA"],
])
  if (!(await User.exists({ email })))
    await User.create({ email, name, role, password: await bcrypt.hash(process.env.SEED_PASSWORD, 12) });
console.log("Demo users ready. Password is your SEED_PASSWORD. Existing passwords preserved.");
await mongoose.disconnect();
