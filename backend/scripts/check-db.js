import "dotenv/config";
import mongoose from "mongoose";
import { connectDb } from "../src/db.js";
import { ALL_MODELS } from "../src/models.js";
try {
  await connectDb();
  await mongoose.connection.db.admin().ping();
  console.log("OK: MongoDB connected.");
  console.log("Database: " + mongoose.connection.name);
  for (const [name, Model] of Object.entries(ALL_MODELS))
    console.log("  " + Model.collection.name.padEnd(16) + String(await Model.estimatedDocumentCount()).padStart(4) + " documents");
  await mongoose.disconnect();
} catch (err) {
  console.error("\nFAILED: " + err.message + "\n");
  process.exit(1);
}
