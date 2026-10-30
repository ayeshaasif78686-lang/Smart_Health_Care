import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app.js";
import { jsonStore } from "../src/json-store.js";
const dir = path.dirname(fileURLToPath(import.meta.url));
const password =
  process.env.SEED_PASSWORD || randomBytes(9).toString("base64url");
const hash = await bcrypt.hash(password, 10);
const users = [
  ["manager", "Ayesha Khan", "Project Manager"],
  ["developer", "Ahmed Ali", "Developer"],
  ["qa", "Zainab Shah", "QA"],
].map(([id, name, role]) => ({
  id,
  email: id + "@healthcare.local",
  name,
  role,
  password: hash,
}));
const models = jsonStore(path.resolve(dir, "../data/demo-project.json"), users);
const secret = process.env.JWT_SECRET || randomBytes(48).toString("hex");
const portIndex = process.argv.indexOf("--port");
const port =
  Number(portIndex >= 0 ? process.argv[portIndex + 1] : process.env.PORT) ||
  4000;
createApp(secret, models).listen(port, "0.0.0.0", () => {
  console.log("Local JSON demo: http://localhost:" + port);
  console.log("Login: manager@healthcare.local");
  if (!process.env.SEED_PASSWORD)
    console.log("This session password: " + password);
  else console.log("Password: your configured SEED_PASSWORD");
  console.log(
    "Demo data persists in backend/data/demo-project.json. Default server uses MongoDB.",
  );
});
