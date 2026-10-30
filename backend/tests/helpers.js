import mongoose from "mongoose";
import { ALL_MODELS } from "../src/models.js";
import { resetTransactionDetection } from "../src/store.js";

// Use TEST_MONGO_URI (e.g. a local replica set or an Atlas test cluster) when set,
// otherwise start a throw-away in-memory replica set (supports transactions like Atlas).
export async function startDb(dbName) {
  if (process.env.TEST_MONGO_URI)
    return { uri: process.env.TEST_MONGO_URI, dbName, stop: async () => {} };
  const { MongoMemoryReplSet } = await import("mongodb-memory-server");
  const rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  return { uri: rs.getUri(), dbName, stop: () => rs.stop() };
}
export async function connect(db) {
  await mongoose.connect(db.uri, { dbName: db.dbName });
  resetTransactionDetection();
}
export async function freshDatabase() {
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(ALL_MODELS).map((m) => m.createIndexes()));
}
