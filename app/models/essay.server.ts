import type { User, Essay, EssayDraft, Application, Scholarship } from "@prisma/client";

import OpenAI from "openai";
import { prisma } from "~/db.server";

export type { Essay, EssayDraft, Application, Scholarship } from "@prisma/client";

export type EssayDraftWithRelations = EssayDraft & {
  application: Application & {
    scholarship: Scholarship;
  };
  parent: EssayDraft | null;
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Store API key in environment variables
});

export function getEssay({
  id,
  userId,
}: Pick<Essay, "id"> & {
  userId: User["id"];
}) {
  return prisma.essay.findFirst({
    select: { id: true, body: true, essayPrompt: true },
    where: { id, userId },
  });
}

export function getEssayListItems({ userId }: { userId: User["id"] }) {
  return prisma.essay.findMany({
    where: { userId },
    select: { id: true, essayPrompt: true },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createEssay({
  body,
  essayPrompt,
  userId,
}: Pick<Essay, "body" | "essayPrompt"> & {
  userId: User["id"];
}) {
  // Call OpenAI API to generate an essay
  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo", // or "gpt-3.5-turbo"
    messages: [
      { role: "system", content: "You are an AI that writes essays." },
      { role: "user", content: `Prompt: "${essayPrompt}". Notes: "${body}".` },
    ],
    max_tokens: 1000,
  });

  const choices = response.choices; // This contains the chat responses
  const essayContent = choices[0]?.message?.content; // The content of the first choice
  console.log(response, choices, essayContent)

  return prisma.essay.create({
    data: {
      essayPrompt,
      body,
      essay: essayContent ?? "Generated essay placeholder",
      user: {
        connect: {
          id: userId,
        },
      },
    },
  });
}

export function deleteEssay({
  id,
  userId,
}: Pick<Essay, "id"> & { userId: User["id"] }) {
  return prisma.essay.deleteMany({
    where: { id, userId },
  });
}

// EssayDraft functions

export async function getNextVersion(applicationId: string): Promise<number> {
  const lastDraft = await prisma.essayDraft.findFirst({
    where: { applicationId },
    orderBy: { version: "desc" },
  });
  return (lastDraft?.version ?? 0) + 1;
}

export async function createDraft({
  applicationId,
  version,
  approach,
  content,
  prompt,
  sources,
  parentId,
}: {
  applicationId: string;
  version: number;
  approach?: string;
  content: string;
  prompt?: string;
  sources?: unknown;
  parentId?: string | null;
}) {
  return prisma.essayDraft.create({
    data: {
      applicationId,
      version,
      approach: approach || "narrative",
      content,
      generationPrompt: prompt,
      sources: sources as any,
      parentId,
    },
  });
}

export async function getDrafts(applicationId: string): Promise<EssayDraft[]> {
  return prisma.essayDraft.findMany({
    where: { applicationId },
    orderBy: { version: "desc" },
  });
}

export async function updateDraft(
  id: string,
  data: {
    content?: string;
    isFinalized?: boolean;
    isApproved?: boolean;
    parentId?: string | null;
  }
) {
  return prisma.essayDraft.update({
    where: { id },
    data,
  });
}

export async function getLatestDraft(applicationId: string): Promise<EssayDraft | null> {
  return prisma.essayDraft.findFirst({
    where: { applicationId },
    orderBy: { version: "desc" },
  });
}
