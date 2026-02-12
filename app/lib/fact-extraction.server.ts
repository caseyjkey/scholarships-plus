/**
 * Fact Extraction Module
 *
 * Extracts structured facts (name, email, GPA, university, major, etc.)
 * from essay text using LLM and stores them in GlobalKnowledge for
 * efficient retrieval during form filling.
 */

import OpenAI from "openai";
import { prisma } from "~/db.server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Extract structured facts from an essay and store in GlobalKnowledge
 * This runs after essay upload to populate the obvious field knowledge base
 */
export async function extractAndStoreFacts(
  userId: string,
  essayId: string,
  essayText: string
): Promise<{ extracted: number; stored: number; errors: string[] }> {
  const errors: string[] = [];
  let extracted = 0;
  let stored = 0;

  try {
    console.log(`[FactExtraction] Starting fact extraction for essay ${essayId}`);

    // Skip empty or very short essays
    if (!essayText || essayText.trim().length < 50) {
      console.log(`[FactExtraction] Skipping essay ${essayId} - too short or empty`);
      return { extracted: 0, stored: 0, errors: [] };
    }

    // Use LLM to extract structured facts
    const extractedFacts = await extractFactsWithLLM(essayText);
    extracted = extractedFacts.length;

    console.log(`[FactExtraction] Extracted ${extractedFacts.length} facts from essay ${essayId}`);

    if (extractedFacts.length === 0) {
      console.log(`[FactExtraction] No facts extracted from essay ${essayId}`);
      return { extracted: 0, stored: 0, errors: [] };
    }

    // Log the facts we're about to store
    console.log(`[FactExtraction] Facts to store:`, extractedFacts.map(f => `${f.field}=${f.value}`));

    // Store each fact in GlobalKnowledge with conflict detection
    for (const fact of extractedFacts) {
      try {
        // CONFLICT DETECTION: Check if we already have a different value for this field
        const existingFacts = await prisma.globalKnowledge.findMany({
          where: {
            userId,
            type: "obvious_field",
            title: fact.field,
          },
          select: {
            id: true,
            content: true,
            source: true,
          },
        });

        // Extract values from existing facts
        const existingValues = existingFacts
          .map(f => {
            const match = f.content.match(/^Value:\s*(.+)$/m);
            return match ? match[1].trim() : null;
          })
          .filter(v => v !== null && v !== 'null');

        // Check if this exact value already exists (avoid duplicates)
        if (existingValues.includes(fact.value)) {
          console.log(`[FactExtraction] ℹ️  Fact "${fact.field} = ${fact.value}" already exists, skipping duplicate`);
          continue;
        }

        // Log when storing multiple candidates for the same field
        if (existingValues.length > 0) {
          console.log(
            `[FactExtraction] ℹ️  Multiple candidates for "${fact.field}":\n` +
            `   Existing: ${existingValues.join(', ')}\n` +
            `   Adding: ${fact.value}\n` +
            `   These will be presented as options for user to choose.`
          );
        }

        // Generate embedding for semantic search
        console.log(`[FactExtraction] Generating embedding for: ${fact.field}=${fact.value}`);
        const embeddingResponse = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: `${fact.field}: ${fact.value}`,
        });

        // Create GlobalKnowledge entry with "Value:" format
        // Replace spaces in field name with underscores for ID
        const fieldSlug = fact.field.replace(/\s+/g, '_');
        const factId = `fact-${essayId}-${fieldSlug}-${Date.now()}`;
        console.log(`[FactExtraction] Creating GlobalKnowledge entry: ${factId}`);

        // First create the knowledge entry without embedding (pgvector requires raw SQL for embedding)
        const knowledge = await prisma.globalKnowledge.create({
          data: {
            id: factId,
            userId,
            type: "obvious_field",
            category: "personal_info",
            title: fact.field,
            content: `Value: ${fact.value}`,
            source: `essay:${essayId}`,
            sourceEssay: essayId,
            confidence: fact.confidence || 0.9,
            verified: false, // Facts need user confirmation via chat to be verified
          },
        });

        // Then set embedding via raw SQL (required for pgvector)
        await prisma.$executeRaw`
          UPDATE "GlobalKnowledge"
          SET embedding = ${JSON.stringify(embeddingResponse.data[0].embedding)}::vector(1536)
          WHERE id = ${knowledge.id}
        `;

        stored++;
        console.log(`[FactExtraction] ✅ Stored fact: ${fact.field} = ${fact.value}`);
      } catch (error: any) {
        const errorMsg = `Failed to store fact ${fact.field}: ${error.message}`;
        console.error(`[FactExtraction] ❌ ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    console.log(`[FactExtraction] ✅ Completed fact extraction for essay ${essayId}: ${stored}/${extracted} stored`);
  } catch (error: any) {
    const errorMsg = `Failed to extract facts for essay ${essayId}: ${error.message}`;
    console.error(`[FactExtraction] ❌ ${errorMsg}`);
    errors.push(errorMsg);
  }

  return { extracted, stored, errors };
}

/**
 * Use LLM to extract structured facts from essay text
 */
async function extractFactsWithLLM(
  essayText: string
): Promise<Array<{ field: string; value: string; confidence?: number }>> {
  // Truncate essay if too long (max 4000 tokens for input)
  const truncatedText = essayText.length > 12000
    ? essayText.substring(0, 12000) + "..."
    : essayText;

  const prompt = `You are extracting facts about THE ESSAY AUTHOR ONLY from their scholarship application materials.

ESSAY TEXT:
"""
${truncatedText}
"""

Extract ONLY information about the person who SUBMITTED this document (the applicant).

CRITICAL RULES - PREVENTING GARBAGE DATA:
1. Extract information in FIRST-PERSON context ("I", "my", "me") OR in PROFILE/FORM format (labeled fields about the applicant)
2. DO NOT extract information about OTHER people mentioned in the text (mentors, collaborators, references)
3. DO NOT extract information from quotes, examples, or stories about others
4. Use null if information is ambiguous or clearly about someone else
5. If multiple conflicting values appear, prefer the one in first-person or labeled field format

FORMATS TO EXTRACT:
✅ First-person: "My email is john@example.com" → john@example.com
✅ Labeled fields: "Email Address: john@example.com" → john@example.com
✅ Profile format: "Name: John Doe" → John Doe
✅ First-person narrative: "I am a Computer Science major at MIT" → Computer Science, MIT

FORMATS TO REJECT:
❌ Other people: "I worked with Jane (jane@example.com)" → null (Jane's email, not applicant's)
❌ References: "My mentor Dr. Smith (smith@university.edu)" → null (mentor's email, not applicant's)
❌ Examples: "Students should email admissions@college.edu" → null (college email, not applicant's)
❌ Third-person about others: "Jane majored in Biology" → null (not about applicant)

MORE EXAMPLES:
✅ "Phone Number: (307) 732-3701" → 307-732-3701
✅ "University: University of Southern California" → University of Southern California
✅ "I maintain a 3.8 GPA" → 3.8
❌ "The average GPA was 3.5" → null (not about applicant)
❌ "Contact my advisor at advisor@school.edu" → null (advisor's email)

Return ONLY valid JSON with these fields:
{
  "firstName": "first name of APPLICANT or null",
  "lastName": "last name of APPLICANT or null",
  "email": "email address of APPLICANT or null",
  "phone": "phone number of APPLICANT or null",
  "gpa": "GPA of APPLICANT as number or null",
  "university": "university APPLICANT attends or null",
  "college": "college APPLICANT attends or null",
  "major": "major/field of study of APPLICANT or null",
  "degree": "degree type APPLICANT is pursuing or null",
  "year": "class year of APPLICANT or null",
  "state": "state where APPLICANT lives or null",
  "city": "city where APPLICANT lives or null"
}

STRICT REQUIREMENTS:
- Return ONLY the JSON object, no explanations
- Use null for missing, ambiguous, or other people's information
- DO NOT guess or make up values
- GPA should be a number (e.g., 3.8 not "3.8 GPA")
- When in doubt, use null

Output:`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are a structured data extraction system. Extract factual information from text and return it as JSON. Only include information explicitly stated in the text. Use null for missing information.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.1,
      max_tokens: 500,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      return [];
    }

    const extracted = JSON.parse(content);

    // Convert to array of {field, value} objects, filtering out null values
    const facts: Array<{ field: string; value: string; confidence?: number }> = [];

    const fieldMapping: Record<string, string> = {
      firstName: "First Name",
      lastName: "Last Name",
      email: "Email Address",
      phone: "Phone Number",
      gpa: "Cumulative GPA",
      university: "University",
      college: "College",
      major: "Major",
      degree: "Degree",
      year: "Class Year",
      state: "State",
      city: "City",
    };

    for (const [key, value] of Object.entries(extracted)) {
      if (value !== null && value !== undefined && value !== "") {
        const fieldName = fieldMapping[key] || key;
        facts.push({
          field: fieldName,
          value: String(value),
          confidence: 0.95, // High confidence for LLM-extracted facts
        });
      }
    }

    return facts;
  } catch (error) {
    console.error("[FactExtraction] LLM extraction failed:", error);
    return [];
  }
}

/**
 * Re-extract facts from all essays for a user
 * Useful for improving extraction after code changes
 */
export async function reextractFactsForUser(userId: string): Promise<void> {
  try {
    // Get all essays for user
    const essays = await prisma.essay.findMany({
      where: { userId },
      select: { id: true, body: true },
    });

    console.log(`[FactExtraction] Re-extracting facts for ${essays.length} essays`);

    // Delete existing obvious_field facts for this user
    await prisma.globalKnowledge.deleteMany({
      where: {
        userId,
        type: "obvious_field",
      },
    });

    console.log(`[FactExtraction] Deleted existing obvious_field facts`);

    // Re-extract from each essay
    for (const essay of essays) {
      if (essay.body) {
        await extractAndStoreFacts(userId, essay.id, essay.body);
      }
    }

    console.log(`[FactExtraction] Completed re-extraction for user ${userId}`);
  } catch (error) {
    console.error(`[FactExtraction] Re-extraction failed for user ${userId}:`, error);
    throw error;
  }
}
