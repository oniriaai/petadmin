import { DeleteObjectsCommand, ListObjectVersionsCommand } from "@aws-sdk/client-s3";

import { BUCKET_NAME, s3Client } from "../../lib/s3";
import { daycarePrefix } from "./object-keys";

/**
 * Removes every object under one daycare's prefix.
 *
 * Offboarding a client means its files go too, and `daycares/{id}/` is exactly the prefix
 * `buildPetPhotoKey` writes under, so the whole tenant is one listing.
 *
 * Versions AND delete markers are removed, not just current objects: the bucket is versioned
 * (see the single-object deletion in routes/storage.ts), so deleting the current version alone
 * leaves the content recoverable — which is not what "we deleted your data" should mean.
 */

export interface PrefixDeletionResult {
  prefix: string;
  deleted: number;
  /** Set when storage is not configured, or the provider refused; the DB work is unaffected. */
  error?: string;
}

const BATCH = 1000;

export async function deleteDaycarePrefix(daycareId: string): Promise<PrefixDeletionResult> {
  const prefix = daycarePrefix(daycareId);

  if (!BUCKET_NAME) {
    return { prefix, deleted: 0, error: "Almacenamiento no configurado (B2_BUCKET_NAME)" };
  }

  let deleted = 0;
  let keyMarker: string | undefined;
  let versionMarker: string | undefined;

  try {
    do {
      const listing = await s3Client.send(
        new ListObjectVersionsCommand({
          Bucket: BUCKET_NAME,
          Prefix: prefix,
          MaxKeys: BATCH,
          KeyMarker: keyMarker,
          VersionIdMarker: versionMarker,
        }),
      );

      const objects = [
        ...(listing.Versions ?? []),
        ...(listing.DeleteMarkers ?? []),
      ]
        .filter((entry) => entry.Key)
        .map((entry) => ({ Key: entry.Key as string, VersionId: entry.VersionId }));

      if (objects.length > 0) {
        const result = await s3Client.send(
          new DeleteObjectsCommand({
            Bucket: BUCKET_NAME,
            Delete: { Objects: objects, Quiet: true },
          }),
        );
        deleted += objects.length - (result.Errors?.length ?? 0);
        if (result.Errors?.length) {
          return {
            prefix,
            deleted,
            error: `El proveedor rechazó ${result.Errors.length} objeto(s): ${result.Errors[0]?.Message ?? "sin detalle"}`,
          };
        }
      }

      // IsTruncated with the markers is how a prefix larger than one page is walked.
      keyMarker = listing.IsTruncated ? listing.NextKeyMarker : undefined;
      versionMarker = listing.IsTruncated ? listing.NextVersionIdMarker : undefined;
    } while (keyMarker || versionMarker);

    return { prefix, deleted };
  } catch (error) {
    return {
      prefix,
      deleted,
      error: error instanceof Error ? error.message : "Error desconocido al borrar archivos",
    };
  }
}
