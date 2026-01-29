import { useState } from "react";
import { Link, NavLink } from "@remix-run/react";

interface NavbarProps {
  userEmail: string;
  essayListItems?: Array<{ id: string; essayPrompt: string }>;
  onLogout: () => void;
}

/**
 * Shared navigation bar component
 *
 * Features:
 * - Essays button (pencil icon + text)
 * - Settings and logout access
 * - Mobile hamburger menu
 */
export function Navbar({ userEmail, essayListItems = [], onLogout }: NavbarProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <>
      <header className="flex items-center justify-between bg-slate-800 p-4 text-white h-20 shrink-0">
        {/* Logo/Brand */}
        <div className="flex items-center gap-3">
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">
            <Link to="/dashboard">Scholarships+</Link>
          </h1>
        </div>

        {/* Right side: Essays button + Mobile Menu + Desktop Actions */}
        <div className="flex items-center gap-3">
          {/* Essays Button - Pencil Icon + Text */}
          <Link
            to="/essays"
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-gray-200 hover:bg-gray-700 hover:text-white transition-colors min-h-[44px]"
            aria-label="Go to essays"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"
              />
            </svg>
            <span className="hidden sm:inline text-sm font-medium">Essays</span>
          </Link>

          {/* Mobile Menu Button (hamburger) */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white min-h-[44px] min-w-[44px] lg:hidden"
            aria-expanded={isMobileMenuOpen}
            aria-label="Main menu"
          >
            <svg
              className={`${isMobileMenuOpen ? "hidden" : "block"} h-6 w-6`}
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
              className={`${isMobileMenuOpen ? "block" : "hidden"} h-6 w-6`}
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

          {/* Desktop Actions */}
          <div className="hidden lg:flex items-center gap-4">
            <Link
              to="/settings"
              className="text-sm sm:text-base text-slate-200 hover:text-white transition-colors"
            >
              Settings
            </Link>
            <span className="text-slate-600">|</span>
            <p className="text-sm sm:text-base">{userEmail}</p>
            <form action="/logout" method="post">
              <button
                type="submit"
                className="rounded bg-slate-600 px-4 py-3 text-blue-100 hover:bg-blue-500 active:bg-blue-600 min-h-[44px]"
              >
                Logout
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-gray-900 bg-opacity-75"
            onClick={() => setIsMobileMenuOpen(false)}
          />

          {/* Menu Panel */}
          <div className="fixed top-20 right-0 bottom-0 z-50 w-80 bg-white shadow-xl overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">Menu</h2>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <nav className="space-y-4">
                <Link
                  to="/applications"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block px-4 py-3 rounded-lg text-gray-900 hover:bg-gray-100 font-medium min-h-[48px] flex items-center"
                >
                  📋 Applications
                </Link>

                <Link
                  to="/settings"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block px-4 py-3 rounded-lg text-gray-900 hover:bg-gray-100 font-medium min-h-[48px] flex items-center"
                >
                  ⚙️ Settings
                </Link>

                <div className="border-t pt-4">
                  <p className="px-4 text-sm text-gray-500 mb-2">Signed in as</p>
                  <p className="px-4 text-sm font-medium text-gray-900">{userEmail}</p>
                </div>

                <form action="/logout" method="post">
                  <button
                    type="submit"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="w-full text-left px-4 py-3 rounded-lg text-red-600 hover:bg-red-50 font-medium min-h-[48px] flex items-center"
                  >
                    Logout
                  </button>
                </form>
              </nav>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
