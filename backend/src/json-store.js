// Optional local demonstration adapter. Production/default server uses Mongoose.
import fs from "node:fs";
import path from "node:path";
import { seedData } from "./seed-data.js";
export function jsonStore(file, users) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file))
    fs.writeFileSync(file, JSON.stringify({ ...seedData(), __v: 0 }, null, 2));
  const read = () => JSON.parse(fs.readFileSync(file, "utf8"));
  return {
    Project: {
      async findOne() {
        const value = read();
        let local = structuredClone(value);
        return {
          toObject() {
            return structuredClone(local);
          },
          set(p) {
            local = structuredClone(p);
          },
          async save() {
            const current = read();
            if (current.__v !== value.__v) {
              const e = new Error("Concurrent update");
              e.name = "VersionError";
              throw e;
            }
            local.__v = current.__v + 1;
            const tmp = file + ".tmp";
            fs.writeFileSync(tmp, JSON.stringify(local, null, 2));
            fs.renameSync(tmp, file);
          },
        };
      },
    },
    User: {
      async findOne({ email }) {
        return users.find((u) => u.email === email);
      },
    },
  };
}
