import type { User, Essay } from "@prisma/client";

import { prisma } from "~/db.server";

export type { Essay } from "@prisma/client";

export function getEssay({
  id,
  userId,
}: Pick<Essay, "id"> & {
  userId: User["id"];
}) {
  return prisma.essay.findFirst({
    select: { id: true, body: true, title: true },
    where: { id, userId },
  });
}

export function getEssayListItems({ userId }: { userId: User["id"] }) {
  return prisma.essay.findMany({
    where: { userId },
    select: { id: true, title: true },
    orderBy: { updatedAt: "desc" },
  });
}

export function createEssay({
  body,
  title,
  userId,
}: Pick<Essay, "body" | "title"> & {
  userId: User["id"];
}) {
  return prisma.essay.create({
    data: {
      title,
      body,
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
