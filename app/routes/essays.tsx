import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, Link, NavLink, Outlet, useLoaderData } from "@remix-run/react";

import { getEssayListItems } from "~/models/essay.server";
import { requireUserId } from "~/session.server";
import { useUser } from "~/utils";
import { AuthenticatedLayout } from "~/components/authenticated-layout";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const userId = await requireUserId(request);
  const essayListItems = await getEssayListItems({ userId });
  return json({ essayListItems });
};

export default function EssaysPage() {
  const data = useLoaderData<typeof loader>();
  const user = useUser();

  const handleLogout = () => {
    document.querySelector('form[action="/logout"]')?.querySelector('button')?.click();
  };

  return (
    <AuthenticatedLayout
      userEmail={user.email}
      essayListItems={data.essayListItems}
      onLogout={handleLogout}
    >
      <Outlet />
    </AuthenticatedLayout>
  );
}
