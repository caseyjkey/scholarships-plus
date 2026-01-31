import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link, useSearchParams } from "@remix-run/react";
import { requireUserId } from "~/session.server";
import { prisma } from "~/db.server";
import { useState } from "react";
import { getEssayListItems } from "~/models/essay.server";
import { AuthenticatedLayout } from "~/components/authenticated-layout";
import {
  getScrapedScholarshipList,
  getUrgentScrapedScholarships,
} from "~/models/scholarship.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const userId = await requireUserId(request);
  const url = new URL(request.url);

  // Get filter parameters
  const filter = url.searchParams.get("filter") || "all";
  const search = url.searchParams.get("search") || "";
  const sortBy = (url.searchParams.get("sortBy") as "deadline" | "amount" | "title") || "deadline";
  const sortOrder = (url.searchParams.get("sortOrder") as "asc" | "desc") || "asc";
  const classLevel = url.searchParams.get("classLevel") || "";
  const gpaMin = url.searchParams.get("gpaMin") ? parseFloat(url.searchParams.get("gpaMin")!) : undefined;
  const gpaMax = url.searchParams.get("gpaMax") ? parseFloat(url.searchParams.get("gpaMax")!) : undefined;
  const enrollmentStatus = url.searchParams.get("enrollmentStatus") || "";
  const view = (url.searchParams.get("view") as "card" | "list") || "list";

  try {
    let scholarships;

    if (filter === "urgent") {
      scholarships = await getUrgentScrapedScholarships(7);
    } else {
      scholarships = await getScrapedScholarshipList({
        userId,
        sortBy,
        sortOrder,
        classLevel: classLevel || undefined,
        gpaMin,
        gpaMax,
        enrollmentStatus: enrollmentStatus || undefined,
      });
    }

    // Filter by search text
    if (search) {
      scholarships = scholarships.filter((s: any) =>
        s.title.toLowerCase().includes(search.toLowerCase()) ||
        s.description?.toLowerCase().includes(search.toLowerCase())
      );
    }

    const essaysCount = await prisma.essay.count({
      where: { userId }
    });

    const essayListItems = await getEssayListItems({ userId });
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new Response("User not found", { status: 404 });
    }

    // Get portal sessions for session check
    const portalSessions = await prisma.portalSession.findMany({
      where: { userId },
      select: {
        id: true,
        portal: true,
        expiresAt: true,
      },
    });

    // Check which sessions are still valid
    const now = new Date();
    const validPortalSessions = portalSessions.filter((s) => s.expiresAt > now);

    return json({
      scholarships,
      essaysCount,
      essayListItems,
      user,
      filter,
      search,
      sortBy,
      sortOrder,
      classLevel,
      gpaMin,
      gpaMax,
      enrollmentStatus,
      view,
      portalSessions: validPortalSessions,
    });
  } catch (error) {
    console.error("Error loading scholarships:", error);

    // Return data even if scholarships fail to load
    const essaysCount = await prisma.essay.count({
      where: { userId }
    });

    const essayListItems = await getEssayListItems({ userId });
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new Response("User not found", { status: 404 });
    }

    return json({
      scholarships: [],
      essaysCount,
      essayListItems,
      user,
      filter,
      search,
      sortBy,
      sortOrder,
      classLevel,
      gpaMin,
      gpaMax,
      enrollmentStatus,
      view,
      portalSessions: [],
      error: "Unable to load scholarships. Database may not be running.",
    });
  }
};

export default function ScholarshipsDashboard() {
  const {
    scholarships,
    essaysCount,
    essayListItems,
    user,
    filter,
    search,
    sortBy,
    sortOrder,
    classLevel,
    gpaMin,
    gpaMax,
    enrollmentStatus,
    view,
    portalSessions,
    error,
  } = useLoaderData<typeof loader>();

  // Session modal state
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [requiredPortal, setRequiredPortal] = useState<string | null>(null);

  // Portal configurations for modal
  const portalConfigs: Record<string, { name: string; loginUrl: string; description: string; icon?: string }> = {
    oasis: {
      name: "OASIS",
      loginUrl: "https://webportalapp.com/sp/login/access_oasis",
      description: "AISES and Cobell Scholarship Portal",
      icon: "🎓",
    },
    nativeforward: {
      name: "Native Forward",
      loginUrl: "https://app.smarterselect.com",
      description: "Native Forward Scholarship Portal (SmarterSelect)",
      icon: "🦬",
    },
  };

  // Check if user has a valid session for a portal
  const hasValidSession = (portalId: string): boolean => {
    return portalSessions.some((s) => s.portal === portalId);
  };

  // Handle apply button click
  const handleApplyClick = (scholarship: any) => {
    const portalId = scholarship.portal || null;

    console.log('Apply clicked', { scholarship, portalId, hasSession: portalId ? hasValidSession(portalId) : 'N/A' });

    if (portalId && !hasValidSession(portalId)) {
      // No valid session - show modal to connect
      console.log('Showing session modal for portal:', portalId);
      setRequiredPortal(portalId);
      setShowSessionModal(true);
    } else {
      // Has valid session or not required - proceed to apply page (or chat)
      console.log('Has session or no portal required');
      // For now, just log - the actual apply flow will be implemented next
      alert('Application preparation flow will be implemented next!');
    }
  };

  const [searchParams] = useSearchParams();
  const [showFilters, setShowFilters] = useState(false);
  const [currentView, setCurrentView] = useState(view);

  const handleLogout = () => {
    document.querySelector('form[action="/logout"]')?.querySelector('button')?.click();
  };

  const updateFilters = (newParams: Record<string, string>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(newParams).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });
    window.location.href = `/dashboard?${params.toString()}`;
  };

  const toggleView = (newView: "card" | "list") => {
    setCurrentView(newView);
    const params = new URLSearchParams(searchParams);
    params.set("view", newView);
    window.location.href = `/dashboard?${params.toString()}`;
  };

  return (
    <AuthenticatedLayout
      userEmail={user.email}
      essayListItems={essayListItems}
      onLogout={handleLogout}
    >
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b shadow-sm">
          <div className="px-4 pt-6 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">
                  Dashboard
                </h1>
                <p className="text-gray-600 mt-1">
                  Browse and apply for scholarships with AI assistance
                </p>
              </div>
              <div className="flex items-center gap-3">
                {/* View Toggle */}
                <div className="flex items-center bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => toggleView("list")}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      currentView === "list"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M5.25 6.75h.008v.008H5.25V6.75zm0 3.75h.008v.008H5.25v-.008zm0 3.75h.008v.008H5.25v-.008z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => toggleView("card")}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      currentView === "card"
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                    </svg>
                  </button>
                </div>
                <Link
                  to="/applications"
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  My Applications
                </Link>
              </div>
            </div>
          </div>
        </header>

        {/* Content wrapper - Filters and Scholarships */}
        <div className="px-4">
        {/* Filters */}
        <div className="mx-auto py-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            {/* Primary filter buttons */}
            <div className="flex flex-col sm:flex-row gap-4 mb-4">
              <div className="flex gap-2 flex-wrap">
                <Link
                  to="/dashboard?view=card"
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    filter === "all"
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  All
                </Link>
                <Link
                  to="/dashboard?filter=urgent&view=card"
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    filter === "urgent"
                      ? "bg-red-500 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Urgent
                </Link>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    showFilters
                      ? "bg-purple-500 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {showFilters ? "Hide Filters" : "More Filters"}
                </button>
              </div>

              {/* Search input */}
              <form className="flex-1 max-w-md" method="get">
                <input
                  type="search"
                  name="search"
                  placeholder="Search scholarships..."
                  defaultValue={search}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <input type="hidden" name="view" value={currentView} />
              </form>

              {/* Sort dropdown */}
              <select
                value={`${sortBy}-${sortOrder}`}
                onChange={(e) => {
                  const [newSortBy, newSortOrder] = e.target.value.split("-");
                  updateFilters({ sortBy: newSortBy, sortOrder: newSortOrder });
                }}
                className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="deadline-asc">Deadline: Soonest First</option>
                <option value="deadline-desc">Deadline: Latest First</option>
                <option value="amount-desc">Amount: Highest First</option>
                <option value="amount-asc">Amount: Lowest First</option>
                <option value="title-asc">Title: A-Z</option>
                <option value="title-desc">Title: Z-A</option>
              </select>
            </div>

            {/* Expanded filters */}
            {showFilters && (
              <div className="border-t pt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Class Level Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Class Level
                  </label>
                  <select
                    value={classLevel}
                    onChange={(e) => updateFilters({ classLevel: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Levels</option>
                    <option value="undergraduate">Undergraduate</option>
                    <option value="graduate">Graduate</option>
                    <option value="phd">PhD</option>
                    <option value="professional">Professional</option>
                  </select>
                </div>

                {/* GPA Range Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    GPA Range
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="4.0"
                      placeholder="Min"
                      value={gpaMin ?? ""}
                      onChange={(e) => updateFilters({
                        gpaMin: e.target.value,
                        gpaMax: gpaMax?.toString() || ""
                      })}
                      className="w-1/2 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="4.0"
                      placeholder="Max"
                      value={gpaMax ?? ""}
                      onChange={(e) => updateFilters({
                        gpaMin: gpaMin?.toString() || "",
                        gpaMax: e.target.value
                      })}
                      className="w-1/2 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Enrollment Status Filter */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Enrollment Status
                  </label>
                  <select
                    value={enrollmentStatus}
                    onChange={(e) => updateFilters({ enrollmentStatus: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Statuses</option>
                    <option value="full_time">Full-Time</option>
                    <option value="part_time">Part-Time</option>
                    <option value="any">Any</option>
                  </select>
                </div>

                {/* Clear filters button */}
                <div className="md:col-span-3 flex justify-end">
                  <Link
                    to="/dashboard"
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Clear All Filters
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="mx-auto py-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-yellow-800">{error}</p>
            </div>
          </div>
        )}

        {/* Welcome banner - show when no essays */}
        {essaysCount === 0 && (
          <div className="mx-auto py-4">
            <div className="p-8 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl shadow-sm">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <svg className="h-12 w-12 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-blue-900 mb-3">
                    Welcome! Let's set up your AI assistant
                  </h2>
                  <p className="text-blue-800 mb-4 text-lg">
                    Upload your past scholarship essays so the AI can learn from your writing and help you with future applications.
                  </p>
                  <div className="bg-white/70 rounded-lg p-4 mb-4">
                    <p className="text-sm text-blue-900 font-semibold mb-2">Why upload your essays?</p>
                    <ul className="text-sm text-blue-800 space-y-1">
                      <li className="flex items-start gap-2">
                        <svg className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        <span>AI searches your essays to find relevant content for each application</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        <span>Suggests improvements based on what's worked for you before</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <svg className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        <span>Maintains your authentic voice while strengthening applications</span>
                      </li>
                    </ul>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Link
                      to="/essays/upload"
                      className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                    >
                      <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      Upload Essays
                    </Link>
                    <Link
                      to="/essays"
                      className="inline-flex items-center px-6 py-3 bg-white text-blue-700 font-semibold rounded-lg hover:bg-blue-50 transition-colors border border-blue-200"
                    >
                      Learn More
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Scholarships Display */}
        <div className="mx-auto py-6">
          {scholarships.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <div className="text-6xl mb-4">📚</div>
              <h3 className="text-xl font-medium text-gray-900 mb-2">
                No scholarships found
              </h3>
              <p className="text-gray-600">
                {search || classLevel || gpaMin || gpaMax || enrollmentStatus
                  ? "Try adjusting your filters"
                  : "Check back later for new opportunities"}
              </p>
            </div>
          ) : (
            <>
              <div className="text-sm text-gray-600 mb-4">
                Showing {scholarships.length} scholarship{scholarships.length !== 1 ? "s" : ""}
              </div>
              {currentView === "card" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {scholarships.map((scholarship: any) => (
                    <ScholarshipCard
                      key={scholarship.id}
                      scholarship={scholarship}
                      onApplyClick={handleApplyClick}
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {scholarships.map((scholarship: any) => (
                    <ScholarshipListItem
                      key={scholarship.id}
                      scholarship={scholarship}
                      onApplyClick={handleApplyClick}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        </div>
      </div>

      {/* Session Required Modal */}
      {showSessionModal && requiredPortal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4">
            {/* Header */}
            <div className="p-6 border-b">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-orange-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563a6 6 0 113.75-6.968z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Connect Your Account</h2>
                  <p className="text-sm text-gray-600">
                    To use AI-powered application completion
                  </p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="p-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-blue-900">
                  This scholarship is from <strong>{portalConfigs[requiredPortal]?.name}</strong>.
                  You'll need to connect your account before we can help you apply with AI.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="font-medium text-gray-900">Quick steps:</h3>
                <ol className="space-y-2 text-sm text-gray-700">
                  <li className="flex gap-2">
                    <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-medium">1</span>
                    <span>Go to Settings and click "Connect" next to {portalConfigs[requiredPortal]?.name}</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-medium">2</span>
                    <span>Log in to {portalConfigs[requiredPortal]?.name} in the new tab</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-medium">3</span>
                    <span>Return here and click "Apply with AI" again</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-medium">4</span>
                    <span>Start applying with AI!</span>
                  </li>
                </ol>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t bg-gray-50 flex justify-between items-center rounded-b-lg">
              <Link
                to="/settings"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Go to Settings
              </Link>
              <button
                onClick={() => setShowSessionModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthenticatedLayout>
  );
}

function ScholarshipCard({ scholarship, onApplyClick }: { scholarship: any; onApplyClick: (scholarship: any) => void }) {
  const deadline = new Date(scholarship.deadline);
  const daysUntilDeadline = Math.ceil(
    (deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  const isUrgent = daysUntilDeadline <= 7;
  const isPastDeadline = daysUntilDeadline < 0;

  // Parse classLevel JSON
  let classLevels: string[] = scholarship.classLevel || [];

  // Parse structured data from requirements text if structured fields aren't populated
  let parsedGpaMin = scholarship.gpaMin;
  let parsedGpaRequired = scholarship.gpaRequired;
  let parsedReferralRequired = scholarship.referralRequired || 0;
  let parsedFullTimeRequired = scholarship.fullTimeRequired;
  let parsedEnrollmentStatus = scholarship.enrollmentStatus;

  // Only parse if structured fields are missing
  if (scholarship.requirements && (!parsedGpaMin || !parsedReferralRequired || classLevels.length === 0)) {
    const eligibility = scholarship.requirements.eligibility || "";
    if (typeof eligibility === "string" && eligibility.trim()) {
      const lower = eligibility.toLowerCase();

      // Extract GPA requirement - looks for "GPA of X.X", "GPA of at least X.X", "minimum GPA X.X", etc.
      const gpaMatch = eligibility.match(/gpa\s+(?:of\s+(?:at\s+least|minimum)?\s*)?(\d+\.?\d*)/i);
      if (gpaMatch && !parsedGpaMin) {
        parsedGpaMin = parseFloat(gpaMatch[1]);
        parsedGpaRequired = true;
      }

      // Extract referral count - looks for "two references", "2 references", "provide X references", etc.
      const referralWords: Record<string, number> = {
        'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
        'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
      };
      const referralNumberMatch = eligibility.match(/(\d+)\s+referenc/i);
      const referralWordMatch = lower.match(/(?:provide|submit|require|need)\s+(?:a\s+)?(\w+)\s+referenc/i);
      if (referralNumberMatch && !parsedReferralRequired) {
        parsedReferralRequired = parseInt(referralNumberMatch[1], 10);
      } else if (referralWordMatch && referralWordMatch[1] && !parsedReferralRequired) {
        parsedReferralRequired = referralWords[referralWordMatch[1]] || 0;
      }

      // Detect full-time enrollment requirement
      if (!parsedFullTimeRequired) {
        parsedFullTimeRequired =
          lower.includes('full-time enrollment') ||
          lower.includes('full time enrollment') ||
          lower.includes('full-time student') ||
          lower.includes('full time student') ||
          /require\s+full-time/.test(lower);
      }

      // Detect enrollment status
      if (!parsedEnrollmentStatus) {
        if (lower.includes('part-time') || lower.includes('part time')) {
          parsedEnrollmentStatus = 'part_time';
        } else if (lower.includes('full-time') || lower.includes('full time')) {
          parsedEnrollmentStatus = 'full_time';
        } else if (lower.includes('any enrollment') || lower.includes('full or part-time')) {
          parsedEnrollmentStatus = 'any';
        }
      }

      // Parse class level if not already present
      if (classLevels.length === 0) {
        const detectedLevels: string[] = [];
        if (lower.includes('undergraduate') || lower.includes('undergraduate student') || lower.includes('bachelor') || lower.includes("associate's") || lower.includes('baccalaureate')) {
          detectedLevels.push('undergraduate');
        }
        if (lower.includes('graduate') || lower.includes('graduate student') || lower.includes("master's") || lower.includes('masters')) {
          detectedLevels.push('graduate');
        }
        if (lower.includes('phd') || lower.includes('ph.d') || lower.includes('doctoral') || lower.includes('doctorate')) {
          detectedLevels.push('phd');
        }
        if (lower.includes('professional') || lower.includes('law') || lower.includes('medical') || lower.includes('business school')) {
          detectedLevels.push('professional');
        }
        if (detectedLevels.length > 0) {
          classLevels = detectedLevels;
        }
      }
    }
  }

  // Count requirements from the requirements text
  // Parse eligibility requirements and count distinct items
  let requirementCount = 0;
  if (scholarship.requirements) {
    const eligibility = scholarship.requirements.eligibility || "";
    if (typeof eligibility === "string" && eligibility.trim()) {
      // First try: Count bullet points, numbered items
      let items = eligibility.split(/\n\s*[-•·]\s*|\n\s*\d+\.\s*/);
      if (items.length > 1) {
        requirementCount = items.filter(item => item.trim().length > 20).length;
      } else {
        // Second try: Split by semicolons (many scraped items use semicolon separation)
        items = eligibility.split(/\s*;\s*/);
        if (items.length > 1) {
          requirementCount = items.filter(item => item.trim().length > 15).length;
        } else {
          // Third try: Split by sentences for paragraph-style text
          // Look for requirement keywords like "must", "required", "provide", "submit", "be a", etc.
          const sentences = eligibility.split(/\.\s+/);
          const requirementSentences = sentences.filter(s => {
            const lower = s.toLowerCase().trim();
            return lower.length > 15 && (
              lower.startsWith('must be') ||
              lower.startsWith('must') ||
              lower.startsWith('required') ||
              lower.startsWith('provide') ||
              lower.startsWith('submit') ||
              lower.includes('required') ||
              lower.includes('eligibility')
            );
          });
          requirementCount = requirementSentences.length;
        }
      }
    }
  }

  // Fallback: if no text-based requirements, check boolean fields
  if (requirementCount === 0) {
    requirementCount = [
      parsedGpaRequired && parsedGpaMin,
      parsedReferralRequired > 0,
      parsedFullTimeRequired,
    ].filter(Boolean).length;
  }

  // Check if this is a scraped scholarship with an application URL
  const hasExternalUrl = scholarship.applicationUrl && scholarship.applicationUrl.length > 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-lg transition-shadow flex flex-col h-full">
      <div className="p-6 flex-1 flex flex-col">
        {/* Portal badge */}
        <div className="text-xs font-medium text-blue-600 mb-2">
          {scholarship.portal === "nativeforward" ? "Native Forward" : "Scholarship"}
        </div>

        {/* Title - links to scholarship detail page */}
        <Link to={`/scholarships/${scholarship.id}`}>
          <h3 className="text-lg font-semibold text-gray-900 mb-2 hover:text-blue-600 transition-colors">
            {scholarship.title}
          </h3>
        </Link>

        {/* Description preview */}
        <p className="text-gray-600 text-sm mb-4 line-clamp-3 flex-1">
          {scholarship.description}
        </p>

        {/* Amount badge */}
        {scholarship.amount && (
          <div className="inline-block px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full mb-3">
            ${typeof scholarship.amount === 'number'
              ? scholarship.amount.toLocaleString()
              : scholarship.amount}
          </div>
        )}
      </div>

      {/* Bottom section - Requirements, Deadline, Apply Now, Apply with AI */}
      <div className="p-6 pt-0 border-t border-gray-100 mt-auto">
        {/* Requirements with Apply Now badge on right */}
        <div className="flex items-start justify-between mb-3">
          <div className="space-y-2 flex-1">
            <div className="text-xs text-gray-600">
              <span className="font-medium">Requirements: {requirementCount}</span>
            </div>

            {/* Class levels */}
            {classLevels.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {classLevels.map((level: string) => (
                  <span
                    key={level}
                    className="inline-block px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded"
                  >
                    {level}
                  </span>
                ))}
              </div>
            )}

            {/* Deadline */}
            <div
              className={`text-sm font-medium ${
                isPastDeadline
                  ? "text-red-600"
                  : isUrgent
                  ? "text-orange-600"
                  : "text-gray-600"
              }`}
            >
              {isPastDeadline
                ? `Deadline passed`
                : isUrgent
                ? `⚠️ ${daysUntilDeadline} days left`
                : `${daysUntilDeadline} days left`}
            </div>
          </div>

          {/* External application link - right aligned */}
          {hasExternalUrl && (
            <a
              href={scholarship.applicationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1 rounded-full hover:bg-indigo-100 transition-colors flex-shrink-0"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Apply Now
            </a>
          )}
        </div>

        {/* Apply with AI button */}
        <button
          onClick={() => onApplyClick(scholarship)}
          className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          Apply with AI
        </button>
      </div>
    </div>
  );
}

function ScholarshipListItem({ scholarship, onApplyClick }: { scholarship: any; onApplyClick: (scholarship: any) => void }) {
  const deadline = new Date(scholarship.deadline);
  const daysUntilDeadline = Math.ceil(
    (deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  const isUrgent = daysUntilDeadline <= 7;
  const isPastDeadline = daysUntilDeadline < 0;

  // Parse classLevel JSON
  let classLevels: string[] = scholarship.classLevel || [];

  // Parse structured data from requirements text if structured fields aren't populated
  let parsedGpaMin = scholarship.gpaMin;
  let parsedGpaRequired = scholarship.gpaRequired;
  let parsedReferralRequired = scholarship.referralRequired || 0;
  let parsedFullTimeRequired = scholarship.fullTimeRequired;
  let parsedEnrollmentStatus = scholarship.enrollmentStatus;

  // Only parse if structured fields are missing
  if (scholarship.requirements && (!parsedGpaMin || !parsedReferralRequired || classLevels.length === 0)) {
    const eligibility = scholarship.requirements.eligibility || "";
    if (typeof eligibility === "string" && eligibility.trim()) {
      const lower = eligibility.toLowerCase();

      // Extract GPA requirement - looks for "GPA of X.X", "GPA of at least X.X", "minimum GPA X.X", etc.
      const gpaMatch = eligibility.match(/gpa\s+(?:of\s+(?:at\s+least|minimum)?\s*)?(\d+\.?\d*)/i);
      if (gpaMatch && !parsedGpaMin) {
        parsedGpaMin = parseFloat(gpaMatch[1]);
        parsedGpaRequired = true;
      }

      // Extract referral count - looks for "two references", "2 references", "provide X references", etc.
      const referralWords: Record<string, number> = {
        'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
        'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
      };
      const referralNumberMatch = eligibility.match(/(\d+)\s+referenc/i);
      const referralWordMatch = lower.match(/(?:provide|submit|require|need)\s+(?:a\s+)?(\w+)\s+referenc/i);
      if (referralNumberMatch && !parsedReferralRequired) {
        parsedReferralRequired = parseInt(referralNumberMatch[1], 10);
      } else if (referralWordMatch && referralWordMatch[1] && !parsedReferralRequired) {
        parsedReferralRequired = referralWords[referralWordMatch[1]] || 0;
      }

      // Detect full-time enrollment requirement
      if (!parsedFullTimeRequired) {
        parsedFullTimeRequired =
          lower.includes('full-time enrollment') ||
          lower.includes('full time enrollment') ||
          lower.includes('full-time student') ||
          lower.includes('full time student') ||
          /require\s+full-time/.test(lower);
      }

      // Detect enrollment status
      if (!parsedEnrollmentStatus) {
        if (lower.includes('part-time') || lower.includes('part time')) {
          parsedEnrollmentStatus = 'part_time';
        } else if (lower.includes('full-time') || lower.includes('full time')) {
          parsedEnrollmentStatus = 'full_time';
        } else if (lower.includes('any enrollment') || lower.includes('full or part-time')) {
          parsedEnrollmentStatus = 'any';
        }
      }

      // Parse class level if not already present
      if (classLevels.length === 0) {
        const detectedLevels: string[] = [];
        if (lower.includes('undergraduate') || lower.includes('undergraduate student') || lower.includes('bachelor') || lower.includes("associate's") || lower.includes('baccalaureate')) {
          detectedLevels.push('undergraduate');
        }
        if (lower.includes('graduate') || lower.includes('graduate student') || lower.includes("master's") || lower.includes('masters')) {
          detectedLevels.push('graduate');
        }
        if (lower.includes('phd') || lower.includes('ph.d') || lower.includes('doctoral') || lower.includes('doctorate')) {
          detectedLevels.push('phd');
        }
        if (lower.includes('professional') || lower.includes('law') || lower.includes('medical') || lower.includes('business school')) {
          detectedLevels.push('professional');
        }
        if (detectedLevels.length > 0) {
          classLevels = detectedLevels;
        }
      }
    }
  }

  // Count requirements from the requirements text
  // Parse eligibility requirements and count distinct items
  let requirementCount = 0;
  if (scholarship.requirements) {
    const eligibility = scholarship.requirements.eligibility || "";
    if (typeof eligibility === "string" && eligibility.trim()) {
      // First try: Count bullet points, numbered items
      let items = eligibility.split(/\n\s*[-•·]\s*|\n\s*\d+\.\s*/);
      if (items.length > 1) {
        requirementCount = items.filter(item => item.trim().length > 20).length;
      } else {
        // Second try: Split by semicolons (many scraped items use semicolon separation)
        items = eligibility.split(/\s*;\s*/);
        if (items.length > 1) {
          requirementCount = items.filter(item => item.trim().length > 15).length;
        } else {
          // Third try: Split by sentences for paragraph-style text
          // Look for requirement keywords like "must", "required", "provide", "submit", "be a", etc.
          const sentences = eligibility.split(/\.\s+/);
          const requirementSentences = sentences.filter(s => {
            const lower = s.toLowerCase().trim();
            return lower.length > 15 && (
              lower.startsWith('must be') ||
              lower.startsWith('must') ||
              lower.startsWith('required') ||
              lower.startsWith('provide') ||
              lower.startsWith('submit') ||
              lower.includes('required') ||
              lower.includes('eligibility')
            );
          });
          requirementCount = requirementSentences.length;
        }
      }
    }
  }

  // Fallback: if no text-based requirements, check boolean fields
  if (requirementCount === 0) {
    requirementCount = [
      parsedGpaRequired && parsedGpaMin,
      parsedReferralRequired > 0,
      parsedFullTimeRequired,
    ].filter(Boolean).length;
  }

  // Check if this is a scraped scholarship with an application URL
  const hasExternalUrl = scholarship.applicationUrl && scholarship.applicationUrl.length > 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md transition-shadow">
      {/* Title row with portal badge and Apply with AI button */}
      <div className="flex items-center justify-between gap-4 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Link to={`/scholarships/${scholarship.id}`} className="text-xl font-semibold text-gray-900 hover:text-blue-600 transition-colors truncate">
            {scholarship.title}
          </Link>
          <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded flex-shrink-0">
            {scholarship.portal}
          </span>
        </div>

        {/* Apply with AI button - in title row */}
        <button
          onClick={() => onApplyClick(scholarship)}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 whitespace-nowrap flex-shrink-0"
        >
          Apply with AI
        </button>
      </div>

      <p className="text-gray-600 mb-4 line-clamp-2">
        {scholarship.description}
      </p>

      {/* Metadata row with Apply Now badge on right */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 text-sm text-gray-600">
          {scholarship.amount && (
            <span>Amount: ${scholarship.amount}</span>
          )}
          <span>Requirements: {requirementCount}</span>
          <span
            className={
              isPastDeadline
                ? "text-red-600"
                : isUrgent
                ? "text-orange-600"
                : ""
            }
          >
            Deadline: {new Date(scholarship.deadline).toLocaleDateString()}
            {isUrgent && !isPastDeadline && " ⚠️"}
          </span>
        </div>

        {/* External application link - right aligned in metadata row */}
        {hasExternalUrl && (
          <a
            href={scholarship.applicationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1 rounded-full hover:bg-indigo-100 transition-colors flex-shrink-0"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Apply Now
          </a>
        )}
      </div>
    </div>
  );
}
