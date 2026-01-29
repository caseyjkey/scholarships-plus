/**
 * Demo Scholarship Application Page
 *
 * This is a mock scholarship application form for:
 * - Testing the browser extension
 * - User practice/training
 * - Demonstrating the sparkle icon and auto-fill features
 *
 * Matches typical SmarterSelect-style application forms
 */

import { Link } from "@remix-run/react";

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Demo Scholarship Application
              </h1>
              <p className="text-sm text-gray-600">
                Practice using the AI-powered form filler
              </p>
            </div>
            <Link
              to="/dashboard"
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      {/* Main Form */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* Instructions Banner */}
          <div className="mb-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h2 className="font-semibold text-blue-900 mb-2">📘 How to Use</h2>
            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
              <li>Install the Scholarships+ browser extension (from chrome-extension/ folder)</li>
              <li>Look for sparkle icons ✨ next to form fields</li>
              <li>Click the sparkle to auto-fill with AI-suggested content</li>
              <li>Edit as needed and submit!</li>
            </ol>
          </div>

          <form className="space-y-8">
            {/* Personal Information Section */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4 pb-2 border-b">
                Personal Information
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* First Name */}
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-2">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="firstName"
                    name="firstName"
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Jane"
                    data-ai-field="firstName"
                    data-ai-label="First Name"
                  />
                </div>

                {/* Last Name */}
                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-2">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="lastName"
                    name="lastName"
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Doe"
                    data-ai-field="lastName"
                    data-ai-label="Last Name"
                  />
                </div>

                {/* Email */}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="jane.doe@example.com"
                    data-ai-field="email"
                    data-ai-label="Email"
                  />
                </div>

                {/* Phone */}
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="(555) 123-4567"
                    data-ai-field="phone"
                    data-ai-label="Phone"
                  />
                </div>
              </div>
            </section>

            {/* Academic Information Section */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4 pb-2 border-b">
                Academic Information
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* GPA */}
                <div>
                  <label htmlFor="gpa" className="block text-sm font-medium text-gray-700 mb-2">
                    Cumulative GPA <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    id="gpa"
                    name="gpa"
                    step="0.01"
                    min="0"
                    max="4.0"
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="3.75"
                    data-ai-field="gpa"
                    data-ai-label="GPA"
                  />
                </div>

                {/* Class Level */}
                <div>
                  <label htmlFor="classLevel" className="block text-sm font-medium text-gray-700 mb-2">
                    Class Level <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="classLevel"
                    name="classLevel"
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    data-ai-field="classLevel"
                    data-ai-label="Class Level"
                  >
                    <option value="">Select...</option>
                    <option value="freshman">Freshman</option>
                    <option value="sophomore">Sophomore</option>
                    <option value="junior">Junior</option>
                    <option value="senior">Senior</option>
                    <option value="graduate">Graduate Student</option>
                  </select>
                </div>

                {/* Major */}
                <div className="md:col-span-2">
                  <label htmlFor="major" className="block text-sm font-medium text-gray-700 mb-2">
                    Major / Field of Study <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="major"
                    name="major"
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Computer Science"
                    data-ai-field="major"
                    data-ai-label="Major"
                  />
                </div>

                {/* Enrollment Status */}
                <div>
                  <label htmlFor="enrollmentStatus" className="block text-sm font-medium text-gray-700 mb-2">
                    Enrollment Status <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="enrollmentStatus"
                    name="enrollmentStatus"
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    data-ai-field="enrollmentStatus"
                    data-ai-label="Enrollment Status"
                  >
                    <option value="">Select...</option>
                    <option value="full_time">Full-Time</option>
                    <option value="part_time">Part-Time</option>
                  </select>
                </div>

                {/* Expected Graduation */}
                <div>
                  <label htmlFor="graduationDate" className="block text-sm font-medium text-gray-700 mb-2">
                    Expected Graduation Date
                  </label>
                  <input
                    type="month"
                    id="graduationDate"
                    name="graduationDate"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    data-ai-field="graduationDate"
                    data-ai-label="Graduation Date"
                  />
                </div>
              </div>
            </section>

            {/* Essay Questions Section */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4 pb-2 border-b">
                Essay Questions
              </h2>

              {/* Short Answer: Leadership */}
              <div className="mb-6">
                <label htmlFor="leadership" className="block text-sm font-medium text-gray-700 mb-2">
                  1. Describe a leadership experience you've had and what you learned from it.
                  <span className="text-red-500">*</span>
                  <span className="text-gray-500 text-xs ml-2">(500 words max)</span>
                </label>
                <textarea
                  id="leadership"
                  name="leadership"
                  required
                  rows="6"
                  maxLength="5000"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
                  placeholder="Write about a time you took on a leadership role..."
                  data-ai-field="leadership"
                  data-ai-type="essay"
                  data-ai-label="Leadership Experience"
                ></textarea>
                <div className="text-xs text-gray-500 mt-1">
                  AI can help generate this from your past essays and experiences
                </div>
              </div>

              {/* Short Answer: Goals */}
              <div className="mb-6">
                <label htmlFor="goals" className="block text-sm font-medium text-gray-700 mb-2">
                  2. What are your academic and career goals? <span className="text-red-500">*</span>
                  <span className="text-gray-500 text-xs ml-2">(500 words max)</span>
                </label>
                <textarea
                  id="goals"
                  name="goals"
                  required
                  rows="6"
                  maxLength="5000"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
                  placeholder="Describe your short-term and long-term goals..."
                  data-ai-field="goals"
                  data-ai-type="essay"
                  data-ai-label="Academic and Career Goals"
                ></textarea>
                <div className="text-xs text-gray-500 mt-1">
                  AI will reference your stated goals from your knowledge base
                </div>
              </div>

              {/* Short Answer: Challenges */}
              <div className="mb-6">
                <label htmlFor="challenges" className="block text-sm font-medium text-gray-700 mb-2">
                  3. Describe a significant challenge you've overcome and how it affected you.
                  <span className="text-gray-500 text-xs ml-2">(500 words max)</span>
                </label>
                <textarea
                  id="challenges"
                  name="challenges"
                  rows="6"
                  maxLength="5000"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
                  placeholder="Share a story about overcoming adversity..."
                  data-ai-field="challenges"
                  data-ai-type="essay"
                  data-ai-label="Overcoming Challenges"
                ></textarea>
                <div className="text-xs text-gray-500 mt-1">
                  Optional - AI can help if you have relevant experiences
                </div>
              </div>
            </section>

            {/* Community Service Section */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4 pb-2 border-b">
                Community Service & Activities
              </h2>

              <div className="mb-6">
                <label htmlFor="communityService" className="block text-sm font-medium text-gray-700 mb-2">
                  Please describe your community service and extracurricular activities.
                  <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="communityService"
                  name="communityService"
                  required
                  rows="5"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
                  placeholder="List your volunteer work, clubs, sports, etc..."
                  data-ai-field="communityService"
                  data-ai-type="essay"
                  data-ai-label="Community Service"
                ></textarea>
                <div className="text-xs text-gray-500 mt-1">
                  AI will pull from your experiences in the knowledge base
                </div>
              </div>
            </section>

            {/* Financial Need Section */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-4 pb-2 border-b">
                Financial Information
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Annual Household Income */}
                <div>
                  <label htmlFor="income" className="block text-sm font-medium text-gray-700 mb-2">
                    Annual Household Income
                  </label>
                  <select
                    id="income"
                    name="income"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    data-ai-field="income"
                    data-ai-label="Household Income"
                  >
                    <option value="">Prefer not to say</option>
                    <option value="0-30000">$0 - $30,000</option>
                    <option value="30000-50000">$30,000 - $50,000</option>
                    <option value="50000-75000">$50,000 - $75,000</option>
                    <option value="75000-100000">$75,000 - $100,000</option>
                    <option value="100000+">$100,000+</option>
                  </select>
                </div>

                {/* FAFSA Completed */}
                <div>
                  <label htmlFor="fafsa" className="block text-sm font-medium text-gray-700 mb-2">
                    Have you completed the FAFSA?
                  </label>
                  <select
                    id="fafsa"
                    name="fafsa"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    data-ai-field="fafsa"
                    data-ai-label="FAFSA"
                  >
                    <option value="">Select...</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                    <option value="not_applicable">Not applicable</option>
                  </select>
                </div>
              </div>
            </section>

            {/* Submit Section */}
            <section className="pt-6 border-t">
              <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Tip:</span> Click sparkle icons ✨ to auto-fill with AI suggestions
                </p>
                <div className="flex gap-4">
                  <button
                    type="button"
                    className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                  >
                    Save as Draft
                  </button>
                  <button
                    type="submit"
                    className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    Submit Application
                  </button>
                </div>
              </div>
            </section>
          </form>
        </div>

        {/* Extension Status Banner */}
        <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🔌</span>
            <div className="flex-1">
              <h3 className="font-semibold text-yellow-900">Extension Status</h3>
              <p className="text-sm text-yellow-800 mt-1">
                <span id="extensionStatus">Checking for extension...</span>
              </p>
              <div className="text-xs text-yellow-700 mt-2">
                <strong>Not installed?</strong> Load the unpacked extension from the <code className="bg-yellow-100 px-1 rounded">chrome-extension/</code> folder in Chrome settings.
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Extension detection script */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            // Listen for extension detection event (works with CSP)
            function updateExtensionStatus(detected) {
              const statusEl = document.getElementById('extensionStatus');
              if (detected) {
                statusEl.innerHTML = '✅ <strong>Extension detected!</strong> Sparkle icons should appear on form fields.';
                statusEl.parentElement.parentElement.classList.remove('bg-yellow-50', 'border-yellow-200');
                statusEl.parentElement.parentElement.classList.add('bg-green-50', 'border-green-200');
              } else {
                statusEl.innerHTML = '❌ <strong>Extension not detected.</strong> Please install the browser extension.';
              }
            }

            // Listen for the custom event from content script
            window.addEventListener('scholarshipsPlusExtensionLoaded', () => {
              console.log('Extension detected via custom event');
              updateExtensionStatus(true);
            });

            // Fallback: Check after 2 seconds if event hasn't fired
            setTimeout(() => {
              const sparkles = document.querySelectorAll('[data-sparkle-added]');
              if (sparkles.length > 0) {
                console.log('Extension detected via sparkle count:', sparkles.length);
                updateExtensionStatus(true);
              }
            }, 2000);
          `,
        }}
      />
    </div>
  );
}
