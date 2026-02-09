/**
 * DocumentList Component
 *
 * Displays uploaded documents with delete functionality.
 */

import { useEffect, useState } from "react";

interface Document {
  id: string;
  type: string;
  title: string;
  source: string;
  createdAt: string;
}

interface DocumentListProps {
  documentType: "transcript" | "tribal_doc" | "general";
  refreshTrigger?: number;
  onDocumentDeleted?: () => void;
}

export function DocumentList({
  documentType,
  refreshTrigger = 0,
  onDocumentDeleted,
}: DocumentListProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDocuments();
  }, [documentType, refreshTrigger]);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/documents?type=${documentType}`
      );
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents);
      }
    } catch (error) {
      console.error("Failed to fetch documents:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/documents?id=${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setDocuments(documents.filter((d) => d.id !== id));
        onDocumentDeleted?.();
      }
    } catch (error) {
      console.error("Delete failed:", error);
      alert("Failed to delete document");
    }
  };

  if (loading) {
    return <div className="sp-loading">Loading...</div>;
  }

  if (documents.length === 0) {
    return null;
  }

  return (
    <div className="sp-document-list">
      {documents.map((doc) => (
        <div key={doc.id} className="sp-document-item">
          <span className="sp-doc-icon">
            {doc.source === "google_drive" ? "☁️" : "💾"}
          </span>
          <span className="sp-doc-title">{doc.title}</span>
          <span className="sp-doc-date">
            {new Date(doc.createdAt).toLocaleDateString()}
          </span>
          <button
            onClick={() => handleDelete(doc.id, doc.title)}
            className="sp-delete-btn"
          >
            ✕
          </button>
        </div>
      ))}

      <style>{`
        .sp-document-list {
          margin-top: 16px;
        }
        .sp-document-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 4px;
          background: #f9fafb;
        }
        .sp-doc-icon {
          font-size: 16px;
        }
        .sp-doc-title {
          flex: 1;
          font-size: 14px;
        }
        .sp-doc-date {
          font-size: 12px;
          color: #666;
        }
        .sp-delete-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px 8px;
          color: #666;
        }
        .sp-delete-btn:hover {
          color: #dc2626;
        }
        .sp-loading {
          padding: 16px;
          text-align: center;
          color: #666;
        }
      `}</style>
    </div>
  );
}
