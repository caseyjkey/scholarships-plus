import { ActionFunctionArgs, json } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { PuppeteerSubmitter } from "~/lib/scrapers/puppeteer-submission";

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const { scholarshipId, portal, applicationUrl, fields } = await request.json();

  const submitter = new PuppeteerSubmitter(portal);

  try {
    const result = await submitter.submit(userId, {
      scholarshipId,
      portal,
      applicationUrl,
      fields
    });

    return json(result);
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Submission failed'
    }, { status: 500 });
  } finally {
    await submitter.close();
  }
}
