import { S3Client } from "@aws-sdk/client-s3";

const bucketName = process.env.B2_BUCKET_NAME;
const endpoint = process.env.B2_ENDPOINT;
const region = process.env.B2_REGION || "us-east-005";
const accessKeyId = process.env.B2_KEY_ID;
const secretAccessKey = process.env.B2_APPLICATION_KEY;

if (!bucketName || !endpoint || !accessKeyId || !secretAccessKey) {
  console.warn("B2 storage configuration is incomplete. Uploads may fail.");
}

export const s3Client = new S3Client({
  endpoint: `https://${endpoint}`,
  region,
  credentials: {
    accessKeyId: accessKeyId || "",
    secretAccessKey: secretAccessKey || "",
  },
  forcePathStyle: true, // Use path-style URLs for better compatibility
});

export const BUCKET_NAME = bucketName;
export const B2_ENDPOINT = endpoint;
