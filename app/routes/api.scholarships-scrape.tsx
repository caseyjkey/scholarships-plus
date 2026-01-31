/**
 * API Route for listing scraped scholarships
 */

import { LoaderFunctionArgs, json } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { prisma } from "~/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserId(request);

  const scholarships = await prisma.scrapedScholarship.findMany({
    orderBy: [{ listPosition: "asc" }, { title: "asc" }],
  });

  return json({ scholarships });
}
