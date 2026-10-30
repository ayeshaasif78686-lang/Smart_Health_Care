import mongoose from "mongoose";
import { Project } from "./models.js";
import { seedData } from "./seed-data.js";
import { validate } from "./domain.js";

// Creates the demo project only when none exists. Never overwrites or deletes anything.
export async function ensureSeed(store) {
  if (await Project.exists({})) return false;
  await store.createFromAggregate(validate(seedData()));
  return true;
}

// Older versions stored the whole project as one embedded document in `projects`.
// Rename it to a backup collection (nothing is deleted), then rebuild it in normalized collections.
export async function migrateLegacy(store, db = mongoose.connection.db) {
  const legacy = await db
    .collection("projects")
    .findOne({ team: { $exists: true }, originalBaseline: { $exists: false } });
  if (!legacy) return null;
  const base = "projects_legacy_backup";
  const backup = (await db.listCollections({ name: base }).hasNext()) ? `${base}_${Date.now()}` : base;
  await db.collection("projects").rename(backup);
  const { _id, createdAt, updatedAt, __v, ...agg } = legacy;
  agg.__v = 0;
  try {
    validate(agg);
    await store.createFromAggregate(agg, { migrate: true });
  } catch (err) {
    await db.collection("projects").drop().catch(() => {});
    await db.collection(backup).rename("projects"); // restore on failure
    throw err;
  }
  return backup;
}
