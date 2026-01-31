/**
 * Applications Dashboard
 * View and manage all scholarship applications
 */

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";

import { requireUserId } from "~/session.server";
import { getApplicationsByUser } from "~/models/scholarship.server";
import { getDrafts, getLatestDraft } from "~/models/essay.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const userId = await requireUserId(request);

  // Fetch all applications for this user
  const applications = await getApplicationsByUser(userId);

  // Enrich each application with draft data
  const enrichedApplications = await Promise.all(
    applications.map(async (application) => {
      const drafts = await getDrafts(application.id);
      const latestDraft = await getLatestDraft(application.id);
      const finalizedDraft = drafts.find((d) => d.status === "finalized");
      const approvedDraft = drafts.find((d) => d.status === "approved");

      return {
        ...application,
        draftsCount: drafts.length,
        hasDrafts: drafts.length > 0,
        finalizedDraft: finalizedDraft || null,
        approvedDraft: approvedDraft || null,
        latestDraft: latestDraft || null,
      };
    })
  );

  // Group applications by status
  const inProgress = enrichedApplications.filter(
    (app) => !app.submittedAt && app.step < 4
  );
  const readyToSubmit = enrichedApplications.filter(
    (app) =>
      !app.submittedAt &&
      app.step === 4 &&
      (app.finalizedDraft || app.approvedDraft)
  );
  const submitted = enrichedApplications.filter((app) => app.submittedAt);

  return json({
    applications: enrichedApplications,
    inProgress,
    readyToSubmit,
    submitted,
    stats: {
      total: enrichedApplications.length,
      inProgress: inProgress.length,
      readyToSubmit: readyToSubmit.length,
      submitted: submitted.length,
    },
  });
};

export default function ApplicationsDashboard() {
  const { applications, inProgress, readyToSubmit, submitted, stats } =
    useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                My Applications
              </h1>
              <p className="text-gray-600 mt-1">
                Track and manage your scholarship applications
              </p>
            </div>
            <Link
              to="/scholarships"
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              + Browse Scholarships
            </Link>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mt-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-900">
                {stats.total}
              </div>
              <div className="text-sm text-gray-600">Total Applications</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-600">
                {stats.inProgress}
              </div>
              <div className="text-sm text-gray-600">In Progress</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-600">
                {stats.readyToSubmit}
              </div>
              <div className="text-sm text-gray-600">Ready to Submit</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-purple-600">
                {stats.submitted}
              </div>
              <div className="text-sm text-gray-600">Submitted</div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {applications.length === 0 ? (
          /* Empty State */
          <div className="text-center py-16">
            <div className="text-6xl mb-4">📋</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              No Applications Yet
            </h2>
            <p className="text-gray-600 mb-6">
              Start browsing scholarships to begin your applications
            </p>
            <Link
              to="/scholarships"
              className="inline-block px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Browse Scholarships
            </Link>
          </div>
        ) : (
          /* Applications List */
          <div className="space-y-8">
            {/* Ready to Submit */}
            {readyToSubmit.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                  Ready to Submit ({readyToSubmit.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {readyToSubmit.map((app) => (
                    <ApplicationCard
                      key={app.id}
                      application={app}
                      actionType="submit"
                    />
                  ))}
                </div>
              </section>
            )}

            {/* In Progress */}
            {inProgress.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                  In Progress ({inProgress.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {inProgress.map((app) => (
                    <ApplicationCard
                      key={app.id}
                      application={app}
                      actionType="continue"
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Submitted */}
            {submitted.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-3 h-3 bg-purple-500 rounded-full"></span>
                  Submitted ({submitted.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {submitted.map((app) => (
                    <ApplicationCard
                      key={app.id}
                      application={app}
                      actionType="view"
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

interface ApplicationCardProps {
  application: {
    id: string;
    step: number;
    status: string;
    submittedAt: Date | null;
    awardedAt: Date | null;
    draftsCount: number;
    hasDrafts: boolean;
    finalizedDraft: { id: string; version: number; content: string } | null;
    approvedDraft: { id: string; version: number; content: string } | null;
    latestDraft: { id: string; version: number; content: string } | null;
    scholarship: {
      id: string;
      title: string;
      organization: string | null;
      amount: number | string | null;
      deadline: Date;
    };
    createdAt: Date;
    updatedAt: Date;
  };
  actionType: "continue" | "submit" | "view";
}

function ApplicationCard({ application, actionType }: ApplicationCardProps) {
  const getActionButton = () => {
    switch (actionType) {
      case "continue":
        return (
          <Link
            to={`/applications/${application.id}`}
            className="w-full py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors text-center"
          >
            {application.step === 1
              ? "Start Application"
              : application.step === 2
              ? "Continue with AI"
              : "Review Drafts"}
          </Link>
        );
      case "submit":
        return (
          <Link
            to={`/applications/${application.id}`}
            className="w-full py-2 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 transition-colors text-center"
          >
            Review & Submit
          </Link>
        );
      case "view":
        return (
          <button
            className="w-full py-2 bg-purple-100 text-purple-700 text-sm font-medium rounded-lg hover:bg-purple-200 transition-colors"
            type="button"
          >
            View Submission
          </button>
        );
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border p-5">
      {/* Scholarship Info */}
      <div className="mb-4">
        <h3 className="font-semibold text-gray-900 text-lg">
          {application.scholarship.title}
        </h3>
        {application.scholarship.organization && (
          <p className="text-sm text-gray-600">
            {application.scholarship.organization}
          </p>
        )}
      </div>

      {/* Details */}
      <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
        {application.scholarship.amount && (
          <div>
            <div className="text-gray-500">Amount</div>
            <div className="font-medium text-green-600">
              ${typeof application.scholarship.amount === "number"
                ? application.scholarship.amount.toLocaleString()
                : application.scholarship.amount}
            </div>
          </div>
        )}
        <div>
          <div className="text-gray-500">Deadline</div>
          <div className="font-medium">
            {new Date(application.scholarship.deadline).toLocaleDateString()}
          </div>
        </div>
        <div>
          <div className="text-gray-500">Drafts</div>
          <div className="font-medium">
            {application.draftsCount}{" "}
            {application.finalizedDraft && "• 1 finalized"}
          </div>
        </div>
        <div>
          <div className="text-gray-500">Status</div>
          <div className="font-medium">
            {application.submittedAt
              ? "Submitted"
              : application.finalizedDraft
              ? "Ready"
              : "In Progress"}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Progress</span>
          <span>Step {application.step} of 4</span>
        </div>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4].map((step) => (
            <div
              key={step}
              className={`h-2 flex-1 rounded ${
                step <= application.step ? "bg-blue-500" : "bg-gray-200"
              }`}
            />
          ))}
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>Browse</span>
          <span>AI</span>
          <span>Review</span>
          <span>Submit</span>
        </div>
      </div>

      {/* Action Button */}
      {getActionButton()}

      {/* Awarded Badge */}
      {application.awardedAt && (
        <div className="mt-3 pt-3 border-t">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded">
            🎉 Awarded!
          </span>
        </div>
      )}
    </div>
  );
}
