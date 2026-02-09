/**
 * Documents Page
 *
 * User interface for uploading and managing documents.
 */

import { useState } from "react";
import { DocumentUploadZone } from "~/components/DocumentUploadZone";
import { DocumentList } from "~/components/DocumentList";
import { requireUserId } from "~/session.server";
import { redirect, type LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const userId = await requireUserId(request);
  return {}; // Auth check only
};

export default function DocumentsPage() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleUploadSuccess = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "32px 16px" }}>
      <h1>Documents</h1>
      <p style={{ color: "#666", marginBottom: "32px" }}>
        Upload transcripts, tribal documentation, and reference letters for
        AI-powered autofill.
      </p>

      {/* Transcripts Section */}
      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span>📄</span> Transcripts
        </h2>
        <DocumentUploadZone
          documentType="transcript"
          onUploadSuccess={handleUploadSuccess}
        />
        <DocumentList
          documentType="transcript"
          refreshTrigger={refreshTrigger}
        />
      </section>

      {/* Tribal Documentation Section */}
      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span>🪪</span> Tribal Documentation
        </h2>
        <DocumentUploadZone
          documentType="tribal_doc"
          onUploadSuccess={handleUploadSuccess}
        />
        <DocumentList
          documentType="tribal_doc"
          refreshTrigger={refreshTrigger}
        />
      </section>

      {/* References & Applications Section */}
      <section style={{ marginBottom: "32px" }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span>📝</span> References & Applications
        </h2>
        <DocumentUploadZone
          documentType="general"
          onUploadSuccess={handleUploadSuccess}
        />
        <DocumentList
          documentType="general"
          refreshTrigger={refreshTrigger}
        />
      </section>
    </div>
  );
}
