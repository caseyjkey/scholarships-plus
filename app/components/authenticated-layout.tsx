import { Outlet } from "@remix-run/react";
import { useLoaderData } from "@remix-run/react";
import { getEssayListItems } from "~/models/essay.server";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { Navbar } from "~/components/navbar";
import type { ReactNode } from "react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const userId = await requireUserId(request);
  const essayListItems = await getEssayListItems({ userId });
  return json({ essayListItems });
};

interface AuthenticatedLayoutProps {
  userEmail: string;
  essayListItems: Array<{ id: string; essayPrompt: string }>;
  onLogout: () => void;
  children: ReactNode;
}

export function AuthenticatedLayout({ userEmail, essayListItems, onLogout, children }: AuthenticatedLayoutProps) {
  return (
    <>
      <Navbar
        userEmail={userEmail}
        essayListItems={essayListItems}
        onLogout={onLogout}
      />

      <div className="pt-6 lg:pt-10">
        {children}
      </div>
    </>
  );
}
