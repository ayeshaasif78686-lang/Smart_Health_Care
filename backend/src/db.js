import dns from "node:dns";
import mongoose from "mongoose";

// Password ke aas paas galti se lage <  > hata deta hai, aur spaces trim karta hai.
export function cleanUri(uri) {
  return String(uri || "")
    .trim()
    .replace(/^(mongodb(?:\+srv)?:\/\/[^:/@]+:)<(.*?)>@/, "$1$2@");
}

export function explainMongoError(err) {
  const m = String(err?.message || err);
  if (/bad auth|authentication failed/i.test(m))
    return "Username ya password galat hai. Atlas > Database Access mein password reset karke backend/.env mein naya daalo.";
  if (/ENOTFOUND|querySrv|EAI_AGAIN|ECONNREFUSED.*53/i.test(m))
    return "Cluster ka DNS address resolve nahi hua. Internet check karo, DNS 8.8.8.8 set karo ya mobile hotspot try karo; aur Atlas se host dobara copy karo.";
  if (/timed out|ReplicaSetNoPrimary|not allowed|whitelist/i.test(m))
    return "Atlas ne connection allow nahi kiya. Atlas > Network Access > Add IP Address > Allow access from anywhere (0.0.0.0/0), phir 1-2 minute ruko.";
  return m;
}

export const mongoUri = () => process.env.MONGO_URI || process.env.MONGODB_URI;

export async function connectDb(rawUri = mongoUri()) {
  if (!rawUri) throw new Error("MONGO_URI backend/.env mein set nahi hai (.env.example dekho).");
  const uri = cleanUri(rawUri);
  const opts = { serverSelectionTimeoutMS: 15000 };
  // Use the database named in the URI; fall back to smart_healthcare when the URI has none.
  if (!/^mongodb(?:\+srv)?:\/\/[^/]+\/[^/?]+/.test(uri))
    opts.dbName = process.env.MONGO_DB || process.env.MONGODB_DB || "smart_healthcare";
  try {
    await mongoose.connect(uri, opts);
    return mongoose.connection;
  } catch (first) {
    let last = first;
    if (
      uri.startsWith("mongodb+srv://") &&
      /ENOTFOUND|querySrv|EAI_AGAIN|ECONNREFUSED|ETIMEOUT/i.test(String(first.message))
    ) {
      console.log("DNS masla mila. Google DNS (8.8.8.8) ke saath dobara koshish...");
      dns.setServers(["8.8.8.8", "1.1.1.1"]);
      try {
        await mongoose.disconnect().catch(() => {});
        await mongoose.connect(uri, opts);
        return mongoose.connection;
      } catch (second) {
        last = second;
      }
    }
    const e = new Error(
      "MongoDB connect nahi hua: " + explainMongoError(last) + "\n(technical: " + String(last.message).split("\n")[0] + ")",
    );
    e.cause = last;
    throw e;
  }
}
