import fs from "node:fs";
import readline from "node:readline/promises";
import { randomBytes } from "node:crypto";
if (fs.existsSync(".env")) {
  console.log("backend/.env already exists and was preserved.");
  process.exit(0);
}
let uri = "mongodb://127.0.0.1:27017/smart_healthcare";
if (process.stdin.isTTY) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (
    await rl.question(
      "Paste your MongoDB Atlas MONGO_URI (mongodb+srv://...) or press Enter for local MongoDB: ",
    )
  ).trim();
  rl.close();
  if (answer) uri = answer.replace(/^MONGO(?:DB)?_URI=/, "").replace(/^"|"$/g, "");
}
const password = randomBytes(9).toString("base64url");
fs.writeFileSync(
  ".env",
  `MONGO_URI=${uri}\nJWT_SECRET=${randomBytes(48).toString("hex")}\nSEED_PASSWORD=${password}\nPORT=4000\nFRONTEND_ORIGIN=http://localhost:5173\n`,
);
console.log("Created backend/.env (it is git-ignored). Login: manager@healthcare.local");
console.log("Your generated password: " + password);
console.log("Keep this password. You can also find it in backend/.env under SEED_PASSWORD.");
