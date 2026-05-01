import { Router } from "express";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client, BUCKET_NAME, B2_ENDPOINT } from "../lib/s3";
import { requireAuth } from "../middleware/auth";
import { z } from "zod";

export const storageRouter = Router();
storageRouter.use(requireAuth);

const uploadUrlSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  petName: z.string().min(1),
  ownerName: z.string().min(1),
});

const removeFileSchema = z.object({
  key: z.string().min(1),
});

storageRouter.post("/upload-url", async (req, res) => {
  try {
    const parsed = uploadUrlSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid parameters", errors: parsed.error.flatten() });
    }

    if (!BUCKET_NAME || !B2_ENDPOINT) {
      return res.status(400).json({ message: "Storage configuration incomplete" });
    }

    const { fileName, contentType, petName, ownerName } = parsed.data;
    
    // Naming convention: pets/{petName}_{ownerName}/{timestamp}-{sanitizedFileName}
    const timestamp = Date.now();
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const sanitizedOwner = ownerName.replace(/[^a-zA-Z0-9-]/g, "_");
    const key = `pets/${petName}_${sanitizedOwner}/${timestamp}-${cleanFileName}`;
    
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    const publicUrl = `https://${B2_ENDPOINT}/${BUCKET_NAME}/${key}`;

    res.json({ uploadUrl, publicUrl, key });
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    res.status(500).json({ message: "Error generating upload URL" });
  }
});

storageRouter.post("/remove", async (req, res) => {
  try {
    const parsed = removeFileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid parameters", errors: parsed.error.flatten() });
    }

    if (!BUCKET_NAME || !B2_ENDPOINT) {
      return res.status(400).json({ message: "Storage configuration incomplete" });
    }

    let { key } = parsed.data;

    // Extract key from full URL if provided
    // Handle both B2 formats:
    // - https://bucket-name.s3.us-east-005.backblazeb2.com/pets/fluffy/123-photo.jpg
    // - https://s3.us-east-005.backblazeb2.com/bucket-name/pets/fluffy/123-photo.jpg
    if (key.startsWith("https://")) {
      try {
        const url = new URL(key);
        const pathName = url.pathname;
        
        // Remove leading slash and bucket name if present in path
        let extractedKey = pathName.startsWith("/") ? pathName.slice(1) : pathName;
        
        // If bucket name is in the path (path-style), remove it
        if (extractedKey.startsWith(BUCKET_NAME + "/")) {
          extractedKey = extractedKey.slice(BUCKET_NAME.length + 1);
        }
        
        key = extractedKey;
      } catch (urlErr) {
        console.error("URL parsing error:", urlErr);
        // Fallback: try simple split
        const parts = key.split("/");
        key = parts.slice(4).join("/");
      }
    }

    console.log(`[Storage] Deleting file from B2: bucket=${BUCKET_NAME}, key=${key}`);

    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
    res.json({ ok: true, message: "File deleted successfully" });
  } catch (error) {
    console.error("Error deleting file from B2:", error);
    res.status(500).json({ message: "Error deleting file" });
  }
});
