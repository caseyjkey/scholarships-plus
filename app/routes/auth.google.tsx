import { ActionFunctionArgs, redirect } from "@remix-run/node";
import { authenticator } from "~/lib/auth/auth.server";

export async function loader() {
  return redirect("/login");
}

export async function action({ request }: ActionFunctionArgs) {
  return await authenticator.authenticate("google", request);
}
