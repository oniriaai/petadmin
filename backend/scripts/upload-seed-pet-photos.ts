import "dotenv/config";
import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BUCKET_NAME, B2_ENDPOINT, s3Client } from "../src/lib/s3";

type PhotoEntry = {
  petName: string;
  provider: "unsplash" | "pexels";
  sourceUrl: string;
  key: string;
  publicUrl: string;
};

const args = new Set(process.argv.slice(2));
const shouldReplace = args.has("--replace");
const mappingPath = path.resolve(__dirname, "../prisma/seed-pet-photos.json");

function inferContentType(url: string, responseType: string | null) {
  if (responseType?.startsWith("image/")) return responseType;
  const ext = path.extname(new URL(url).pathname).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

async function objectExists(key: string) {
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function uploadOne(entry: PhotoEntry) {
  if (!BUCKET_NAME || !B2_ENDPOINT) {
    throw new Error("Missing B2 configuration. Required: B2_BUCKET_NAME, B2_ENDPOINT, B2_KEY_ID, B2_APPLICATION_KEY");
  }

  const exists = await objectExists(entry.key);
  if (exists && !shouldReplace) {
    console.log(`skip ${entry.petName}: already exists (${entry.key})`);
    return { status: "skipped" as const, bytes: 0 };
  }

  const response = await fetch(entry.sourceUrl, {
    headers: {
      "User-Agent": "petadmin-seed-photo-uploader/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed downloading ${entry.petName} (${entry.sourceUrl}): ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const body = Buffer.from(arrayBuffer);
  const contentType = inferContentType(entry.sourceUrl, response.headers.get("content-type"));

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: entry.key,
      Body: body,
      ContentType: contentType,
    })
  );

  console.log(`${exists ? "replace" : "upload"} ${entry.petName}: ${entry.key} (${body.length} bytes)`);
  return { status: exists ? ("replaced" as const) : ("uploaded" as const), bytes: body.length };
}

async function main() {
  const entries = JSON.parse(readFileSync(mappingPath, "utf8")) as PhotoEntry[];

  const duplicateKeys = entries
    .map((e) => e.key)
    .filter((key, i, all) => all.indexOf(key) !== i);
  if (duplicateKeys.length > 0) {
    throw new Error(`Duplicate B2 keys found in mapping: ${duplicateKeys.join(", ")}`);
  }

  let uploaded = 0;
  let replaced = 0;
  let skipped = 0;
  let totalBytes = 0;

  for (const entry of entries) {
    const expectedUrl = `https://${B2_ENDPOINT}/${BUCKET_NAME}/${entry.key}`;
    if (entry.publicUrl !== expectedUrl) {
      entry.publicUrl = expectedUrl;
    }

    const result = await uploadOne(entry);
    totalBytes += result.bytes;
    if (result.status === "uploaded") uploaded += 1;
    if (result.status === "replaced") replaced += 1;
    if (result.status === "skipped") skipped += 1;
  }

  writeFileSync(mappingPath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");

  console.log("seed photo upload summary");
  console.log({ uploaded, replaced, skipped, totalBytes, replaceMode: shouldReplace });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
