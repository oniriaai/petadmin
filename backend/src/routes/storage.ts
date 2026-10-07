import { Router } from "express";
import {
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectVersionsCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client, BUCKET_NAME, B2_ENDPOINT } from "../lib/s3";
import { handleAuthzError } from "../middleware/auth";
import { storageLimiter } from "../middleware/security";
import {
  buildPetPhotoKey,
  isTenantReferableKey,
  resolveObjectKey,
  tenantOfKey,
} from "../core/storage/object-keys";
import { withVerifiedScope } from "../core/tenancy/guard";
import {
  buildChildScopeWhere,
  buildDaycareWhere,
  getRequiredDaycareId,
} from "../core/tenancy/scope";
import { prisma } from "../db";
import { z } from "zod";

export const storageRouter = Router();

// Per-tenant, not per-IP: a daycare's staff share one budget and cannot exhaust another's.
storageRouter.use(storageLimiter);

/**
 * What this endpoint signs an upload for: the pet photo, the only thing the product uploads
 * through it. It used to sign any content type the caller named, so the media bucket would
 * serve an HTML page or an SVG with script in it from a tenant's prefix.
 */
export const UPLOAD_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
] as const;
/** A phone photo is a few megabytes. The declared size is refused above this. */
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
/** The browser uploads right after asking; an hour left a signed URL usable long after. */
const UPLOAD_URL_TTL_SECONDS = 300;

const uploadUrlSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.enum(UPLOAD_CONTENT_TYPES),
  // Declared by the client, so it stops an honest mistake and not a determined caller: the
  // bucket's own cap is what bounds what a signed URL can store.
  size: z.number().int().positive().max(UPLOAD_MAX_BYTES).optional(),
  petName: z.string().min(1).max(120),
  ownerName: z.string().min(1).max(120),
});

const removeFileSchema = z.object({
  key: z.string().min(1),
});

storageRouter.post("/upload-url", async (req, res) => {
  try {
    const parsed = uploadUrlSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Solo se admiten imágenes (JPG, PNG, WebP, GIF o HEIC) de hasta 10 MB",
        errors: parsed.error.flatten(),
      });
    }

    if (!BUCKET_NAME || !B2_ENDPOINT) {
      return res.status(400).json({ message: "Storage configuration incomplete" });
    }

    const { fileName, contentType, petName, ownerName } = parsed.data;

    // Every component is sanitized inside buildPetPhotoKey, so a caller-supplied petName
    // cannot escape the pets/ prefix. Previously petName was interpolated raw.
    const key = buildPetPhotoKey({
      daycareId: getRequiredDaycareId(req),
      petName,
      ownerName,
      fileName,
    });

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: UPLOAD_URL_TTL_SECONDS,
    });
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
      return res
        .status(400)
        .json({ message: "Invalid parameters", errors: parsed.error.flatten() });
    }

    // Accepts a raw key or a full public URL; anything that does not resolve to a plausible
    // in-bucket key is refused rather than handed to the storage API.
    const key = resolveObjectKey(parsed.data.key, BUCKET_NAME ?? "", B2_ENDPOINT);
    if (!key) {
      return res.status(400).json({ message: "Referencia de archivo inválida" });
    }

    // Authorization: only an object this application actually references may be deleted.
    // Checking the database rather than the key's shape means a caller cannot delete an
    // arbitrary object by guessing its name, and it will scope to the caller's daycare
    // automatically once pets and documents carry a tenant.
    // Scoped to the caller's daycare: without this, knowing another tenant's key would be
    // enough to delete their file, since the reference check alone would still pass.
    //
    // The reference alone is not enough either: a tenant writes its own references (a pet's
    // photoUrl, a document's filePath), so it could point one at another daycare's object and
    // then "delete its own file". A key filed under a daycare belongs to that daycare only.
    const daycareId = getRequiredDaycareId(req);
    //
    // Nor is "not another daycare's" enough: anything else in the bucket (a database backup
    // under `backups/`) was deletable by pointing a pet's photo at it first.
    if (!isTenantReferableKey(key, daycareId)) {
      console.warn(`[Storage] Refused delete for a key outside the tenant's reach: ${key}`);
      return res.status(404).json({ message: "Archivo no encontrado" });
    }

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

    // A key written before tenancy carries no daycare segment, so its shape proves nothing.
    // It is deletable only while no other daycare references it.
    if (tenantOfKey(key) === null) {
      const claimedElsewhere = await withVerifiedScope(
        "looks for another tenant's reference to a pre-tenancy key; returns no data",
        async () => {
          const [pet, document] = await Promise.all([
            prisma.pet.findFirst({
              where: { photoUrl: { contains: key }, daycareId: { not: daycareId } },
              select: { id: true },
            }),
            prisma.petDocument.findFirst({
              where: { filePath: { contains: key }, pet: { daycareId: { not: daycareId } } },
              select: { id: true },
            }),
          ]);
          return Boolean(pet || document);
        },
      );
      if (claimedElsewhere) {
        console.warn(`[Storage] Refused delete for a key another tenant references: ${key}`);
        return res.status(404).json({ message: "Archivo no encontrado" });
      }
    }

    // Checked only now, so a refusal never depends on whether storage is configured.
    if (!BUCKET_NAME || !B2_ENDPOINT) {
      return res.status(400).json({ message: "Storage configuration incomplete" });
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
        console.log(
          `[Storage] Deleted ${deleteResponse.Deleted?.length || 0} versions successfully`,
        );
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
