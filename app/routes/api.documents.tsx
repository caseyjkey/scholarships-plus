/**
 * Documents API Endpoint
 *
 * GET: List user's documents
 * DELETE: Delete a document
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { prisma } from "~/db.server";

/**
 * GET /api/documents
 * Returns user's documents with optional filtering by type
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const userId = await requireUserId(request);
  const url = new URL(request.url);
  const type = url.searchParams.get("type");

  const where: any = { userId };
  if (type) {
    where.type = type;
  }

  const documents = await prisma.document.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return json({ documents });
};

/**
 * DELETE /api/documents?id=<id>
 * Deletes a document
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const userId = await requireUserId(request);

  if (request.method !== "DELETE") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return json({ error: "Missing document id" }, { status: 400 });
  }

  // Verify ownership
  const document = await prisma.document.findFirst({
    where: { id, userId },
  });

  if (!document) {
    return json({ error: "Document not found" }, { status: 404 });
  }

  // Delete associated knowledge entries
  await prisma.globalKnowledge.deleteMany({
    where: {
      userId,
      source: `document:${id}`,
    },
  });

  // Delete document
  await prisma.document.delete({
    where: { id },
  });

  return json({ success: true });
};
