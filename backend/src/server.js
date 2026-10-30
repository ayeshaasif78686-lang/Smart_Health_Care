import "dotenv/config";
import mongoose from "mongoose";
import { createApp } from "./app.js";
import { connectDb, mongoUri } from "./db.js";
import { User } from "./models.js";
import { createStore } from "./store.js";
import { migrateLegacy, ensureSeed } from "./seeding.js";
if (!mongoUri() || !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
  throw new Error(
    "Set MONGO_URI and JWT_SECRET (32+ characters) in backend/.env first.",
  );
try {
  await connectDb();
} catch (err) {
  console.error("\n" + err.message + "\n");
  process.exit(1);
}
console.log(
  "MongoDB connected: database '" + mongoose.connection.name + "' on " + mongoose.connection.host,
);
const store = createStore({ User });
const backup = await migrateLegacy(store);
if (backup) console.log("Legacy project migrated. Backup: " + backup);
await ensureSeed(store);
console.log("Build: healthcare-fixed-2026-10-25 | Folder: " + process.cwd());
const repaired = await store.reconcileBaseline();
if (repaired) console.log("Repaired " + repaired + " change request(s) awaiting baseline application.");
createApp(process.env.JWT_SECRET, store).listen(process.env.PORT || 4000, () =>
  console.log("Smart Healthcare running at http://localhost:" + (process.env.PORT || 4000)),
);
