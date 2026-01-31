import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { requireUserId } from "~/session.server";
import { getUserGoogleAccounts, unlinkGoogleAccount } from "~/models/google-credential.server";
import { GoogleAccountManager } from "~/components/google-account-manager";

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const accounts = await getUserGoogleAccounts(userId);

  return json({ accounts });
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "unlink") {
    const accountId = formData.get("accountId") as string;
    if (!accountId) {
      return json({ error: "Account ID is required" }, { status: 400 });
    }

    await unlinkGoogleAccount(userId, accountId);
    return json({ success: true });
  }

  return json({ error: "Invalid intent" }, { status: 400 });
}

export default function GoogleAccountsSettingsPage() {
  const { accounts } = useLoaderData<typeof loader>();

  return (
    <div className="max-w-2xl mx-auto p-6">
      {/* Breadcrumb navigation */}
      <Link
        to="/settings"
        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4 group"
      >
        <svg
          className="w-4 h-4 transition-transform group-hover:-translate-x-0.5"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Settings
      </Link>

      <h1 className="text-3xl font-bold text-gray-900 mb-8">Google Accounts</h1>

      <GoogleAccountManager accounts={accounts} />
    </div>
  );
}
