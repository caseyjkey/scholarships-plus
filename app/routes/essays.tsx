import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, Link, NavLink, Outlet, useLoaderData } from "@remix-run/react";

import { getEssayListItems } from "~/models/essay.server";
import { requireUserId } from "~/session.server";
import { useUser } from "~/utils";
import { MobileNav } from "~/components/mobile-nav";

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
    <div className="flex h-full min-h-screen flex-col">
      <header className="flex items-center justify-between bg-slate-800 p-4 text-white">
        <div className="flex items-center gap-4">
          <MobileNav
            essayListItems={data.essayListItems}
            userEmail={user.email}
            onLogout={handleLogout}
          />
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">
            <Link to=".">Essays</Link>
          </h1>
        </div>
        <div className="hidden lg:flex items-center gap-4">
          <p className="text-sm sm:text-base">{user.email}</p>
          <Form action="/logout" method="post">
            <button
              type="submit"
              className="rounded bg-slate-600 px-4 py-3 text-blue-100 hover:bg-blue-500 active:bg-blue-600 min-h-[44px]"
            >
              Logout
            </button>
          </Form>
        </div>
      </header>

      <main className="flex h-full bg-white flex-col lg:flex-row">
        <aside className="hidden lg:block lg:w-80 lg:h-full lg:border-r lg:bg-gray-50 lg:overflow-y-auto">
          <Link to="new" className="block p-4 text-xl text-blue-500 hover:bg-gray-100">
            + New Essay
          </Link>

          <hr />

          {data.essayListItems.length === 0 ? (
            <p className="p-4">No essays yet</p>
          ) : (
            <ol>
              {data.essayListItems.map((essay) => (
                <li key={essay.id}>
                  <NavLink
                    className={({ isActive }) =>
                      `block border-b p-4 text-base sm:text-xl hover:bg-gray-100 min-h-[52px] flex items-center ${
                        isActive ? "bg-white" : ""
                      }`
                    }
                    to={essay.id}
                  >
                    📝 {essay.title}
                  </NavLink>
                </li>
              ))}
            </ol>
          )}
        </aside>

        <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
