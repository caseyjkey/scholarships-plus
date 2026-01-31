import { ActionFunctionArgs, json } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { prisma } from "~/db.server";
import { searchRelevantChunks } from "~/lib/embeddings.server";

interface ChatContext {
  step: string;
  scholarshipId?: string;
  scholarshipName?: string;
  portal?: string;
  applicationUrl?: string;
  requirements?: string[];
  currentRequirement?: number;
  completedRequirements?: Record<string, string>;
  currentChunks?: any[];
}

interface ChatRequest {
  message: string;
  scholarshipId?: string;
  context: ChatContext;
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const { message, context }: ChatRequest = await request.json();

  switch (context.step) {
    case 'start': {
      const scholarships = await prisma.scrapedScholarship.findMany({
        take: 10,
        orderBy: { deadline: 'asc' }
      });

      return json({
        message: "Welcome! I can help you apply for scholarships. I have access to " + scholarships.length + " scholarships.\n\nWhich scholarship would you like to apply for?",
        context: { step: 'awaiting_selection' },
        options: scholarships.map(s => ({ id: s.id, title: s.title, deadline: s.deadline }))
      });
    }

    case 'awaiting_selection': {
      const scholarship = await prisma.scrapedScholarship.findUnique({
        where: { id: message }
      });

      if (!scholarship) {
        return json({
          message: "I couldn't find that scholarship. Please try again.",
          context
        });
      }

      const requirements = scholarship.requirements as any;
      const requirementList = requirements?.requirements || [];

      const reqList = requirementList.map((r: string, i: number) => (i + 1) + ". " + r).join('\n');

      return json({
        message: "Great choice! **" + scholarship.title + "** is due " + new Date(scholarship.deadline).toLocaleDateString() + ".\n\nHere are the requirements:\n" + reqList + "\n\nLet's go through these one by one. I'll search your past essays for relevant content.\n\n**Requirement 1:** " + requirementList[0] + "\n\nSearching your essays...",
        context: {
          step: 'processing_requirements',
          scholarshipId: scholarship.id,
          scholarshipName: scholarship.title,
          portal: scholarship.portal,
          applicationUrl: scholarship.applicationUrl,
          requirements: requirementList,
          currentRequirement: 0,
          completedRequirements: {}
        }
      });
    }

    case 'processing_requirements': {
      const { requirements, currentRequirement = 0, completedRequirements = {} } = context;

      if (!requirements) {
        return json({
          message: "Sorry, I couldn't find the requirements for this scholarship.",
          context: { step: 'start' }
        });
      }

      // Check if user just confirmed/approved the current requirement
      const confirmed = message.toLowerCase().startsWith('yes') || message.toLowerCase().startsWith('that works');
      const edited = message.toLowerCase().startsWith('edit:') || message.toLowerCase().startsWith('here is');

      if (confirmed || edited) {
        // Save user's answer to completed requirements
        const currentReqText = requirements[currentRequirement];
        const userAnswer = edited ? message.replace(/^(edit:|here is)/i, '').trim() : "Approved";
        const updatedCompleted = { ...completedRequirements, [currentReqText]: userAnswer };

        // Save to Application table incrementally
        if (context.scholarshipId) {
          await prisma.application.upsert({
            where: {
              userId_scrapedScholarshipId: {
                userId,
                scrapedScholarshipId: context.scholarshipId
              }
            },
            create: {
              userId,
              scrapedScholarshipId: context.scholarshipId,
              status: 'draft',
              answers: updatedCompleted
            },
            update: {
              answers: updatedCompleted
            }
          });
        }

        // Move to next requirement
        const nextReq = currentRequirement + 1;

        if (nextReq >= requirements.length) {
          const reqsText = Object.entries(updatedCompleted)
            .map(([req, content]) => "**" + req + ":**\n" + content)
            .join('\n\n');

          return json({
            message: "✅ All requirements gathered! Here's what we have:\n\n" + reqsText,
            context: {
              step: 'ready_to_submit',
              scholarshipId: context.scholarshipId,
              scholarshipName: context.scholarshipName,
              portal: context.portal,
              applicationUrl: context.applicationUrl,
              completedRequirements: updatedCompleted
            }
          });
        }

        // Process next requirement
        const nextReqText = requirements[nextReq];
        const chunks = await searchRelevantChunks(userId, nextReqText, 3);

        let suggestedContent = '';
        if (chunks.length > 0) {
          const formattedChunks = chunks.map(c =>
            "- From \"" + c.metadata.essayTitle + "\":\n  \"" + c.content.substring(0, 200) + "...\""
          ).join('\n\n');

          suggestedContent = "Great! Moving on...\n\nI found some relevant content from your past essays:\n\n" + formattedChunks + "\n\n";
          suggestedContent += "**Requirement " + (nextReq + 1) + ":** " + nextReqText + "\n\n";
          suggestedContent += "Here's a suggestion based on your essays:\n\n[AI would generate content]\n\n";
        } else {
          suggestedContent = "**Requirement " + (nextReq + 1) + ":** " + nextReqText + "\n\n";
          suggestedContent += "Let me know your thoughts on this one.";
        }

        suggestedContent += "\n\nReply with your answer, or 'yes' to approve my suggestion.";

        return json({
          message: suggestedContent,
          context: {
            ...context,
            currentRequirement: nextReq,
            completedRequirements: updatedCompleted
          }
        });
      }

      // First time entering this step or user rejected
      if (Object.keys(completedRequirements).length === 0 && !('currentChunks' in context)) {
        const currentReqText = requirements[currentRequirement];
        const chunks = await searchRelevantChunks(userId, currentReqText, 3);

        let suggestedContent = '';
        if (chunks.length > 0) {
          const formattedChunks = chunks.map(c =>
            "- From \"" + c.metadata.essayTitle + "\":\n  \"" + c.content.substring(0, 200) + "...\""
          ).join('\n\n');

          suggestedContent = "I found some relevant content from your past essays:\n\n" + formattedChunks + "\n\n";
          suggestedContent += "**Requirement 1:** " + currentReqText + "\n\n";
          suggestedContent += "Here's a suggestion:\n\n[AI generated content based on your essays]\n\n";
        } else {
          suggestedContent = "**Requirement 1:** " + currentReqText + "\n\n";
          suggestedContent += "I'll help you craft a response for this.";
        }

        suggestedContent += "\n\nWhat would you like to say? Or reply 'yes' if my suggestion looks good.";

        return json({
          message: suggestedContent,
          context: {
            ...context,
            currentChunks: chunks
          }
        });
      }

      // User said "no" or something else - ask again
      return json({
        message: "No problem. Let's try again. **" + requirements[currentRequirement] + "**\n\nWhat would you like to say?",
        context
      });
    }

    case 'ready_to_submit': {
      return json({
        message: "Ready to submit to " + context.scholarshipName + "! \n\nYou'll need to connect your " + context.portal + " account first so I can submit on your behalf.",
        context: {
          ...context,
          step: 'awaiting_portal_connection'
        }
      });
    }

    case 'awaiting_portal_connection': {
      return json({
        message: "Account connected! Submitting your application now...",
        context: {
          ...context,
          step: 'submitting'
        }
      });
    }

    default:
      return json({
        message: "I'm not sure what to do next. Could you rephrase that?",
        context: { step: 'start' }
      });
  }
}
