import React, { useState, useRef } from "react";
import axios from "axios";
import { Camera, X, UploadCloud } from "lucide-react";
import { api } from "../../lib/api";
import { Spinner } from "./Spinner";

interface Props {
  value?: string;
  onChange: (url: string) => void;
  folder?: string;
}

export function ImageUpload({ value, onChange }: Props) {
  const [uploading, setUploading] = useState(false);
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
      });

      // 2. Upload to B2 directly
      try {
        await axios.put(uploadUrl, file, {
          headers: {
            "Content-Type": file.type,
          },
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / (progressEvent.total || 1)
            );
            setProgress(percentCompleted);
          },
        });
      } catch (uploadErr: any) {
        console.error("Direct B2 upload failed:", uploadErr.response?.data || uploadErr.message);
        throw new Error("Error al subir el archivo directamente al servidor de almacenamiento.");
      }

      // 3. Update with final public URL
      onChange(publicUrl);
      setPreview(publicUrl);
    } catch (error: any) {
      console.error("Upload process failed", error);
      alert(error.message || "Error al subir la imagen. Por favor intente de nuevo.");
      setPreview(value || null);
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPreview(null);
    onChange("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      <label className="label">Foto de perfil</label>
      <div 
        onClick={() => fileInputRef.current?.click()}
        className={`relative w-40 h-40 rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden
          ${preview ? "border-transparent" : "border-gray-300 hover:border-violet-500 hover:bg-violet-50"}`}
      >
        {preview ? (
          <>
            <img src={preview} alt="Preview" className="w-full h-full object-cover" />
            {!uploading && (
              <button 
                onClick={removeImage}
                className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </>
        ) : (
          <div className="text-gray-400 flex flex-col items-center gap-2">
            <UploadCloud size={32} />
            <span className="text-xs font-medium">Subir foto</span>
          </div>
        )}

        {uploading && (
          <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white">
            <div className="mb-2"><Spinner size={24} /></div>
            <span className="text-xs font-bold">{progress}%</span>
            <div className="w-24 h-1.5 bg-gray-700 rounded-full mt-2 overflow-hidden">
              <div 
                className="h-full bg-violet-500 transition-all duration-300" 
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
