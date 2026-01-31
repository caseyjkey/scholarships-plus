/**
 * Essay Uploader Component
 * Drag-and-drop file upload with progress tracking
 * Supports PDF, DOC, DOCX, and TXT files
 */

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";

interface EssayUploaderProps {
  onUpload: (files: File[]) => Promise<void>;
  acceptedFormats?: string[];
  maxFiles?: number;
  maxSize?: number; // in bytes
}

interface UploadProgress {
  file: string;
  progress: number;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
}

export function EssayUploader({
  onUpload,
  acceptedFormats = [".pdf", ".doc", ".docx", ".txt"],
  maxFiles = 10,
  maxSize = 10 * 1024 * 1024, // 10MB default
}: EssayUploaderProps) {
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;

      setIsUploading(true);

      // Initialize upload progress for each file
      const initialUploads: UploadProgress[] = acceptedFiles.map((file) => ({
        file: file.name,
        progress: 0,
        status: "pending",
      }));

      setUploads((prev) => [...prev, ...initialUploads]);

      // Process files sequentially
      for (let i = 0; i < acceptedFiles.length; i++) {
        const file = acceptedFiles[i];
        const uploadIndex = uploads.length + i;

        try {
          // Update status to uploading
          setUploads((prev) => {
            const updated = [...prev];
            updated[uploadIndex] = {
              ...updated[uploadIndex],
              status: "uploading",
              progress: 0,
            };
            return updated;
          });

          // Simulate progress (in real app, this would come from upload endpoint)
          const progressInterval = setInterval(() => {
            setUploads((prev) => {
              const updated = [...prev];
              if (updated[uploadIndex]?.progress < 90) {
                updated[uploadIndex] = {
                  ...updated[uploadIndex],
                  progress: (updated[uploadIndex]?.progress || 0) + 10,
                };
              }
              return updated;
            });
          }, 100);

          // Upload the file
          await onUpload([file]);

          clearInterval(progressInterval);

          // Update status to success
          setUploads((prev) => {
            const updated = [...prev];
            updated[uploadIndex] = {
              file: file.name,
              progress: 100,
              status: "success",
            };
            return updated;
          });
        } catch (error) {
          // Update status to error
          setUploads((prev) => {
            const updated = [...prev];
            updated[uploadIndex] = {
              file: file.name,
              progress: 0,
              status: "error",
              error: error instanceof Error ? error.message : "Upload failed",
            };
            return updated;
          });
        }
      }

      setIsUploading(false);
    },
    [onUpload, uploads.length]
  );

  const { getRootProps, getInputProps, isDragActive, fileRejections } =
    useDropzone({
      onDrop,
      accept: {
        "application/pdf": [".pdf"],
        "application/msword": [".doc"],
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
          ".docx",
        ],
        "text/plain": [".txt"],
      },
      maxFiles,
      maxSize,
      disabled: isUploading,
    });

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  const clearCompleted = () => {
    setUploads((prev) => prev.filter((u) => u.status !== "success"));
  };

  return (
    <div className="space-y-4">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`
          relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-all duration-200
          ${
            isDragActive
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 hover:border-gray-400"
          }
          ${isUploading ? "opacity-50 cursor-not-allowed" : ""}
        `}
      >
        <input {...getInputProps()} />

        {isUploading ? (
          <div>
            <div className="text-lg font-medium text-gray-700">Uploading...</div>
            <div className="text-sm text-gray-500 mt-2">
              Please wait while files are being processed
            </div>
          </div>
        ) : (
          <>
            <div className="text-5xl mb-4">📄</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {isDragActive ? "Drop your essays here" : "Upload Essays"}
            </h3>
            <p className="text-gray-600 mb-4">
              Drag & drop scholarship essays here, or click to browse
            </p>
            <div className="text-sm text-gray-500">
              <p>Accepted formats: PDF, DOC, DOCX, TXT</p>
              <p>
                Maximum file size: {formatFileSize(maxSize)} per file
              </p>
              <p>Maximum files: {maxFiles} at a time</p>
            </div>
          </>
        )}
      </div>

      {/* File Rejection Errors */}
      {fileRejections.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h4 className="font-medium text-red-800 mb-2">
            Some files were rejected:
          </h4>
          <ul className="text-sm text-red-700 space-y-1">
            {fileRejections.map(({ file, errors }) => (
              <li key={file.name}>
                <strong>{file.name}</strong>:{" "}
                {errors.map((e) => e.message).join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Upload Progress List */}
      {uploads.length > 0 && (
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-gray-900">
              Upload Progress ({uploads.length})
            </h4>
            <button
              onClick={clearCompleted}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Clear Completed
            </button>
          </div>

          <div className="space-y-3">
            {uploads.map((upload, index) => (
              <UploadItem key={`${upload.file}-${index}`} upload={upload} />
            ))}
          </div>
        </div>
      )}

      {/* Help Text */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-2">
          📚 How Upload Works
        </h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Upload your past scholarship essays (awarded or not)</li>
          <li>• Essays will be processed and embedded for AI search</li>
          <li>• Similar essays will be automatically identified</li>
          <li>• Use these essays as reference when applying for new scholarships</li>
        </ul>
      </div>
    </div>
  );
}

function UploadItem({ upload }: { upload: UploadProgress }) {
  const getStatusIcon = () => {
    switch (upload.status) {
      case "pending":
        return "⏳";
      case "uploading":
        return "📤";
      case "success":
        return "✅";
      case "error":
        return "❌";
    }
  };

  const getStatusColor = () => {
    switch (upload.status) {
      case "pending":
        return "text-gray-600";
      case "uploading":
        return "text-blue-600";
      case "success":
        return "text-green-600";
      case "error":
        return "text-red-600";
    }
  };

  return (
    <div className="flex items-start gap-3">
      <span className="text-xl">{getStatusIcon()}</span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="font-medium text-gray-900 truncate">
            {upload.file}
          </span>
          <span className={`text-sm font-medium ${getStatusColor()}`}>
            {upload.status === "uploading" && `${upload.progress}%`}
            {upload.status === "success" && "Complete"}
            {upload.status === "error" && "Failed"}
            {upload.status === "pending" && "Queued"}
          </span>
        </div>

        {/* Progress Bar */}
        {upload.status === "uploading" && (
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${upload.progress}%` }}
            />
          </div>
        )}

        {/* Error Message */}
        {upload.status === "error" && upload.error && (
          <p className="text-sm text-red-600 mt-1">{upload.error}</p>
        )}
      </div>
    </div>
  );
}
