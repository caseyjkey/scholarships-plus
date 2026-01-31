import { prisma } from "../app/db.server.js";

async function main() {
  const essay = await prisma.essay.findFirst({
    select: {
      essayPrompt: true,
      body: true,
      essay: true,
    },
  });

  if (!essay) {
    console.log("No essays found");
    return;
  }

  console.log("Essay fields:");
  console.log("essayPrompt (length):", essay.essayPrompt?.length || 0);
  console.log("body (length):", essay.body?.length || 0);
  console.log("essay (length):", essay.essay?.length || 0);
  console.log("");
  console.log("First 200 chars of body:", essay.body?.substring(0, 200));
  console.log("");
  console.log("First 200 chars of essay:", essay.essay?.substring(0, 200));
}

main().catch(console.error);
