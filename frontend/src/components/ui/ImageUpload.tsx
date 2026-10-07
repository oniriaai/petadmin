import React, { useState, useRef } from "react";
import { X, UploadCloud } from "lucide-react";
import { api } from "../../lib/api";
import { Spinner } from "./Spinner";

/** A PUT with upload progress, which `fetch` cannot report. */
function putWithProgress(url: string, file: File, onProgress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (event) => {
      onProgress(Math.round((event.loaded * 100) / (event.total || 1)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(xhr.responseText || `HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(file);
  });
}

/** Mirrors `UPLOAD_CONTENT_TYPES` and `UPLOAD_MAX_BYTES` in the backend's storage router. */
const UPLOAD_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
];
const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

interface Props {
  value?: string;
  onChange: (url: string) => void;
  folder?: string;
  onDelete?: (url: string) => Promise<void>;
  petName?: string;
  ownerName?: string;
}

export function ImageUpload({ value, onChange, onDelete, petName, ownerName }: Props) {
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState<string | null>(value || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync preview with value prop (important for editing)
  React.useEffect(() => {
    setPreview(value || null);
  }, [value]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // The server refuses the same two things; saying so here spares the round trip.
    if (!UPLOAD_CONTENT_TYPES.includes(file.type) || file.size > UPLOAD_MAX_BYTES) {
      alert("Solo se admiten imágenes (JPG, PNG, WebP, GIF o HEIC) de hasta 10 MB.");
      e.target.value = "";
      return;
    }

    // Show local preview immediately
    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);

    try {
      setUploading(true);
      setProgress(0);

      // 1. Get presigned URL
      const { uploadUrl, publicUrl } = await api.post<any>("/storage/upload-url", {
        fileName: file.name,
        contentType: file.type,
        size: file.size,
        petName: petName || "unknown",
        ownerName: ownerName || "unknown",
      });

      // 2. Upload to B2 directly
      try {
        await putWithProgress(uploadUrl, file, setProgress);
      } catch (uploadErr: any) {
        console.error("Direct B2 upload failed:", uploadErr.message);
        throw new Error("No pudimos subir el archivo al almacenamiento. Inténtalo de nuevo.");
      }

      // 3. Update with final public URL
      onChange(publicUrl);
      setPreview(publicUrl);
    } catch (error: any) {
      console.error("Upload process failed", error);
      alert(error.message || "No pudimos subir la imagen. Inténtalo de nuevo.");
      setPreview(value || null);
    } finally {
      setUploading(false);
    }
  };

  const removeImage = async (e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      setDeleting(true);

      // Call delete callback if provided
      if (value && onDelete) {
        await onDelete(value);
      }

      setPreview(null);
      onChange("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error: any) {
      console.error("Error deleting image:", error);
      alert("No pudimos eliminar la imagen. Inténtalo de nuevo.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="label">Foto de perfil</label>
      <div
        onClick={() => fileInputRef.current?.click()}
        className={`relative w-40 h-40 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden
          ${preview ? "border-transparent" : "border-line hover:border-grooming-500 hover:bg-grooming-50"}`}
      >
        {preview ? (
          <>
            <img
              src={preview}
              alt="Vista previa de la foto"
              className="w-full h-full object-cover"
            />
            {!uploading && !deleting && (
              <button
                onClick={removeImage}
                className="absolute top-2 right-2 p-1 bg-danger text-white rounded-full hover:bg-danger transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </>
        ) : (
          <div className="text-muted flex flex-col items-center gap-2">
            <UploadCloud size={32} />
            <span className="text-xs font-medium">Subir foto</span>
          </div>
        )}

        {uploading && (
          <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white">
            <div className="mb-2">
              <Spinner size={24} />
            </div>
            <span className="text-xs font-bold">{progress}%</span>
            <div className="w-24 h-1.5 bg-shell rounded-full mt-2 overflow-hidden">
              <div
                className="h-full bg-grooming-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        <input
          type="file"
          className="hidden"
          ref={fileInputRef}
          accept="image/*"
          onChange={handleFileChange}
          disabled={uploading}
        />
      </div>
    </div>
  );
}
