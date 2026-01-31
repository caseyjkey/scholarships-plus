/**
 * POST /api/extension - Extension API endpoints
 */

import { ActionFunctionArgs, json } from "@remix-run/node";
import { prisma } from "~/db.server";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

/**
 * Verify JWT token and return userId
 */
function verifyExtensionToken(authHeader: string | null): string | null {
  if (!authHeader) {
    return null;
  }

  const match = authHeader.match(/^Bearer (.+)$/);
  if (!match) {
    return null;
  }

  const token = match[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    return decoded.userId;
  } catch {
    return null;
  }
}

/**
 * Get user ID from Authorization header
 */
async function requireExtensionUserId(request: Request): Promise<string> {
  const authHeader = request.headers.get("Authorization");
  const userId = verifyExtensionToken(authHeader);

  if (!userId) {
    throw json(
      { error: "Unauthorized", loginUrl: "http://localhost:3000/login" },
      { status: 401 }
    );
  }

  return userId;
}

/**
 * POST /api/extension/sync-cookies
 * Receive cookies from extension for status checking
 */
async function syncCookies({ request, userId }: { request: Request; userId: string }) {
  const body = await request.json();
  const { scholarshipId, url, portal, cookies } = body;

  if (!portal || !cookies) {
    return json({ error: "Missing portal or cookies" }, { status: 400 });
  }

  try {
    // Update or create portal session
    await prisma.portalSession.upsert({
      where: {
        userId_portal: {
          userId,
          portal,
        },
      },
      update: {
        cookies: JSON.stringify(cookies),
        lastValid: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
      create: {
        userId,
        portal,
        cookies: JSON.stringify(cookies),
        lastValid: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    // TODO: Check scholarship status (deadline, submission status, referral status)
    // This would use the cookies to scrape current status from the portal

    return json({ success: true });
  } catch (error) {
    console.error("Error syncing cookies:", error);
    return json({ error: "Failed to sync cookies" }, { status: 500 });
  }
}

/**
 * POST /api/extension/field-mapping
 * Real-time sync: Save or update a single field mapping
 */
async function saveFieldMapping({ request, userId }: { request: Request; userId: string }) {
  const body = await request.json();
  const {
    scholarshipId,
    fieldName,
    fieldLabel,
    fieldType,
    approvedValue,
    options,
    approved,
  } = body;

  if (!scholarshipId || !fieldName) {
    return json({ error: "Missing scholarshipId or fieldName" }, { status: 400 });
  }

  try {
    const mapping = await prisma.fieldMapping.upsert({
      where: {
        scholarshipId_fieldName: {
          scholarshipId,
          fieldName,
        },
      },
      update: {
        fieldLabel: fieldLabel || fieldName,
        fieldType: fieldType || "text",
        approvedValue,
        options,
        approved: approved ?? false,
        approvedAt: approved ? new Date() : null,
        updatedAt: new Date(),
      },
      create: {
        userId,
        scholarshipId,
        fieldName,
        fieldLabel: fieldLabel || fieldName,
        fieldType: fieldType || "text",
        approvedValue,
        options,
        approved: approved ?? false,
        approvedAt: approved ? new Date() : null,
      },
    });

    return json({ mapping });
  } catch (error) {
    console.error("Error saving field mapping:", error);
    return json({ error: "Failed to save field mapping" }, { status: 500 });
  }
}

/**
 * POST /api/extension/knowledge
 * Add content to global knowledge base
 */
async function addToKnowledge({ request, userId }: { request: Request; userId: string }) {
  const body = await request.json();
  const { type, category, title, content, confidence = 0.8, source } = body;

  if (!type || !title || !content) {
    return json(
      { error: "Missing required fields: type, title, content" },
      { status: 400 }
    );
  }

  try {
    // Generate embedding
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: `${title}: ${content}`,
    });
    const embedding = embeddingResponse.data[0].embedding;

    const knowledge = await prisma.globalKnowledge.create({
      data: {
        userId,
        type,
        category,
        title,
        content,
        confidence,
        source: source || "extension",
        verified: false, // User should verify in interview
        embedding: JSON.stringify(embedding),
      },
    });

    return json({ knowledge });
  } catch (error) {
    console.error("Error adding to knowledge base:", error);
    return json({ error: "Failed to add to knowledge base" }, { status: 500 });
  }
}

/**
 * POST /api/extension/chat
 * Agent chat endpoint with semantic knowledge search
 */
async function chatAction({ request, userId }: { request: Request; userId: string }) {
  const body = await request.json();
  const { scholarshipId, applicationId, message, fieldName, fieldLabel, init } = body;

  // Handle initial greeting when conversation opens
  if (init === true) {
    try {
      // Get scholarship details
      const scholarship = await prisma.scrapedScholarship.findUnique({
        where: { id: scholarshipId },
      });

      // Get application-specific context
      let appContext = [];
      if (applicationId) {
        appContext = await prisma.applicationContext.findMany({
          where: { applicationId },
          orderBy: { sectionId: "asc" },
        });
      }

      // Get approved field mappings for this application
      const approvedMappings = await prisma.fieldMapping.findMany({
        where: {
          scholarshipId,
          userId,
          approved: true,
        },
      });

      // Build a friendly greeting
      const draftCount = appContext.length;
      const mappingCount = approvedMappings.length;
      const scholarshipTitle = scholarship?.title || "this scholarship";

      let greeting = `Hi! I'm helping you with your application for **${scholarshipTitle}**.\n\n`;

      if (fieldName && fieldLabel) {
        greeting += `You're working on: **${fieldLabel}**\n\n`;
      }

      if (draftCount > 0) {
        greeting += `You have ${draftCount} section${draftCount > 1 ? 's' : ''} drafted for this application so far. `;
      }

      if (mappingCount > 0) {
        greeting += `You've completed ${mappingCount} field${mappingCount > 1 ? 's' : ''}.`;
      }

      if (draftCount === 0 && mappingCount === 0) {
        greeting += `Let's get started! I can help you craft a response by pulling from your past experiences and knowledge base.\n\nWhat would you like to say for this field?`;
      } else {
        greeting += `\n\nHow can I help you with this field?`;
      }

      return json({
        response: greeting,
        isGreeting: true,
      });
    } catch (error) {
      console.error("Error generating greeting:", error);
      return json({
        response: "Hi! I'm here to help you fill out this application. What field would you like to work on?",
        isGreeting: true,
      });
    }
  }

  if (!message) {
    return json({ error: "Missing message" }, { status: 400 });
  }

  try {
    // 1. Generate embedding for user's message
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: message,
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;
    const embeddingStr = JSON.stringify(queryEmbedding);

    // 2. Semantic search in GlobalKnowledge
    const knowledgeResults = await prisma.$queryRaw`
      SELECT
        id,
        type,
        category,
        title,
        content,
        confidence,
        verified,
        (embedding <#> ${embeddingStr}::vector) * -1 AS similarity
      FROM "GlobalKnowledge"
      WHERE
        userId = ${userId}
        AND verified = true
      ORDER BY similarity DESC
      LIMIT 5
    ` as any[];

    // 3. Get application-specific context
    let appContext = [];
    if (applicationId) {
      appContext = await prisma.applicationContext.findMany({
        where: {
          applicationId,
        },
        orderBy: { sectionId: "asc" },
      });
    }

    // 4. Get scholarship details
    const scholarship = await prisma.scrapedScholarship.findUnique({
      where: { id: scholarshipId },
      include: {
        fieldMappings: {
          where: { approved: true },
        },
      },
    });

    // 5. Build agent context
    const agentContext = {
      scholarshipTitle: scholarship?.title,
      fieldName,
      fieldLabel,
      message,
      relevantKnowledge: knowledgeResults.map((k) => ({
        id: k.id,
        type: k.type,
        category: k.category,
        title: k.title,
        content: k.content,
        similarity: k.similarity,
        verified: k.verified,
      })),
      applicationContext: appContext.map((ctx) => ({
        sectionId: ctx.sectionId,
        questionSummary: ctx.questionSummary,
        responseDraft: ctx.responseDraft,
        referencedGlobalKnowledge: ctx.referencedGlobalKnowledge,
      })),
      existingMappings: scholarship?.fieldMappings || [],
    };

    // 6. Call agent with full context
    const agentResponse = await callAgentWithContext(userId, agentContext);

    // 7. Save ApplicationContext if agent drafted a response
    if (agentResponse.responseDraft && applicationId) {
      await prisma.applicationContext.create({
        data: {
          userId,
          applicationId,
          sectionId: fieldName || `chat_${Date.now()}`,
          sectionType: "chat",
          questionSummary: message,
          responseDraft: agentResponse.responseDraft,
          referencedGlobalKnowledge: agentResponse.referencedKnowledge || [],
        },
      });
    }

    // 8. Update GlobalKnowledge useCount
    if (agentResponse.referencedKnowledge && agentResponse.referencedKnowledge.length > 0) {
      await prisma.globalKnowledge.updateMany({
        where: {
          id: { in: agentResponse.referencedKnowledge },
        },
        data: {
          useCount: { increment: 1 },
          lastUsedAt: new Date(),
        },
      });
    }

    // 9. Save field mappings if agent suggested them
    const updatedMappings = [];
    if (agentResponse.fieldMappings && agentResponse.fieldMappings.length > 0) {
      for (const mapping of agentResponse.fieldMappings) {
        const saved = await prisma.fieldMapping.upsert({
          where: {
            scholarshipId_fieldName: {
              scholarshipId,
              fieldName: mapping.fieldName,
            },
          },
          update: {
            fieldLabel: mapping.fieldLabel,
            fieldType: mapping.fieldType,
            approvedValue: mapping.approvedValue,
            options: mapping.options,
            approved: false, // Not yet approved by user
            updatedAt: new Date(),
          },
          create: {
            userId,
            scholarshipId,
            fieldName: mapping.fieldName,
            fieldLabel: mapping.fieldLabel,
            fieldType: mapping.fieldType,
            approvedValue: mapping.approvedValue,
            options: mapping.options,
            approved: false,
          },
        });
        updatedMappings.push(saved);
      }
    }

    return json({
      response: agentResponse.text,
      fieldMappings: updatedMappings,
      suggestedKnowledge: knowledgeResults,
      referencedKnowledge: agentResponse.referencedKnowledge,
    });
  } catch (error) {
    console.error("Error in chat:", error);
    return json({ error: "Failed to process chat message" }, { status: 500 });
  }
}

/**
 * Call agent with full context (GlobalKnowledge + ApplicationContext)
 * Uses GLM-4-flash from Zhipu AI
 */
async function callAgentWithContext(userId: string, context: any) {
  if (!process.env.GLM_API_KEY) {
    throw new Error("GLM_API_KEY is not set");
  }

  // Build prompt with knowledge context
  const systemPrompt = `You are a scholarship application assistant. Help users craft compelling responses using their past experiences and knowledge. Only save field mappings when the user explicitly accepts a suggestion.

IMPORTANT:
- Use relevant knowledge to help draft responses
- Adapt knowledge to fit the specific scholarship requirements
- Reference knowledge items by ID when using them
- Only save field mappings if user explicitly accepts (says "yes", "use that", "perfect", etc.)
- If user asks to edit/refine, provide the refined version without saving
- Reference knowledge items as [Knowledge: ID]`;

  const userPrompt = `
Scholarship: ${context.scholarshipTitle || "a scholarship"}

${context.fieldName ? `CURRENT FIELD: ${context.fieldLabel || context.fieldName}` : ""}

RELEVANT KNOWLEDGE (from user's past experiences):
${
  context.relevantKnowledge.length > 0
    ? context.relevantKnowledge
        .map(
          (k: any, i: number) => `
${i + 1}. [${k.type} - ${k.category || "General"}] ${k.title}
   Similarity: ${Math.round(k.similarity * 100)}%
   Content: ${k.content}
`
        )
        .join("\n")
    : "No relevant past experiences found."
}

APPLICATION-SPECIFIC CONTEXT (what user has drafted for this app):
${
  context.applicationContext.length > 0
    ? context.applicationContext
        .map(
          (ctx: any) => `
- Section: ${ctx.sectionId}
  Question: ${ctx.questionSummary}
  Draft: ${ctx.responseDraft || "Not drafted yet"}
`
        )
        .join("\n")
    : "No previous drafts for this application."
}

${
  context.existingMappings.length > 0
    ? `EXISTING FIELD MAPPINGS:
${context.existingMappings
  .map(
    (f: any) => `
- ${f.fieldLabel} (${f.fieldName}): ${f.approvedValue ? "Has saved response" : "No response"}
`
  )
  .join("\n")}`
    : ""
}

USER MESSAGE: ${context.message}

Respond with valid JSON:
{
  "text": "Your response to user",
  "fieldMappings": [...] (optional, only if user accepts suggestions),
  "referencedKnowledge": ["id1", "id2"] (knowledge items used),
  "responseDraft": "Full drafted response" (optional, for ApplicationContext)
}
`;

  try {
    // Call GLM-4-flash API
    const apiUrl = process.env.ZAI_API_URL || process.env.GLM_API_URL || "https://api.z.ai/api/coding/paas/v4/chat/completions";
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GLM_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "glm-4.7",
        // Disable chain-of-thought thinking mode to get direct responses
        thinking: {
          type: "disabled",
        },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.5,
        max_tokens: 2000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GLM API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return JSON.parse(data.choices[0].message.content || "{}");
  } catch (error) {
    console.error("Error calling GLM:", error);
    return {
      text: "I'm sorry, I'm having trouble generating a response right now. Please try again.",
      fieldMappings: [],
      referencedKnowledge: [],
    };
  }
}

/**
 * Main action handler
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const userId = await requireExtensionUserId(request);
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  switch (action) {
    case "sync-cookies":
      return syncCookies({ request, userId });

    case "field-mapping":
      return saveFieldMapping({ request, userId });

    case "knowledge":
      return addToKnowledge({ request, userId });

    case "chat":
      return chatAction({ request, userId });

    default:
      return json({ error: "Invalid action" }, { status: 400 });
  }
};
