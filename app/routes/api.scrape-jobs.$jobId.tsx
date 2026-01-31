/**
 * API Route for Single Scrape Job Status
 *
 * GET /api/scrape-jobs/$jobId - Returns the status of a specific scrape job
 * DELETE /api/scrape-jobs/$jobId - Cancel a running scrape job
 */

import { ActionFunctionArgs, LoaderFunctionArgs, json } from "@remix-run/node";
import { requireAdminRole, requireUserId } from "~/session.server";
import { prisma } from "~/db.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const userId = await requireUserId(request);
  const jobId = params.jobId;

  if (!jobId) {
    return json({ error: "jobId required" }, { status: 400 });
  }

  // Verify user owns this job
  const job = await prisma.scrapeJob.findFirst({
    where: {
      id: jobId,
      userId,
    },
  });

  if (!job) {
    return json({ error: "Job not found" }, { status: 404 });
  }

  return json({
    id: job.id,
    action: job.action,
    status: job.status,
    currentStep: job.currentStep,
    totalSteps: job.totalSteps,
    message: job.message,
    result: job.result,
    error: job.error,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    createdAt: job.createdAt,
    progress: job.totalSteps > 0 ? Math.round((job.currentStep / job.totalSteps) * 100) : 0,
  });
};

/**
 * DELETE /api/scrape-jobs/:jobId
 * Cancel a running scrape job and all its children
 */
export const action = async ({ request, params }: ActionFunctionArgs) => {
  if (request.method !== "DELETE") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  await requireAdminRole(request);
  const userId = await requireUserId(request);
  const { jobId } = params;

  if (!jobId) {
    return json({ error: "jobId required" }, { status: 400 });
  }

  // Get the job
  const job = await prisma.scrapeJob.findUnique({
    where: { id: jobId },
  });

  if (!job) {
    return json({ error: "Job not found" }, { status: 404 });
  }

  if (job.userId !== userId) {
    return json({ error: "Unauthorized" }, { status: 403 });
  }

  // Can only cancel running or pending jobs
  if (job.status !== "running" && job.status !== "pending") {
    return json({
      error: `Cannot cancel job with status: ${job.status}`,
      message: "Job has already completed",
    }, { status: 400 });
  }

  try {
    // Mark the job as cancelled
    await prisma.scrapeJob.update({
      where: { id: jobId },
      data: {
        status: "cancelled",
        message: "Job cancelled by user",
        completedAt: new Date(),
      },
    });

    // Also cancel all child jobs
    const childJobs = await prisma.scrapeJob.findMany({
      where: { parentJobId: jobId },
    });

    for (const childJob of childJobs) {
      await prisma.scrapeJob.update({
        where: { id: childJob.id },
        data: {
          status: "cancelled",
          message: "Cancelled (parent job was cancelled)",
          completedAt: new Date(),
        },
      });
    }

    return json({
      success: true,
      message: "Job cancelled successfully",
      jobId,
    });
  } catch (error: any) {
    console.error(`Error cancelling job ${jobId}:`, error);
    return json(
      { error: "Failed to cancel job", details: error.message },
      { status: 500 }
    );
  }
};
