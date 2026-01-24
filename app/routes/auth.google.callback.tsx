import { ActionFunctionArgs, LoaderFunctionArgs, redirect } from "@remix-run/node";
import { authenticator } from "~/lib/auth/auth.server";
import { verifyGoogleAccount } from "~/lib/auth/auth.server";
import { getSession, commitSession } from "~/session.server";
import { getUserById } from "~/models/user.server";

export async function loader({ request }: LoaderFunctionArgs) {
  // Get auth result from Google
  const authResult = await authenticator.authenticate("google", request);

  // Verify and get/create user
  const user = await verifyGoogleAccount(authResult);

  // Create session
  const session = await getSession(request.headers.get("Cookie"));
  session.set("userId", user.id);

  return redirect("/", {
    headers: { "Set-Cookie": await commitSession(session) },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  return await loader({ request });
}
