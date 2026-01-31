import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import { useState, useEffect } from "react";
import { requireUserId } from "~/session.server";
import { prisma } from "~/db.server";
import { PortalSessionCapture } from "~/components/portal-session-capture";

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);

  // Get user to check role
  // @ts-ignore - role field exists in database
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, role: true },
  });

  if (!user) {
    throw new Response("User not found", { status: 404 });
  }

  // Get portal sessions
  const sessions = await prisma.portalSession.findMany({
    where: { userId },
    select: {
      id: true,
      portal: true,
      lastValid: true,
      expiresAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Check which sessions are still valid
  const now = new Date();
  const sessionsWithStatus = sessions.map((session) => ({
    ...session,
    isValid: session.expiresAt > now,
  }));

  return json({
    userId,
    userEmail: user.email,
    // @ts-ignore - role field exists in database
    userRole: user.role,
    portalSessions: sessionsWithStatus,
  });
}

export default function SettingsIndexPage() {
  const { userId, userEmail, userRole, portalSessions } = useLoaderData<typeof loader>();
  const [showScholarshipModal, setShowScholarshipModal] = useState(false);
  const [showPortalModal, setShowPortalModal] = useState(false);
  const [selectedPortal, setSelectedPortal] = useState<string | null>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [scholarships, setScholarships] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [sessionConnected, setSessionConnected] = useState(false);
  const [expandedJobs, setExpandedJobs] = useState<Record<string, boolean>>({});

  const isAdmin = userRole === "ADMIN";

  // Toggle job expansion
  const toggleJobExpand = (jobId: string) => {
    setExpandedJobs(prev => ({
      ...prev,
      [jobId]: !prev[jobId],
    }));
  };

  // Retry a single child job (scholarship)
  const handleRetryChildJob = async (scholarshipId: string, title: string) => {
    if (!confirm(`Retry scraping "${title}"?`)) return;

    try {
      const response = await fetch("/api/scrape-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "scrapeOne", scholarshipId }),
      });

      if (!response.ok) {
        throw new Error(`Failed to start job: ${response.statusText}`);
      }

      const data = await response.json();
      setActiveJobId(data.jobId);
      await fetchJobs();
    } catch (error) {
      alert(`Failed to retry: ${error}`);
    }
  };

  // Retry failed child jobs from a parent job
  const handleRetryParentJob = async (parentJob: any) => {
    const failedChildren = parentJob.children?.filter((c: any) => c.status === "error") || [];
    if (failedChildren.length === 0) {
      alert("No failed jobs to retry");
      return;
    }

    if (!confirm(`Retry ${failedChildren.length} failed scholarship(s)?`)) return;

    // Retry each failed child job
    for (const child of failedChildren) {
      if (child.scholarshipId) {
        try {
          await fetch("/api/scrape-jobs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "scrapeOne", scholarshipId: child.scholarshipId }),
          });
        } catch (error) {
          console.error(`Failed to retry ${child.scholarshipTitle}:`, error);
        }
      }
    }

    await fetchJobs();
  };

  // Cancel a running job
  const handleCancelJob = async (jobId: string) => {
    if (!confirm("Are you sure you want to cancel this job?")) return;

    try {
      const response = await fetch(`/api/scrape-jobs/${jobId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to cancel job");
      }

      await fetchJobs();
    } catch (error: any) {
      alert(`Failed to cancel: ${error.message}`);
    }
  };

  // Poll for session when modal is open
  useEffect(() => {
    if (!showPortalModal || !selectedPortal) {
      setSessionConnected(false);
      return;
    }

    // Reset connection state
    setSessionConnected(false);

    // Check immediately
    checkSessionConnection();

    // Poll every 2 seconds
    const interval = setInterval(async () => {
      const connected = await checkSessionConnection();
      if (connected) {
        setSessionConnected(true);
        // Connected! Wait a moment to show success, then reload
        setTimeout(() => {
          setShowPortalModal(false);
          window.location.reload();
        }, 1500);
      }
    }, 2000);

    return () => {
      clearInterval(interval);
      setSessionConnected(false);
    };
  }, [showPortalModal, selectedPortal]);

  const checkSessionConnection = async () => {
    if (!selectedPortal) return false;

    try {
      const response = await fetch('/api/portal-sessions');
      if (response.ok) {
        const data = await response.json();
        const session = data.sessions?.find((s: any) => s.portal === selectedPortal && s.isValid);
        return !!session;
      }
    } catch (error) {
      console.error('Failed to check session:', error);
    }
    return false;
  };

  // Poll for job updates when modal is open
  useEffect(() => {
    if (!showScholarshipModal) return;

    // Initial load
    fetchJobs();
    fetchScholarships();

    // Poll every 2 seconds
    const interval = setInterval(async () => {
      await fetchJobs();
    }, 2000);

    return () => clearInterval(interval);
  }, [showScholarshipModal]);

  const fetchJobs = async () => {
    try {
      const response = await fetch("/api/scrape-jobs?limit=5");
      if (response.ok) {
        const data = await response.json();
        setJobs(data.jobs || []);

        // Track active job
        const activeJob = data.jobs?.find((j: any) => j.status === "running" || j.status === "pending");
        setActiveJobId(activeJob?.id || null);
      }
    } catch (error) {
      console.error("Failed to fetch jobs:", error);
    }
  };

  const fetchScholarships = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/scholarships-scrape");
      if (response.ok) {
        const data = await response.json();
        setScholarships(data.scholarships || []);
      }
    } catch (error) {
      console.error("Failed to fetch scholarships:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const startJob = async (action: string, scholarshipId?: string) => {
    try {
      const response = await fetch("/api/scrape-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, scholarshipId }),
      });

      if (!response.ok) {
        // Handle conflict (job already running)
        if (response.status === 409) {
          const data = await response.json();
          alert(`Job already in progress. Please wait for it to complete.`);
          return;
        }
        throw new Error(`Failed to start job: ${response.statusText}`);
      }

      const data = await response.json();
      setActiveJobId(data.jobId);
      await fetchJobs();
    } catch (error) {
      alert(`Failed to start job: ${error}`);
    }
  };

  // Job action configuration
  const jobActions: Record<string, { label: string; progressMessage: string }> = {
    discover: { label: "Discover", progressMessage: "Discovering Native Forward scholarships..." },
    scrapeAll: { label: "Scrape All", progressMessage: "Scraping all Native Forward scholarships..." },
    discoverAisesCobell: { label: "Discover AISES/Cobell", progressMessage: "Discovering AISES/Cobell scholarships..." },
    scrapeAllAisesCobell: { label: "Scrape All AISES/Cobell", progressMessage: "Scraping all AISES/Cobell scholarships..." },
    scrapeOne: { label: "Scrape One", progressMessage: "Scraping scholarship..." },
  };

  const handleDiscover = () => startJob("discover");
  const handleScrapeAll = () => startJob("scrapeAll");
  const handleDiscoverAisesCobell = () => startJob("discoverAisesCobell");
  const handleScrapeAllAisesCobell = () => startJob("scrapeAllAisesCobell");
  const handleScrapeOne = (scholarshipId: string) => startJob("scrapeOne", scholarshipId);

  const handleDisconnectPortal = async (portalId: string) => {
    try {
      const response = await fetch(`/api/portal-sessions/${portalId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Reload page to show updated sessions
        window.location.reload();
      } else {
        const data = await response.json();
        alert(`Failed to disconnect: ${data.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      alert(`Failed to disconnect: ${error.message}`);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: "bg-yellow-100 text-yellow-800",
      running: "bg-blue-100 text-blue-800",
      completed: "bg-green-100 text-green-800",
      error: "bg-red-100 text-red-800",
      cancelled: "bg-gray-100 text-gray-800",
    };
    const labels = {
      pending: "Pending",
      running: "Running",
      completed: "Completed",
      error: "Error",
      cancelled: "Cancelled",
    };
    return (
      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${styles[status as keyof typeof styles] || styles.pending}`}>
        {labels[status as keyof typeof labels] || status}
      </span>
    );
  };

  const isJobRunning = activeJobId !== null;

  // Portal configurations
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

  const handleConnectPortal = (portalId: string) => {
    setSelectedPortal(portalId);
    setShowPortalModal(true);
  };

  const handlePortalCaptureComplete = () => {
    setShowPortalModal(false);
    setSelectedPortal(null);
    // Reload page to show updated sessions
    window.location.reload();
  };

  const getPortalStatus = (portalId: string) => {
    const session = portalSessions.find((s) => s.portal === portalId);
    if (!session) return "not_connected";
    if (!session.isValid) return "expired";
    return "connected";
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Back link */}
      <Link
        to="/"
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
        Back to Home
      </Link>

      <h1 className="text-3xl font-bold text-gray-900 mb-8">Settings</h1>

      <div className="space-y-4">
        {/* Google Accounts */}
        <Link
          to="google-accounts"
          className="block p-6 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <svg className="w-8 h-8" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
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
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Google Accounts</h2>
                <p className="text-sm text-gray-600">Manage linked Google accounts for Drive import</p>
              </div>
            </div>
            <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </div>
        </Link>

        {/* Portal Sessions */}
        <div className="p-6 border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563a6 6 0 113.75-6.968z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Scholarship Portal Accounts</h2>
                <p className="text-sm text-gray-600">Connect accounts for automatic application completion</p>
              </div>
            </div>
            <Link
              to="bookmarklet"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Get Bookmarklet →
            </Link>
          </div>

          <div className="space-y-3">
            {Object.entries(portalConfigs).map(([portalId, config]) => {
              const status = getPortalStatus(portalId);
              const session = portalSessions.find((s) => s.portal === portalId);

              return (
                <div key={portalId} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{config.icon}</span>
                    <div>
                      <h3 className="font-medium text-gray-900">{config.name}</h3>
                      <p className="text-sm text-gray-600">{config.description}</p>
                      {status === "connected" && session && (
                        <p className="text-xs text-green-600 mt-1">
                          Connected • Expires {new Date(session.expiresAt).toLocaleDateString()}
                        </p>
                      )}
                      {status === "expired" && (
                        <p className="text-xs text-red-600 mt-1">Session expired - please reconnect</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {status === "connected" ? (
                      <button
                        onClick={() => handleDisconnectPortal(portalId)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-100 text-red-800 hover:bg-red-200 transition-colors flex items-center gap-1.5"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Disconnect
                      </button>
                    ) : status === "expired" ? (
                      <button
                        onClick={() => handleConnectPortal(portalId)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-orange-100 text-orange-800 hover:bg-orange-200 transition-colors"
                      >
                        Reconnect
                      </button>
                    ) : (
                      <button
                        onClick={() => handleConnectPortal(portalId)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                      >
                        Connect
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Admin: Scholarship Management */}
        {isAdmin && (
          <div className="p-6 border border-gray-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Scholarship Management</h2>
                  <p className="text-sm text-gray-600">Discover and index scholarships from connected portals</p>
                </div>
              </div>
              <button
                onClick={() => setShowScholarshipModal(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Manage
              </button>
            </div>
          </div>
        )}

        {/* User info display */}
        <div className="p-6 border border-gray-200 rounded-lg bg-gray-50">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Account Information</h3>
          <p className="text-sm text-gray-900">Email: {userEmail}</p>
          <p className="text-sm text-gray-900">Role: {userRole}</p>
        </div>
      </div>

      {/* Scholarship Management Modal */}
      {showScholarshipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-gray-900 bg-opacity-50"
            onClick={() => setShowScholarshipModal(false)}
          />

          {/* Modal Content */}
          <div className="relative bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">Scholarship Management</h2>
              <button
                onClick={() => setShowScholarshipModal(false)}
                className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-md"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Action Buttons */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-gray-700">Discover & Index Scholarships</h3>
                  <button
                    onClick={fetchScholarships}
                    disabled={isLoading}
                    className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
                  >
                    {isLoading ? "Loading..." : "Refresh List"}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs font-medium text-gray-700 mb-2">SmarterSelect (Native Forward)</p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleDiscover}
                        disabled={isJobRunning}
                        className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Discover
                      </button>
                      <button
                        onClick={handleScrapeAll}
                        disabled={isJobRunning}
                        className="flex-1 px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Scrape All
                      </button>
                    </div>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs font-medium text-gray-700 mb-2">OASIS (AISES/Cobell)</p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleDiscoverAisesCobell}
                        disabled={isJobRunning}
                        className="flex-1 px-3 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Discover
                      </button>
                      <button
                        onClick={handleScrapeAllAisesCobell}
                        disabled={isJobRunning}
                        className="flex-1 px-3 py-2 text-sm bg-pink-600 text-white rounded-lg hover:bg-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Scrape All
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Active Job Progress */}
              {jobs.length > 0 && jobs.filter((j) => j.status === "running" || j.status === "pending").length > 0 && (
                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  {jobs
                    .filter((j) => j.status === "running" || j.status === "pending")
                    .map((job) => (
                      <div key={job.id} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-blue-900">
                            {jobActions[job.action]?.progressMessage || "Processing..."}
                          </span>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-blue-600">
                              {job.currentStep}/{job.totalSteps}
                            </span>
                            <button
                              onClick={() => handleCancelJob(job.id)}
                              className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                        {job.totalSteps > 0 && (
                          <div className="w-full bg-blue-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all"
                              style={{ width: `${Math.round((job.currentStep / job.totalSteps) * 100)}%` }}
                            />
                          </div>
                        )}
                        <p className="text-xs text-blue-700">{job.message}</p>
                      </div>
                    ))}
                </div>
              )}

              {/* Recent Jobs */}
              {jobs.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Recent Jobs</h3>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-8"></th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Message</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {jobs.slice(0, 5).map((job) => (
                          <>
                            {/* Parent Job Row */}
                            <tr key={job.id} className={job.children && job.children.length > 0 ? "bg-gray-50" : ""}>
                              <td className="px-4 py-2">
                                {job.children && job.children.length > 0 && (
                                  <button
                                    onClick={() => toggleJobExpand(job.id)}
                                    className="text-gray-500 hover:text-gray-700"
                                  >
                                    {expandedJobs[job.id] ? "▼" : "▶"}
                                  </button>
                                )}
                              </td>
                              <td className="px-4 py-2 text-sm font-medium text-gray-900">
                                {job.action}
                                {job.children && job.children.length > 0 && (
                                  <span className="ml-2 text-xs text-gray-500">
                                    ({job.children.length} items)
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-sm">{getStatusBadge(job.status)}</td>
                              <td className="px-4 py-2 text-sm text-gray-600 max-w-xs truncate">
                                {job.message}
                              </td>
                              <td className="px-4 py-2 text-sm">
                                {/* Retry button for parent jobs (only if there were errors) */}
                                {job.status === "completed" && job.message?.includes("errors") && (
                                  <button
                                    onClick={() => handleRetryParentJob(job)}
                                    className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                                  >
                                    Retry Failed
                                  </button>
                                )}
                              </td>
                            </tr>

                            {/* Child Job Rows */}
                            {job.children && job.children.length > 0 && expandedJobs[job.id] && (
                              <>
                                {job.children.map((child) => (
                                  <tr key={child.id} className="bg-blue-50/50">
                                    <td className="px-4 py-2 pl-8"></td>
                                    <td className="px-4 py-2 text-sm text-gray-700">
                                      ↳ {child.scholarshipTitle || "Scholarship"}
                                    </td>
                                    <td className="px-4 py-2 text-sm">{getStatusBadge(child.status)}</td>
                                    <td className="px-4 py-2 text-sm text-gray-600 max-w-xs truncate">
                                      {child.message}
                                    </td>
                                    <td className="px-4 py-2 text-sm">
                                      {/* Retry button for failed child jobs */}
                                      {child.status === "error" && child.scholarshipId && (
                                        <button
                                          onClick={() => handleRetryChildJob(child.scholarshipId!, child.scholarshipTitle || "")}
                                          className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                                        >
                                          Retry
                                        </button>
                                      )}
                                      {child.status === "completed" && (
                                        <span className="text-green-600 text-xs">✓</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </>
                            )}
                          </>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Scholarships Table */}
              <div className="border rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Position</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deadline</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {scholarships.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                          No scholarships found. Click "Discover" above to find scholarships from connected portals.
                        </td>
                      </tr>
                    ) : (
                      scholarships.map((scholarship) => (
                        <tr key={scholarship.id}>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                            {scholarship.listPosition || "-"}
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-900 max-w-xs truncate">
                            {scholarship.title}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                            {new Date(scholarship.deadline).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              scholarship.scrapeStatus === "success"
                                ? "bg-green-100 text-green-800"
                                : scholarship.scrapeStatus === "error"
                                ? "bg-red-100 text-red-800"
                                : "bg-yellow-100 text-yellow-800"
                            }`}>
                              {scholarship.scrapeStatus}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button
                              onClick={() => handleScrapeOne(scholarship.id)}
                              disabled={isJobRunning}
                              className="text-blue-600 hover:text-blue-900 disabled:opacity-50"
                            >
                              Retry
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t bg-gray-50 flex justify-end">
              <button
                onClick={() => setShowScholarshipModal(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Portal Connect Modal */}
      {showPortalModal && selectedPortal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Connect {portalConfigs[selectedPortal]?.name}</h2>
                <p className="text-sm text-gray-600 mt-1">
                  {portalConfigs[selectedPortal]?.description}
                </p>
              </div>
              <button
                onClick={() => setShowPortalModal(false)}
                className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-md"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-auto p-6">
              <div className="space-y-4">
                {/* Connection status */}
                {sessionConnected ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
                    <div className="flex-shrink-0 w-8 h-8 bg-green-600 rounded-full flex items-center justify-center">
                      <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-green-900">Connected successfully!</p>
                      <p className="text-xs text-green-700">Refreshing page...</p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-blue-900">Waiting for connection...</p>
                      <p className="text-xs text-blue-700">Follow the steps below</p>
                    </div>
                  </div>
                )}

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-medium text-blue-900 mb-2">How to connect:</h3>
                  <ol className="space-y-2 text-sm text-blue-800">
                    <li className="flex gap-2">
                      <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-medium">1</span>
                      <span>
                        Click the button below to open <strong>{portalConfigs[selectedPortal]?.name}</strong> in a new tab
                      </span>
                    </li>
                    <li className="flex gap-2">
                      <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-medium">2</span>
                      <span>Log in to your account in the new tab</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-medium">3</span>
                      <span>Click your <strong>"Connect Portal"</strong> bookmarklet</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="flex-shrink-0 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-medium">4</span>
                      <span>This modal will detect the connection and close automatically!</span>
                    </li>
                  </ol>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-yellow-900">
                    <strong>Don't have the bookmarklet yet?</strong>{" "}
                    <Link
                      to="bookmarklet"
                      onClick={() => setShowPortalModal(false)}
                      className="underline font-medium"
                    >
                      Get it here first
                    </Link>
                  </p>
                </div>

                {/* Open portal button */}
                <a
                  href={portalConfigs[selectedPortal].loginUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Open {portalConfigs[selectedPortal]?.name} →
                </a>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t bg-gray-50 flex justify-end">
              <button
                onClick={() => setShowPortalModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
