/**
 * DocumentUploadZone Component
 *
 * A drag-and-drop upload zone that accepts local files or Google Drive.
 */

import { useState, useRef } from "react";

interface DocumentUploadZoneProps {
  documentType: "transcript" | "tribal_doc" | "general";
  onUploadSuccess: (documentId: string, title: string) => void;
  disabled?: boolean;
}

export function DocumentUploadZone({
  documentType,
  onUploadSuccess,
  disabled = false,
}: DocumentUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (disabled) return;

    const file = e.dataTransfer.files[0];
    if (file) {
      await uploadFile(file);
    }
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadFile(file);
    }
  };

  const uploadFile = async (file: File) => {
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("documentType", documentType);
      formData.append("file", file);

      const response = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || "Upload failed");
        return;
      }

      const result = await response.json();
      onUploadSuccess(result.documentId, result.title);
    } catch (error) {
      console.error("Upload error:", error);
      alert("Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handleGoogleDrive = () => {
    // TODO: Implement Google Drive picker
    alert("Google Drive integration coming soon");
  };

  return (
    <div
      className={`sp-upload-zone ${isDragging ? "sp-dragging" : ""} ${
        disabled ? "sp-disabled" : ""
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="sp-upload-content">
        <p className="sp-upload-text">
          Drag & drop or select from Drive
        </p>
        <div className="sp-upload-buttons">
          <button
            type="button"
            onClick={handleFileSelect}
            disabled={disabled || isUploading}
            className="sp-btn-secondary"
          >
            Choose File
          </button>
          <button
            type="button"
            onClick={handleGoogleDrive}
            disabled={disabled || isUploading}
            className="sp-btn-secondary"
          >
            Select from Drive
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          accept=".pdf,.doc,.docx,.txt"
          className="sp-hidden"
          disabled={disabled || isUploading}
        />
      </div>

      <style>{`
        .sp-upload-zone {
          border: 2px dashed #ccc;
          border-radius: 8px;
          padding: 32px;
          text-align: center;
          transition: all 0.2s;
        }
        .sp-upload-zone.sp-dragging {
          border-color: #4f46e5;
          background: #eef2ff;
        }
        .sp-upload-zone.sp-disabled {
          opacity: 0.5;
          pointer-events: none;
        }
        .sp-upload-text {
          margin-bottom: 16px;
          color: #666;
        }
        .sp-upload-buttons {
          display: flex;
          gap: 12px;
          justify-content: center;
        }
        .sp-btn-secondary {
          padding: 8px 16px;
          border: 1px solid #ccc;
          border-radius: 4px;
          background: white;
          cursor: pointer;
        }
        .sp-btn-secondary:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .sp-hidden {
          display: none;
        }
      `}</style>
    </div>
  );
}
