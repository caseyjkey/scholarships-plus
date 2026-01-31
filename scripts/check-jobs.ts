import { prisma } from "../app/db.server.js";

async function main() {
  const jobs = await prisma.scrapeJob.findMany({
    orderBy: { createdAt: "desc" },
    take: 3,
    select: {
      id: true,
      action: true,
      status: true,
      message: true,
      error: true,
      createdAt: true,
    },
  });
  console.log(JSON.stringify(jobs, null, 2));
}

main().catch(console.error);
