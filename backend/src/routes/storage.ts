import { Router } from "express";
import { 
  PutObjectCommand, 
  DeleteObjectCommand,
  ListObjectVersionsCommand,
  DeleteObjectsCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client, BUCKET_NAME, B2_ENDPOINT } from "../lib/s3";
import { handleAuthzError } from "../middleware/auth";
import { buildPetPhotoKey, resolveObjectKey } from "../core/storage/object-keys";
import { buildChildScopeWhere, buildDaycareWhere, getRequiredDaycareId } from "../core/tenancy/scope";
import { prisma } from "../db";
import { z } from "zod";

export const storageRouter = Router();

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

    // Every component is sanitized inside buildPetPhotoKey, so a caller-supplied petName
    // cannot escape the pets/ prefix. Previously petName was interpolated raw.
    const key = buildPetPhotoKey({ daycareId: getRequiredDaycareId(req), petName, ownerName, fileName });
    
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    const publicUrl = `https://${B2_ENDPOINT}/${BUCKET_NAME}/${key}`;

    res.json({ uploadUrl, publicUrl, key });
  } catch (error) {
    if (handleAuthzError(res, error)) return;
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

    // Accepts a raw key or a full public URL; anything that does not resolve to a plausible
    // in-bucket key is refused rather than handed to the storage API.
    const key = resolveObjectKey(parsed.data.key, BUCKET_NAME, B2_ENDPOINT);
    if (!key) {
      return res.status(400).json({ message: "Referencia de archivo inválida" });
    }

    // Authorization: only an object this application actually references may be deleted.
    // Checking the database rather than the key's shape means a caller cannot delete an
    // arbitrary object by guessing its name, and it will scope to the caller's daycare
    // automatically once pets and documents carry a tenant.
    // Scoped to the caller's daycare: without this, knowing another tenant's key would be
    // enough to delete their file, since the reference check alone would still pass.
    const [referencingPet, referencingDocument] = await Promise.all([
      prisma.pet.findFirst({
        where: { photoUrl: { contains: key }, ...buildDaycareWhere(req) },
        select: { id: true },
      }),
      prisma.petDocument.findFirst({
        where: { filePath: { contains: key }, ...buildChildScopeWhere(req, "pet") },
        select: { id: true },
      }),
    ]);
    if (!referencingPet && !referencingDocument) {
      console.warn(`[Storage] Refused delete for unreferenced key: ${key}`);
      return res.status(404).json({ message: "Archivo no encontrado" });
    }

    console.log(`[Storage] Deleting file from B2: bucket=${BUCKET_NAME}, key=${key}`);

    // Handle versioned buckets: list all versions/delete markers and delete them all
    // This prevents delete markers from appearing while old versions remain
    try {
      const listVersionsCmd = new ListObjectVersionsCommand({
        Bucket: BUCKET_NAME,
        Prefix: key,
        MaxKeys: 100,
      });

      const listResponse = await s3Client.send(listVersionsCmd);
      
      // Collect all versions and delete markers for this key
      const objectsToDelete: Array<{ Key: string; VersionId?: string }> = [];
      
      if (listResponse.Versions) {
        for (const version of listResponse.Versions) {
          if (version.Key === key) {
            objectsToDelete.push({
              Key: key,
              VersionId: version.VersionId,
            });
          }
        }
      }
      
      if (listResponse.DeleteMarkers) {
        for (const marker of listResponse.DeleteMarkers) {
          if (marker.Key === key) {
            objectsToDelete.push({
              Key: key,
              VersionId: marker.VersionId,
            });
          }
        }
      }

      // If versioning is enabled, we found multiple versions/markers
      if (objectsToDelete.length > 0) {
        console.log(`[Storage] Found ${objectsToDelete.length} versions for key: ${key}`);
        
        const deleteCmd = new DeleteObjectsCommand({
          Bucket: BUCKET_NAME,
          Delete: { Objects: objectsToDelete },
        });
        
        const deleteResponse = await s3Client.send(deleteCmd);
        console.log(`[Storage] Deleted ${deleteResponse.Deleted?.length || 0} versions successfully`);
      } else {
        // Non-versioned bucket or key doesn't exist - use simple delete
        console.log(`[Storage] No versions found (non-versioned bucket), using simple delete`);
        const simpleDeleteCmd = new DeleteObjectCommand({
          Bucket: BUCKET_NAME,
          Key: key,
        });
        await s3Client.send(simpleDeleteCmd);
      }
    } catch (versionError) {
      console.error("Error handling versioned deletion:", versionError);
      // Fallback to simple delete if version listing fails
      console.log(`[Storage] Falling back to simple delete`);
      const fallbackCmd = new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      });
      await s3Client.send(fallbackCmd);
    }

    res.json({ ok: true, message: "File deleted successfully" });
  } catch (error) {
    if (handleAuthzError(res, error)) return;
    console.error("Error deleting file from B2:", error);
    res.status(500).json({ message: "Error deleting file" });
  }
});
