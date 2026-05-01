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
  petId: z.string().min(1),
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

    const { fileName, contentType, petId } = parsed.data;
    
    // Naming convention: pets/{petId}/{timestamp}-{sanitizedFileName}
    const timestamp = Date.now();
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const key = `pets/${petId}/${timestamp}-${cleanFileName}`;
    
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

    if (!BUCKET_NAME) {
      return res.status(400).json({ message: "Storage configuration incomplete" });
    }

    const { key } = parsed.data;

    // Extract bucket name from full URL if provided (e.g., "https://bucket.s3.region.amazonaws.com/key")
    let fileKey = key;
    if (key.startsWith("https://")) {
      const urlParts = key.split("/");
      fileKey = urlParts.slice(4).join("/");
    }

    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileKey,
    });

    await s3Client.send(command);
    res.json({ ok: true, message: "File deleted successfully" });
  } catch (error) {
    console.error("Error deleting file from B2:", error);
    res.status(500).json({ message: "Error deleting file" });
  }
});
