import { useState } from "react";
import { Link, NavLink } from "@remix-run/react";

interface MobileNavProps {
  essayListItems: Array<{ id: string; title: string }>;
  userEmail: string;
  onLogout: () => void;
}

/**
 * Mobile navigation component with hamburger menu
 *
 * Provides navigation for mobile screens with collapsible menu
 */
export function MobileNav({ essayListItems, userEmail, onLogout }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="lg:hidden">
      {/* Hamburger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white min-h-[44px] min-w-[44px]"
        aria-expanded={isOpen}
        aria-label="Main menu"
      >
        <svg
          className={`${isOpen ? "hidden" : "block"} h-6 w-6`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
          />
        </svg>
        <svg
          className={`${isOpen ? "block" : "hidden"} h-6 w-6`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>

      {/* Mobile menu overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-gray-900 bg-opacity-75">
          <div className="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto bg-white px-6 py-6 sm:max-w-sm sm:ring-1 sm:ring-gray-900/10">
            <div className="flex items-center justify-between">
              <Link to="." className="text-2xl font-bold text-gray-900">
                Essays
              </Link>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="-m-2.5 rounded-md p-2.5 text-gray-700 min-h-[44px] min-w-[44px]"
              >
                <span className="sr-only">Close menu</span>
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="mt-6 flow-root">
              <div className="-my-6 divide-y divide-gray-500/10">
                {/* User info */}
                <div className="py-6">
                  <p className="text-sm text-gray-500">Signed in as</p>
                  <p className="text-base font-semibold text-gray-900">{userEmail}</p>
                </div>

                {/* New Essay Link */}
                <div className="py-6">
                  <Link
                    to="new"
                    onClick={() => setIsOpen(false)}
                    className="block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-gray-900 hover:bg-gray-50 min-h-[44px] flex items-center"
                  >
                    + New Essay
                  </Link>
                </div>

                {/* Essay List */}
                <div className="py-6">
                  <p className="text-sm font-semibold text-gray-500">Your Essays</p>
                  {essayListItems.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-500">No essays yet</p>
                  ) : (
                    <ul role="list" className="mt-2 space-y-1">
                      {essayListItems.map((essay) => (
                        <li key={essay.id}>
                          <NavLink
                            to={essay.id}
                            onClick={() => setIsOpen(false)}
                            className={({ isActive }) =>
                              `block rounded-lg px-3 py-2 text-base font-medium leading-7 hover:bg-gray-50 min-h-[44px] flex items-center ${
                                isActive ? "bg-blue-50 text-blue-700" : "text-gray-900"
                              }`
                            }
                          >
                            📝 {essay.title}
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Logout */}
                <div className="py-6">
                  <button
                    type="button"
                    onClick={() => {
                      onLogout();
                      setIsOpen(false);
                    }}
                    className="block w-full rounded-lg px-3 py-2 text-base font-semibold leading-7 text-gray-900 hover:bg-gray-50 min-h-[44px] flex items-center"
                  >
                    Logout
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
