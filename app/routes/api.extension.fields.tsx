/**
 * POST /api/extension/fields
 *
 * Extension endpoint to:
 * 1. Receive extracted fields from a scholarship application page
 * 2. Create/update FieldMapping records
 * 3. Trigger AI generation for new fields
 * 4. Return current field mappings (empty if first visit)
 *
 * Request body:
 * {
 *   url: string,           // Current page URL
 *   fields: Array<{
 *     fieldName: string,   // name or id attribute
 *     fieldLabel: string,  // Human-readable label
 *     fieldType: string,   // text, select, textarea, etc.
 *     cssSelector: string, // CSS selector for element
 *     xpath: string,       // XPath locator
 *     position: number,    // Nth field of this type
 *     options?: Array<{label, value}> // For select fields
 *   }>
 * }
 *
 * Response:
 * {
 *   scholarshipId: string,
 *   applicationId?: string,
 *   mappings: Array<{
 *     fieldName: string,
 *     approvedValue: string | null,
 *     generating: boolean
 *   }>
 * }
 */

import { ActionFunctionArgs, json } from "@remix-run/node";
import { prisma } from "~/db.server";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

/**
 * Verify JWT token and return userId
 */
function verifyExtensionToken(authHeader: string | null): string | null {
  if (!authHeader) return null;

  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) return null;

  try {
    const decoded = jwt.verify(match[1], JWT_SECRET) as { userId: string };
    return decoded.userId;
  } catch {
    return null;
  }
}

/**
 * Generate CSS selector for an element
 */
function generateCSSSelector(element: any): string {
  if (element.id) {
    return `#${element.id}`;
  }

  if (element.name) {
    const tagName = element.tagName?.toLowerCase() || 'input';
    return `${tagName}[name="${element.name}"]`;
  }

  // Fallback: use tag + nth-of-type
  return `${element.tagName?.toLowerCase() || 'input'}:nth-of-type(${(element.position || 0) + 1})`;
}

/**
 * Extract domain from URL to identify scholarship portal
 */
function extractPortal(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return "unknown";
  }
}

/**
 * Extract program/app ID from SmarterSelect URL
 * Examples:
 * - https://app.smarterselect.com/programs/105562-Name -> 105562
 * - https://app.smarterselect.com/app/5607751/edit -> 5607751
 */
function extractProgramId(url: string): string | null {
  // Try /programs/##### format first
  let match = url.match(/\/programs\/(\d+)/);
  if (match) return match[1];

  // Try /app/##### format (SmarterSelect edit/application URLs)
  match = url.match(/\/app\/(\d+)/);
  if (match) return match[1];

  return null;
}

/**
 * Find or create scholarship by URL
 * @param url - The application URL
 * @param userId - The user ID
 * @param extractedTitle - Optional title extracted from page content
 */
async function findOrCreateScholarship(url: string, userId: string, extractedTitle?: string) {
  // Try to find existing scholarship by exact URL
  let scholarship = await prisma.scrapedScholarship.findFirst({
    where: {
      applicationUrl: url,
    },
  });

  if (scholarship) {
    return scholarship;
  }

  // Try partial URL match (in case URL has query params or trailing slash differences)
  scholarship = await prisma.scrapedScholarship.findFirst({
    where: {
      applicationUrl: {
        contains: url.split('?')[0], // Match without query params
      },
    },
  });

  if (scholarship) {
    return scholarship;
  }

  // Try to match by program ID (for SmarterSelect URLs)
  const programId = extractProgramId(url);
  if (programId) {
    scholarship = await prisma.scrapedScholarship.findFirst({
      where: {
        applicationUrl: {
          contains: programId,
        },
      },
    });

    if (scholarship) {
      // Update the applicationUrl to the exact URL for future matches
      await prisma.scrapedScholarship.update({
        where: { id: scholarship.id },
        data: { applicationUrl: url },
      });
      return scholarship;
    }
  }

  // Check if any existing scholarship contains this URL (reverse match)
  scholarship = await prisma.scrapedScholarship.findFirst({
    where: {
      applicationUrl: {
        contains: extractProgramId(url) || extractPortal(url),
      },
    },
  });

  if (scholarship) {
    return scholarship;
  }

  // Create new scholarship record with extracted title from page content
  let title = extractedTitle;

  // Fall back to URL-based title extraction if no title was provided
  if (!title) {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    title = `Application from ${extractPortal(url)}`;

    // Try to extract a better title from the URL path
    if (pathParts.length > 0) {
      const lastPart = pathParts[pathParts.length - 1];
      if (lastPart && lastPart.length > 0 && lastPart !== 'apply') {
        // Convert kebab-case or snake_case to Title Case
        title = lastPart
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, l => l.toUpperCase())
          .substring(0, 100); // Limit length
      }
    }
  }

  scholarship = await prisma.scrapedScholarship.create({
    data: {
      title,
      portal: extractPortal(url),
      description: "Scholarship application detected by browser extension",
      applicationUrl: url,
      sourceUrl: url,
      deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      requirements: {},
      scrapeStatus: "success",
    },
  });

  return scholarship;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  // Verify authentication
  const authHeader = request.headers.get("Authorization");
  const userId = verifyExtensionToken(authHeader);

  if (!userId) {
    return json(
      { error: "Unauthorized", loginUrl: "http://localhost:3000/login" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { url, fields, scholarshipTitle: extractedTitle } = body;

    if (!url || !Array.isArray(fields)) {
      return json({ error: "Missing required fields: url, fields" }, { status: 400 });
    }

    // Find or create scholarship with extracted title
    const scholarship = await findOrCreateScholarship(url, userId, extractedTitle);

    // Find or create application
    let application = await prisma.application.findFirst({
      where: {
        scrapedScholarshipId: scholarship.id,
        userId,
      },
    });

    if (!application) {
      application = await prisma.application.create({
        data: {
          scrapedScholarshipId: scholarship.id,
          userId,
          status: "not_started",
        },
      });
    }

    // Process each field
    const fieldPromises = fields.map(async (field: any) => {
      const {
        fieldName,
        fieldLabel,
        fieldType,
        cssSelector,
        xpath,
        position,
        options,
      } = field;

      // Use upsert to handle race conditions and duplicate attempts
      return prisma.fieldMapping.upsert({
        where: {
          scholarshipId_fieldName: {
            scholarshipId: scholarship.id,
            fieldName,
          },
        },
        create: {
          scholarshipId: scholarship.id,
          userId,
          fieldName,
          fieldLabel,
          fieldType,
          cssSelector: cssSelector || generateCSSSelector(field),
          xpath,
          position,
          options,
          source: "extension",
          approved: false,
          generating: false,
        },
        update: {
          // Don't overwrite approvedValue or generating status
          fieldLabel,
          fieldType,
          cssSelector: cssSelector || generateCSSSelector(field),
          xpath,
          position,
          options,
        },
      });
    });

    const mappings = await Promise.all(fieldPromises);

    // Trigger background AI generation for fields without approvedValue
    const fieldsNeedingGeneration = mappings.filter((m) => !m.approvedValue && !m.generating);

    if (fieldsNeedingGeneration.length > 0) {
      // Mark as generating
      await prisma.fieldMapping.updateMany({
        where: {
          id: { in: fieldsNeedingGeneration.map((f) => f.id) },
        },
        data: { generating: true },
      });

      // Trigger background generation (non-blocking)
      setTimeout(async () => {
        try {
          // Import the generation function
          const { generateFieldResponse } = await import("~/lib/field-generation.server");

          for (const field of fieldsNeedingGeneration) {
            try {
              // Generate response for this field
              const generatedValue = await generateFieldResponse({
                userId,
                applicationId: application.id,
                field: {
                  fieldName: field.fieldName,
                  fieldLabel: field.fieldLabel,
                  fieldType: field.fieldType,
                },
                scholarship,
              });

              // Update the mapping with the generated value
              await prisma.fieldMapping.update({
                where: { id: field.id },
                data: {
                  approvedValue: generatedValue,
                  generating: false,
                  approved: true, // Auto-approve AI-generated responses
                  approvedAt: new Date(),
                },
              });

              console.log(`Generated response for field: ${field.fieldName}`);
            } catch (error) {
              console.error(`Failed to generate for field ${field.fieldName}:`, error);

              // Mark generating as false even on failure
              await prisma.fieldMapping.update({
                where: { id: field.id },
                data: { generating: false },
              });
            }
          }
        } catch (error) {
          console.error("Background generation error:", error);
        }
      }, 100); // Small delay to ensure response is sent first
    }

    // Return formatted response
    const responseMappings = mappings.map((mapping) => ({
      fieldName: mapping.fieldName,
      approvedValue: mapping.approvedValue,
      generating: mapping.generating,
    }));

    return json({
      scholarshipId: scholarship.id,
      scholarshipTitle: scholarship.title,
      applicationId: application.id,
      mappings: responseMappings,
    });
  } catch (error) {
    console.error("Error processing extension fields:", error);
    return json({ error: "Failed to process fields" }, { status: 500 });
  }
};
