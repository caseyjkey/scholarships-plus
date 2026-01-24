import { Form, useFetcher, useNavigation } from "@remix-run/react";
import { useState, useEffect } from "react";

interface GoogleAccount {
  id: string;
  googleAccountId: string;
  email: string;
  createdAt: string;
}

interface GoogleAccountManagerProps {
  accounts: GoogleAccount[];
}

export function GoogleAccountManager({ accounts }: GoogleAccountManagerProps) {
  const fetcher = useFetcher();
  const navigation = useNavigation();
  const [accountsList, setAccountsList] = useState<GoogleAccount[]>(accounts);

  // Update local state when fetcher completes
  useEffect(() => {
    if (fetcher.data && fetcher.state === "idle") {
      if (fetcher.formData?.get("action") === "unlink") {
        const unlinkedId = fetcher.formData.get("accountId") as string;
        setAccountsList((prev) => prev.filter((acc) => acc.id !== unlinkedId));
      }
    }
  }, [fetcher.data, fetcher.state, fetcher.formData]);

  // Check if any unlink action is in progress
  const isUnlinking = navigation.state === "submitting" &&
    navigation.formData?.get("action") === "unlink";

  const handleUnlink = (accountId: string) => {
    if (!confirm("Are you sure you want to unlink this Google account?")) {
      return;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">
          Linked Google Accounts
        </h2>
        <Form action="/auth/google" method="post">
          <button
            type="submit"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#ffffff"
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"
              />
            </svg>
            Link Account
          </button>
        </Form>
      </div>

      {accountsList.length === 0 ? (
        <div className="text-center py-8 px-4 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <svg
            className="mx-auto h-12 w-12 text-gray-400 mb-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
          <p className="text-sm text-gray-600 mb-4">
            No Google accounts linked yet. Link an account to import files from Google Drive.
          </p>
          <Form action="/auth/google" method="post">
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#ffffff"
                  d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"
                />
              </svg>
              Link Your First Account
            </button>
          </Form>
        </div>
      ) : (
        <div className="space-y-3">
          {accountsList.map((account) => (
            <div
              key={account.id}
              className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path
                      fill="#EA4335"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-gray-900">{account.email}</p>
                  <p className="text-sm text-gray-500">
                    Linked {new Date(account.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <fetcher.Form
                method="delete"
                action={`/api/google/accounts/${account.id}`}
                onSubmit={() => handleUnlink(account.id)}
              >
                <input type="hidden" name="action" value="unlink" />
                <input type="hidden" name="accountId" value={account.id} />
                <button
                  type="submit"
                  disabled={isUnlinking}
                  className="px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUnlinking ? "Unlinking..." : "Unlink"}
                </button>
              </fetcher.Form>
            </div>
          ))}
        </div>
      )}

      {accountsList.length > 0 && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <span className="font-medium">Tip:</span> You can link multiple Google accounts and switch between them when importing files from Drive.
          </p>
        </div>
      )}
    </div>
  );
}
