/**
 * API Routes for Scrape Job Management
 *
 * These endpoints allow admins to:
 * - Create scrape jobs (discover, scrapeAll, scrapeOne, discoverAisesCobell, scrapeAllAisesCobell, scrapeOneAisesCobell)
 * - Get job status with progress updates
 * - List recent jobs
 */

import { ActionFunctionArgs, LoaderFunctionArgs, json } from "@remix-run/node";
import { requireAdminRole, requireUserId } from "~/session.server";
import { prisma } from "~/db.server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * GET /api/scrape-jobs
 * Returns list of recent scrape jobs for the current user
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const userId = await requireUserId(request);
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get("limit") || "50");

  // Get only parent jobs (no parentJobId)
  const parentJobs = await prisma.scrapeJob.findMany({
    where: {
      userId,
      parentJobId: null, // Only parent jobs
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  // Get all jobs (including children) for the hierarchy
  const allJobs = await prisma.scrapeJob.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit * 10, // Get more to include child jobs
  });

  // Build hierarchy: parent jobs with their children
  const jobsWithChildren = parentJobs.map(parentJob => ({
    ...parentJob,
    children: allJobs.filter(job => job.parentJobId === parentJob.id),
  }));

  return json({ jobs: jobsWithChildren });
};

/**
 * POST /api/scrape-jobs
 * Creates a new scrape job and runs it in the background
 * Body: { action: "discover" | "scrapeAll" | "scrapeOne" | "discoverAisesCobell" | "scrapeAllAisesCobell" | "scrapeOneAisesCobell", scholarshipId?: string }
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  await requireAdminRole(request);

  const userId = await requireUserId(request);
  const body = await request.json();
  const { action, scholarshipId } = body;

  // Check if there's already a running or pending job with the same action
  const existingJob = await prisma.scrapeJob.findFirst({
    where: {
      action,
      userId,
      status: { in: ["pending", "running"] },
    },
  });

  if (existingJob) {
    return json({
      error: "A job is already running",
      existingJobId: existingJob.id,
      message: "Please wait for the current job to complete",
    }, { status: 409 }); // Conflict
  }

  // Create the job
  const job = await prisma.scrapeJob.create({
    data: {
      action,
      userId,
      scholarshipId: scholarshipId || null,
      status: "pending",
      message: "Job queued",
    },
  });

  // Start the job in background (don't await)
  runScrapeJob(job.id, action, scholarshipId).catch((error) => {
    console.error(`Scrape job ${job.id} failed:`, error);
  });

  // Return immediately with job ID
  return json({
    jobId: job.id,
    status: "pending",
    message: "Job started",
  });
};

/**
 * Run a scrape job in the background
 * Updates job progress as the scraper runs
 */
async function runScrapeJob(
  jobId: string,
  action: string,
  scholarshipId?: string
): Promise<void> {
  try {
    // Update job status to running
    await prisma.scrapeJob.update({
      where: { id: jobId },
      data: { status: "running", message: "Starting..." },
    });

    // For scrapeAll, create child jobs and run them individually
    if (action === "scrapeAll") {
      await runScrapeAllJob(jobId);
      return;
    }

    if (action === "scrapeAllAisesCobell") {
      await runScrapeAllAisesCobellJob(jobId);
      return;
    }

    let command: string;
    let totalSteps = 1;

    switch (action) {
      case "discover":
        command =
          // `BROWSER_USE_API_KEY="${process.env.BROWSER_USE_API_KEY}" ` +  // Commented out to force local browser mode
          `bash -c 'export DISPLAY=${process.env.DISPLAY || ":0"} && cd ~/Development/browser-use && source .venv/bin/activate && cd ~/Development/scholarships-plus && python scripts/discover-scholarships.py'`;
        totalSteps = 1;
        break;

      case "scrapeOne":
        if (!scholarshipId) {
          throw new Error("scholarshipId required for scrapeOne");
        }

        // Get scholarship title
        const scholarship = await prisma.scrapedScholarship.findUnique({
          where: { id: scholarshipId },
          select: { title: true, portal: true },
        });

        if (!scholarship) {
          throw new Error("Scholarship not found");
        }

        const escapedTitle = `"${scholarship.title.replace(/"/g, '\\"')}"`;

        // Use appropriate script based on portal
        if (scholarship.portal === "aises" || scholarship.portal === "cobell") {
          command =
            // `BROWSER_USE_API_KEY="${process.env.BROWSER_USE_API_KEY}" ` +  // Commented out to force local browser mode
            `bash -c 'cd ~/Development/browser-use && source .venv/bin/activate && cd ~/Development/scholarships-plus && python scripts/scrape-one-aises-cobell.py ${escapedTitle} ${scholarship.portal}'`;
        } else {
          command =
            // `BROWSER_USE_API_KEY="${process.env.BROWSER_USE_API_KEY}" ` +  // Commented out to force local browser mode
            `bash -c 'cd ~/Development/browser-use && source .venv/bin/activate && cd ~/Development/scholarships-plus && python scripts/scrape-one-smarterselect.py ${escapedTitle}'`;
        }
        totalSteps = 1;
        break;

      case "discoverAisesCobell":
        command =
          // `BROWSER_USE_API_KEY="${process.env.BROWSER_USE_API_KEY}" ` +  // Commented out to force local browser mode
          `bash -c 'cd ~/Development/browser-use && source .venv/bin/activate && cd ~/Development/scholarships-plus && python scripts/discover-aises-cobell.py'`;
        totalSteps = 1;
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    // Set total steps
    await prisma.scrapeJob.update({
      where: { id: jobId },
      data: { totalSteps },
    });

    // Execute command and capture output
    const { stdout, stderr } = await execAsync(command, {
      timeout: 180000,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });

    // Parse output for progress updates
    const lines = stdout.split("\n");
    let result: any = null;
    let error: string | null = null;

    for (const line of lines) {
      // Parse PROGRESS markers
      const progressMatch = line.match(/PROGRESS:\s*(\d+)\/(\d+):\s*(.+)/);
      if (progressMatch) {
        const currentStep = parseInt(progressMatch[1], 10);
        await prisma.scrapeJob.update({
          where: { id: jobId },
          data: {
            currentStep,
            message: progressMatch[3],
          },
        });
        continue;
      }

      // Parse STATUS markers
      const statusMatch = line.match(/STATUS:\s*(.+)/);
      if (statusMatch) {
        await prisma.scrapeJob.update({
          where: { id: jobId },
          data: { message: statusMatch[1] },
        });
        continue;
      }

      // Parse ERROR markers
      const errorMatch = line.match(/ERROR:\s*(.+)/);
      if (errorMatch) {
        error = errorMatch[1];
        await prisma.scrapeJob.update({
          where: { id: jobId },
          data: { message: `Error: ${error}` },
        });
        continue;
      }

      // Parse RESULT marker
      const resultMatch = line.match(/RESULT:\s*(.+)/);
      if (resultMatch) {
        try {
          result = JSON.parse(resultMatch[1]);
        } catch {
          // If not valid JSON, keep accumulating
        }
      }
    }

    // Handle discover action - update database
    if (action === "discover" && result?.scholarships) {
      for (const sch of result.scholarships) {
        await prisma.scrapedScholarship.upsert({
          where: { sourceUrl: sch.sourceUrl },
          update: {
            title: sch.title,
            listPosition: sch.position,
            scrapeStatus: "pending",
          },
          create: {
            portal: "nativeforward",
            title: sch.title,
            sourceUrl: sch.sourceUrl,
            listPosition: sch.position,
            scrapeStatus: "pending",
            deadline: new Date(),
            requirements: {},
            applicationUrl: "",
          },
        });
      }
    }

    // Handle discoverAisesCobell action - update database
    if (action === "discoverAisesCobell" && result?.scholarships) {
      for (const sch of result.scholarships) {
        const slug = sch.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const sourceUrl = `https://aises.awardspring.com/${slug}`;
        const portal = sch.organization?.toLowerCase() || "aises";

        await prisma.scrapedScholarship.upsert({
          where: { sourceUrl },
          update: {
            title: sch.title,
            listPosition: sch.position,
            scrapeStatus: "pending",
            portal,
          },
          create: {
            portal,
            title: sch.title,
            sourceUrl,
            listPosition: sch.position,
            scrapeStatus: "pending",
            deadline: new Date(),
            description: "",
            requirements: {},
            applicationUrl: "",
          },
        });
      }
    }

    // Handle scrapeAll action - import scraped data
    if (action === "scrapeAll") {
      try {
        await execAsync(
          `npx tsx scripts/import-all-scholarships.ts`,
          { timeout: 30000 }
        );
      } catch (importError) {
        console.error("Import error:", importError);
      }
    }

    // Handle scrapeAllAisesCobell action - import scraped data
    if (action === "scrapeAllAisesCobell") {
      try {
        await execAsync(
          `npx tsx scripts/import-aises-cobell.ts`,
          { timeout: 30000 }
        );
      } catch (importError) {
        console.error("Import error:", importError);
      }
    }

    // Handle scrapeOne action - update database
    if (action === "scrapeOne" && result?.scholarship && scholarshipId) {
      const data = result.scholarship;
      const deadline = new Date(
        data.deadline?.replace(" at ", " ").replace(",", "") || new Date()
      );

      const scholarship = await prisma.scrapedScholarship.findUnique({
        where: { id: scholarshipId },
        select: { portal: true },
      });

      const portal = scholarship?.portal || "nativeforward";

      await prisma.scrapedScholarship.update({
        where: { id: scholarshipId },
        data: {
          title: data.title,
          description: data.full_description || data.description,
          deadline,
          requirements: {
            eligibility:
              Array.isArray(data.eligibility) && data.eligibility.length > 0
                ? data.eligibility.join("\n")
                : data.eligibility || "",
            organization: data.organization || portal,
            required_documents: Array.isArray(data.required_documents)
              ? data.required_documents.join(", ")
              : data.required_documents || "",
          },
          applicationUrl: data.application_url || "",
          scrapeStatus: "success",
          scrapeError: null,
          portal: data.organization?.toLowerCase() || portal,
        },
      });
    }

    // Update job as completed or failed
    if (error || result?.error) {
      await prisma.scrapeJob.update({
        where: { id: jobId },
        data: {
          status: "error",
          message: error || result?.error || "Unknown error",
          error: error || result?.error || stderr || "Unknown error",
          completedAt: new Date(),
        },
      });
    } else {
      await prisma.scrapeJob.update({
        where: { id: jobId },
        data: {
          status: "completed",
          message: "Completed successfully",
          result: result || null,
          completedAt: new Date(),
        },
      });
    }
  } catch (error: any) {
    console.error(`Scrape job ${jobId} error:`, error);

    await prisma.scrapeJob.update({
      where: { id: jobId },
      data: {
        status: "error",
        message: "Job failed",
        error: error.message || "Unknown error",
        completedAt: new Date(),
      },
    });
  }
}

/**
 * Run scrapeAll job by creating child jobs for each scholarship
 */
async function runScrapeAllJob(parentJobId: string): Promise<void> {
  const userId = (await prisma.scrapeJob.findUnique({ where: { id: parentJobId } }))!.userId;

  // Get all Native Forward scholarships
  const scholarships = await prisma.scrapedScholarship.findMany({
    where: { portal: "nativeforward" },
    orderBy: { listPosition: "asc" },
  });

  // Update parent job with total steps
  await prisma.scrapeJob.update({
    where: { id: parentJobId },
    data: { totalSteps: scholarships.length },
  });

  let completedCount = 0;
  let errorCount = 0;

  // Create child jobs and run them sequentially
  for (const scholarship of scholarships) {
    // Check if parent job was cancelled
    const parentJob = await prisma.scrapeJob.findUnique({ where: { id: parentJobId } });
    if (parentJob?.status === "cancelled") {
      await prisma.scrapeJob.update({
        where: { id: parentJobId },
        data: {
          message: `Cancelled: Completed ${completedCount}/${scholarships.length} (${errorCount} errors)`,
        },
      });
      return;
    }

    // Create child job
    const childJob = await prisma.scrapeJob.create({
      data: {
        action: "scrapeOne",
        status: "pending",
        parentJobId,
        scholarshipId: scholarship.id,
        scholarshipTitle: scholarship.title,
        userId,
        message: `Queued: ${scholarship.title}`,
        totalSteps: 1,
      },
    });

    // Run the child job
    await runChildJob(childJob.id, scholarship.id, scholarship.title);

    // Check if child job succeeded
    const updatedChild = await prisma.scrapeJob.findUnique({ where: { id: childJob.id } });
    if (updatedChild?.status === "completed") {
      completedCount++;
    } else {
      errorCount++;
    }

    // Update parent job progress
    await prisma.scrapeJob.update({
      where: { id: parentJobId },
      data: {
        currentStep: completedCount + errorCount,
        message: `Completed ${completedCount}/${scholarships.length} (${errorCount} errors)`,
      },
    });
  }

  // Update parent job as completed
  await prisma.scrapeJob.update({
    where: { id: parentJobId },
    data: {
      status: "completed",
      message: `Completed: ${completedCount} successful, ${errorCount} errors`,
      completedAt: new Date(),
    },
  });

  // Import all scraped data
  try {
    await execAsync(`npx tsx scripts/import-all-scholarships.ts`, { timeout: 30000 });
  } catch (importError) {
    console.error("Import error:", importError);
  }
}

/**
 * Run scrapeAllAisesCobell job by creating child jobs for each scholarship
 */
async function runScrapeAllAisesCobellJob(parentJobId: string): Promise<void> {
  const userId = (await prisma.scrapeJob.findUnique({ where: { id: parentJobId } }))!.userId;

  // Get all AISES/Cobell scholarships
  const scholarships = await prisma.scrapedScholarship.findMany({
    where: { portal: { in: ["aises", "cobell"] } },
    orderBy: { listPosition: "asc" },
  });

  // Update parent job with total steps
  await prisma.scrapeJob.update({
    where: { id: parentJobId },
    data: { totalSteps: scholarships.length },
  });

  let completedCount = 0;
  let errorCount = 0;

  // Create child jobs and run them sequentially
  for (const scholarship of scholarships) {
    // Create child job
    const childJob = await prisma.scrapeJob.create({
      data: {
        action: "scrapeOne",
        status: "pending",
        parentJobId,
        scholarshipId: scholarship.id,
        scholarshipTitle: scholarship.title,
        userId,
        message: `Queued: ${scholarship.title}`,
        totalSteps: 1,
      },
    });

    // Run the child job
    await runChildJob(childJob.id, scholarship.id, scholarship.title);

    // Check if child job succeeded
    const updatedChild = await prisma.scrapeJob.findUnique({ where: { id: childJob.id } });
    if (updatedChild?.status === "completed") {
      completedCount++;
    } else {
      errorCount++;
    }

    // Update parent job progress
    await prisma.scrapeJob.update({
      where: { id: parentJobId },
      data: {
        currentStep: completedCount + errorCount,
        message: `Completed ${completedCount}/${scholarships.length} (${errorCount} errors)`,
      },
    });
  }

  // Update parent job as completed
  await prisma.scrapeJob.update({
    where: { id: parentJobId },
    data: {
      status: "completed",
      message: `Completed: ${completedCount} successful, ${errorCount} errors`,
      completedAt: new Date(),
    },
  });

  // Import all scraped data
  try {
    await execAsync(`npx tsx scripts/import-aises-cobell.ts`, { timeout: 30000 });
  } catch (importError) {
    console.error("Import error:", importError);
  }
}

/**
 * Run a single child job (scrapeOne)
 */
async function runChildJob(
  childJobId: string,
  scholarshipId: string,
  scholarshipTitle: string
): Promise<void> {
  try {
    // Update child job status to running
    await prisma.scrapeJob.update({
      where: { id: childJobId },
      data: { status: "running", message: `Scraping: ${scholarshipTitle}` },
    });

    // Get scholarship details
    const scholarship = await prisma.scrapedScholarship.findUnique({
      where: { id: scholarshipId },
      select: { title: true, portal: true },
    });

    if (!scholarship) {
      throw new Error("Scholarship not found");
    }

    const escapedTitle = `"${scholarship.title.replace(/"/g, '\\"')}"`;

    // Build command based on portal
    let command: string;
    if (scholarship.portal === "aises" || scholarship.portal === "cobell") {
      command =
        // `BROWSER_USE_API_KEY="${process.env.BROWSER_USE_API_KEY}" ` +  // Commented out to force local browser mode
        `bash -c 'cd ~/Development/browser-use && source .venv/bin/activate && cd ~/Development/scholarships-plus && python scripts/scrape-one-aises-cobell.py ${escapedTitle} ${scholarship.portal}'`;
    } else {
      command =
        // `BROWSER_USE_API_KEY="${process.env.BROWSER_USE_API_KEY}" ` +  // Commented out to force local browser mode
        `bash -c 'export DISPLAY=${process.env.DISPLAY || ":0"} && cd ~/Development/browser-use && source .venv/bin/activate && cd ~/Development/scholarships-plus && python scripts/scrape-one-smarterselect.py ${escapedTitle}'`;
    }

    // Execute command
    const { stdout, stderr } = await execAsync(command, {
      timeout: 180000,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });

    // Parse output
    const lines = stdout.split("\n");
    let result: any = null;
    let error: string | null = null;

    for (const line of lines) {
      // Parse RESULT markers
      const resultMatch = line.match(/RESULT:\s*(.+)/);
      if (resultMatch) {
        try {
          const jsonStart = resultMatch[1].indexOf('{');
          const jsonEnd = resultMatch[1].lastIndexOf('}') + 1;
          if (jsonStart >= 0 && jsonEnd > jsonStart) {
            result = JSON.parse(resultMatch[1].substring(jsonStart, jsonEnd));
          }
        } catch {
          // If not valid JSON, keep result as is
        }
      }

      // Parse ERROR markers
      const errorMatch = line.match(/ERROR:\s*(.+)/);
      if (errorMatch) {
        error = errorMatch[1];
      }
    }

    // Handle successful scrape
    if (result?.scholarship && !error) {
      const data = result.scholarship;
      const deadline = new Date(
        data.deadline?.replace(" at ", " ").replace(",", "") || new Date()
      );

      await prisma.scrapedScholarship.update({
        where: { id: scholarshipId },
        data: {
          title: data.title,
          description: data.full_description || data.description,
          deadline,
          requirements: {
            eligibility:
              Array.isArray(data.eligibility) && data.eligibility.length > 0
                ? data.eligibility.join("\n")
                : data.eligibility || "",
            organization: data.organization || scholarship.portal,
            required_documents: Array.isArray(data.required_documents)
              ? data.required_documents.join(", ")
              : data.required_documents || "",
          },
          applicationUrl: data.application_url || "",
          scrapeStatus: "success",
          scrapeError: null,
          portal: data.organization?.toLowerCase() || scholarship.portal,
        },
      });

      // Update child job as completed
      await prisma.scrapeJob.update({
        where: { id: childJobId },
        data: {
          status: "completed",
          message: `Completed: ${scholarshipTitle}`,
          result: result || null,
          completedAt: new Date(),
        },
      });
    } else {
      // Update child job as failed
      await prisma.scrapeJob.update({
        where: { id: childJobId },
        data: {
          status: "error",
          message: `Failed: ${scholarshipTitle}`,
          error: error || result?.error || stderr || "Unknown error",
          completedAt: new Date(),
        },
      });
    }
  } catch (error: any) {
    console.error(`Child job ${childJobId} error:`, error);

    await prisma.scrapeJob.update({
      where: { id: childJobId },
      data: {
        status: "error",
        message: `Failed: ${scholarshipTitle}`,
        error: error.message || "Unknown error",
        completedAt: new Date(),
      },
    });
  }
}
