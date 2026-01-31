import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useEffect } from "react";
import { requireUserId } from "~/session.server";
import { generateExtensionToken } from "~/lib/jwt.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const userId = await requireUserId(request);
  const data = await generateExtensionToken(userId);
  return json(data);
};

export default function ExtensionAuthPage() {
  const data = useLoaderData<typeof loader>();

  // Send token to extension when component mounts
  useEffect(() => {
    console.log('Extension Auth: Sending token to extension...');
    // Send message to extension's webapp-content.js
    window.postMessage({
      type: 'SCHOLARSHIPS_PLUS_AUTH',
      token: data.token,
      user: data.user
    }, window.location.origin);
    console.log('Extension Auth: Token sent successfully');
  }, [data]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
        <div className="text-center">
          <div className="mb-4 text-6xl">✨</div>
          <h1 className="text-2xl font-bold text-gray-900">
            Extension Authentication
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Your extension has been authenticated successfully!
          </p>
          <p className="mt-1 text-xs text-gray-500">
            You can close this tab and return to your scholarship application.
          </p>

          <div className="mt-6 rounded-md bg-green-50 p-4">
            <p className="text-sm font-medium text-green-800">
              Authenticated as: {data.user.email}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
