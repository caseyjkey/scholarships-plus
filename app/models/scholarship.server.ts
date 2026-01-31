/**
 * Scholarship and Application model functions
 * CRUD operations for scholarships and applications
 */

import type { Scholarship, Application } from "@prisma/client";
import { prisma } from "~/db.server";

export type { Scholarship, Application } from "@prisma/client";

/**
 * Get a single scholarship by ID
 */
export async function getScholarship(id: string) {
  try {
    return await prisma.scholarship.findUnique({
      where: { id },
    });
  } catch (error) {
    console.error(`Error fetching scholarship ${id}:`, error);
    throw new Error("Failed to fetch scholarship");
  }
}

/**
 * Get list of scholarships with optional filters
 */
export async function getScholarshipList(options: {
  userId?: string;
  status?: string;
  upcomingOnly?: boolean;
  limit?: number;
  sortBy?: "deadline" | "amount" | "title";
  sortOrder?: "asc" | "desc";
  classLevel?: string;
  gpaMin?: number;
  gpaMax?: number;
  enrollmentStatus?: string;
}) {
  const {
    userId,
    status,
    upcomingOnly,
    limit,
    sortBy = "deadline",
    sortOrder = "asc",
    classLevel,
    gpaMin,
    gpaMax,
    enrollmentStatus,
  } = options;

  try {
    const where: any = {};

    // Filter by deadline if requested
    if (upcomingOnly) {
      where.deadline = { gte: new Date() };
    }

    // Filter by class level (JSON contains the level)
    if (classLevel) {
      where.classLevel = {
        path: "$",
        array_contains: classLevel,
      };
    }

    // Filter by GPA range
    if (gpaMin !== undefined) {
      where.gpaMin = { lte: gpaMin };
    }
    if (gpaMax !== undefined) {
      where.gpaMax = { gte: gpaMax };
    }

    // Filter by enrollment status
    if (enrollmentStatus) {
      where.enrollmentStatus = enrollmentStatus;
    }

    const scholarships = await prisma.scholarship.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      take: limit,
    });

    // If userId provided, fetch application status for each scholarship
    if (userId) {
      const applications = await prisma.application.findMany({
        where: { userId },
        select: { scholarshipId: true, status: true, step: true },
      });

      const applicationMap = new Map(
        applications.map((app) => [app.scholarshipId, app])
      );

      return scholarships.map((scholarship) => ({
        ...scholarship,
        applicationStatus: applicationMap.get(scholarship.id)?.status,
        applicationStep: applicationMap.get(scholarship.id)?.step,
      }));
    }

    return scholarships;
  } catch (error) {
    console.error("Error fetching scholarship list:", error);
    throw new Error("Failed to fetch scholarships");
  }
}

/**
 * Create a new scholarship
 */
export async function createScholarship(data: {
  title: string;
  organization?: string;
  description: string;
  amount?: number | string;
  deadline: Date | string;
  requirements?: any;
  source?: string;
  sourceUrl?: string;
}) {
  try {
    // Convert amount to decimal if it's a string
    const amount =
      typeof data.amount === "string"
        ? parseFloat(data.amount)
        : data.amount;

    // Convert deadline to Date if it's a string
    const deadline =
      data.deadline instanceof Date
        ? data.deadline
        : new Date(data.deadline);

    return await prisma.scholarship.create({
      data: {
        title: data.title,
        organization: data.organization,
        description: data.description,
        amount: amount || null,
        deadline,
        requirements: data.requirements || {},
        source: data.source || "manual-entry",
        sourceUrl: data.sourceUrl,
      },
    });
  } catch (error) {
    console.error("Error creating scholarship:", error);
    throw new Error("Failed to create scholarship");
  }
}

/**
 * Update an existing scholarship
 */
export async function updateScholarship(
  id: string,
  data: Partial<{
    title: string;
    organization: string;
    description: string;
    amount: number | string;
    deadline: Date | string;
    requirements: any;
    sourceUrl: string;
  }>
) {
  try {
    const updateData: any = { ...data };

    // Convert amount to decimal if it's a string
    if (typeof data.amount === "string") {
      updateData.amount = parseFloat(data.amount);
    }

    // Convert deadline to Date if it's a string
    if (typeof data.deadline === "string") {
      updateData.deadline = new Date(data.deadline);
    }

    return await prisma.scholarship.update({
      where: { id },
      data: updateData,
    });
  } catch (error) {
    console.error(`Error updating scholarship ${id}:`, error);
    throw new Error("Failed to update scholarship");
  }
}

/**
 * Delete a scholarship
 */
export async function deleteScholarship(id: string) {
  try {
    return await prisma.scholarship.delete({
      where: { id },
    });
  } catch (error) {
    console.error(`Error deleting scholarship ${id}:`, error);
    throw new Error("Failed to delete scholarship");
  }
}

/**
 * Get or create application for a user-scholarship pair
 */
export async function getOrCreateApplication(
  userId: string,
  scholarshipId: string
) {
  try {
    let application = await prisma.application.findUnique({
      where: {
        userId_scholarshipId: {
          userId,
          scholarshipId,
        },
      },
      include: {
        scholarship: true,
        conversations: {
          orderBy: { updatedAt: "desc" },
          take: 1,
        },
      },
    });

    if (!application) {
      application = await prisma.application.create({
        data: {
          userId,
          scholarshipId,
          status: "not-started",
          step: 1,
        },
        include: {
          scholarship: true,
          conversations: {
            orderBy: { updatedAt: "desc" },
            take: 1,
          },
        },
      });
    }

    return application;
  } catch (error) {
    console.error("Error getting/creating application:", error);
    throw new Error("Failed to get or create application");
  }
}

/**
 * Get application by ID
 */
export async function getApplication(id: string) {
  try {
    return await prisma.application.findUnique({
      where: { id },
      include: {
        scholarship: true,
        user: {
          select: { id: true, email: true },
        },
        conversations: {
          orderBy: { updatedAt: "desc" },
        },
        references: true,
      },
    });
  } catch (error) {
    console.error(`Error fetching application ${id}:`, error);
    throw new Error("Failed to fetch application");
  }
}

/**
 * Get all applications for a user
 */
export async function getApplicationsByUser(
  userId: string,
  filters?: { status?: string }
) {
  try {
    const where: any = { userId };

    if (filters?.status) {
      where.status = filters.status;
    }

    return await prisma.application.findMany({
      where,
      include: {
        scholarship: true,
      },
      orderBy: { updatedAt: "desc" },
    });
  } catch (error) {
    console.error(`Error fetching applications for user ${userId}:`, error);
    throw new Error("Failed to fetch applications");
  }
}

/**
 * Update application
 */
export async function updateApplication(
  id: string,
  data: {
    status?: string;
    step?: number;
    submittedAt?: Date;
    awardedAt?: Date;
  }
) {
  try {
    return await prisma.application.update({
      where: { id },
      data,
    });
  } catch (error) {
    console.error(`Error updating application ${id}:`, error);
    throw new Error("Failed to update application");
  }
}

/**
 * Update application step (for workflow tracking)
 */
export async function updateApplicationStep(
  applicationId: string,
  step: number
) {
  try {
    return await prisma.application.update({
      where: { id: applicationId },
      data: { step },
    });
  } catch (error) {
    console.error(`Error updating application step:`, error);
    throw new Error("Failed to update application step");
  }
}

/**
 * Get scholarships with deadline soon (within X days)
 */
export async function getUrgentScholarships(days: number = 7) {
  try {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + days);

    return await prisma.scholarship.findMany({
      where: {
        deadline: {
          lte: deadline,
          gte: new Date(),
        },
      },
      orderBy: { deadline: "asc" },
    });
  } catch (error) {
    console.error("Error fetching urgent scholarships:", error);
    throw new Error("Failed to fetch urgent scholarships");
  }
}

/**
 * Search scholarships by text
 */
export async function searchScholarships(query: string) {
  try {
    return await prisma.scholarship.findMany({
      where: {
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { organization: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
        ],
      },
      orderBy: { deadline: "asc" },
    });
  } catch (error) {
    console.error("Error searching scholarships:", error);
    throw new Error("Failed to search scholarships");
  }
}

// ============================================================================
// ScrapedScholarship functions
// ============================================================================

/**
 * Get list of scraped scholarships with optional filters
 */
export async function getScrapedScholarshipList(options: {
  userId?: string;
  limit?: number;
  sortBy?: "deadline" | "amount" | "title";
  sortOrder?: "asc" | "desc";
  classLevel?: string;
  gpaMin?: number;
  gpaMax?: number;
  enrollmentStatus?: string;
  portal?: string;
}) {
  const {
    userId,
    limit,
    sortBy = "deadline",
    sortOrder = "asc",
    classLevel,
    gpaMin,
    gpaMax,
    enrollmentStatus,
    portal = "nativeforward",
  } = options;

  try {
    const where: any = { portal };

    // Filter by class level (JSON contains the level)
    if (classLevel) {
      where.classLevel = {
        path: "$",
        array_contains: classLevel,
      };
    }

    // Filter by GPA range
    if (gpaMin !== undefined) {
      where.gpaMin = { lte: gpaMin };
    }
    if (gpaMax !== undefined) {
      where.gpaMax = { gte: gpaMax };
    }

    // Filter by enrollment status
    if (enrollmentStatus) {
      where.enrollmentStatus = enrollmentStatus;
    }

    const scholarships = await prisma.scrapedScholarship.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      take: limit,
    });

    // If userId provided, fetch application status for each scholarship
    if (userId) {
      const applications = await prisma.application.findMany({
        where: { userId },
        select: { scrapedScholarshipId: true, status: true, step: true },
      });

      const applicationMap = new Map(
        applications
          .filter((app) => app.scrapedScholarshipId)
          .map((app) => [app.scrapedScholarshipId!, app])
      );

      return scholarships.map((scholarship) => ({
        ...scholarship,
        applicationStatus: applicationMap.get(scholarship.id)?.status,
        applicationStep: applicationMap.get(scholarship.id)?.step,
      }));
    }

    return scholarships;
  } catch (error) {
    console.error("Error fetching scraped scholarship list:", error);
    throw new Error("Failed to fetch scraped scholarships");
  }
}

/**
 * Get a single scraped scholarship by ID
 */
export async function getScrapedScholarship(id: string) {
  try {
    return await prisma.scrapedScholarship.findUnique({
      where: { id },
    });
  } catch (error) {
    console.error(`Error fetching scraped scholarship ${id}:`, error);
    throw new Error("Failed to fetch scraped scholarship");
  }
}

/**
 * Get or create application for a user-scrapedScholarship pair
 */
export async function getOrCreateScrapedScholarshipApplication(
  userId: string,
  scrapedScholarshipId: string
) {
  try {
    let application = await prisma.application.findUnique({
      where: {
        userId_scrapedScholarshipId: {
          userId,
          scrapedScholarshipId,
        },
      },
      include: {
        scrapedScholarship: true,
        conversations: {
          orderBy: { updatedAt: "desc" },
          take: 1,
        },
      },
    });

    if (!application) {
      application = await prisma.application.create({
        data: {
          userId,
          scrapedScholarshipId,
          status: "not-started",
          step: 1,
        },
        include: {
          scrapedScholarship: true,
          conversations: {
            orderBy: { updatedAt: "desc" },
            take: 1,
          },
        },
      });
    }

    return application;
  } catch (error) {
    console.error("Error getting/creating application:", error);
    throw new Error("Failed to get or create application");
  }
}

/**
 * Get urgent scraped scholarships (within X days)
 */
export async function getUrgentScrapedScholarships(
  days: number = 7,
  portal: string = "nativeforward"
) {
  try {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + days);

    return await prisma.scrapedScholarship.findMany({
      where: {
        portal,
        deadline: {
          lte: deadline,
          gte: new Date(),
        },
      },
      orderBy: { deadline: "asc" },
    });
  } catch (error) {
    console.error("Error fetching urgent scraped scholarships:", error);
    throw new Error("Failed to fetch urgent scraped scholarships");
  }
}
