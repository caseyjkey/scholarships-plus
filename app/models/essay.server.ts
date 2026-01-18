import type { User, Essay } from "@prisma/client";

import OpenAI from "openai";
import { prisma } from "~/db.server";

export type { Essay } from "@prisma/client";

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
  const essay = choices[0]?.message?.content; // The content of the first choice 
  console.log(response, choices, essay)

  return prisma.essay.create({
    data: {
      essayPrompt,
      body,
      essay,
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
