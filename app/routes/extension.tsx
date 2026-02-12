/**
 * Browser Extension Download Page
 *
 * Public page for downloading the Scholarships+ Chrome extension.
 * No authentication required.
 */

import { Link } from "@remix-run/react";

export default function ExtensionPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Scholarships+ Browser Extension
              </h1>
              <p className="text-sm text-gray-600">
                AI-powered form filling for scholarship applications
              </p>
            </div>
            <Link
              to="/demo"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              Try Demo →
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* What It Does */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">What It Does</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-2xl mb-2">✨</div>
                <h3 className="font-semibold text-blue-900 mb-1">Sparkle Icons</h3>
                <p className="text-sm text-blue-800">
                  AI-powered sparkle icons appear next to form fields on scholarship applications
                </p>
              </div>
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <div className="text-2xl mb-2">🤖</div>
                <h3 className="font-semibold text-purple-900 mb-1">Auto-Fill</h3>
                <p className="text-sm text-purple-800">
                  Click to auto-fill with AI-suggested responses from your knowledge base
                </p>
              </div>
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="text-2xl mb-2">💬</div>
                <h3 className="font-semibold text-green-900 mb-1">AI Chat</h3>
                <p className="text-sm text-green-800">
                  Chat with AI to refine and improve your answers before filling
                </p>
              </div>
              <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <div className="text-2xl mb-2">🌐</div>
                <h3 className="font-semibold text-orange-900 mb-1">Wide Compatibility</h3>
                <p className="text-sm text-orange-800">
                  Works on SmarterSelect, WebPortalApp, and other scholarship platforms
                </p>
              </div>
            </div>
          </section>

          {/* Download Button */}
          <section className="mb-8 text-center">
            <a
              href="/downloads/scholarships-plus-extension.zip"
              download="scholarships-plus-extension.zip"
              className="inline-flex items-center gap-2 px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-lg font-semibold shadow-lg hover:shadow-xl"
            >
              <span>📥</span>
              Download Extension
            </a>
            <p className="text-sm text-gray-600 mt-2">
              Version 1.0 • Requires Google Chrome
            </p>
          </section>

          {/* Installation Instructions */}
          <section className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Installation Instructions</h2>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
              <ol className="space-y-4">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                    1
                  </span>
                  <div>
                    <p className="font-medium text-gray-900">Download the extension</p>
                    <p className="text-sm text-gray-600">Click the download button above to get the ZIP file</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                    2
                  </span>
                  <div>
                    <p className="font-medium text-gray-900">Extract the ZIP file</p>
                    <p className="text-sm text-gray-600">Unzip to a folder on your computer</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                    3
                  </span>
                  <div>
                    <p className="font-medium text-gray-900">Open Chrome Extensions</p>
                    <p className="text-sm text-gray-600">
                      Navigate to <code className="bg-gray-200 px-1 rounded">chrome://extensions/</code> in Chrome
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                    4
                  </span>
                  <div>
                    <p className="font-medium text-gray-900">Enable Developer Mode</p>
                    <p className="text-sm text-gray-600">Toggle "Developer mode" in the top right corner</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                    5
                  </span>
                  <div>
                    <p className="font-medium text-gray-900">Load Unpacked Extension</p>
                    <p className="text-sm text-gray-600">
                      Click "Load unpacked" and select the extracted extension folder
                    </p>
                  </div>
                </li>
              </ol>
            </div>
          </section>

          {/* Try It Out */}
          <section className="text-center">
            <p className="text-gray-600 mb-4">
              Want to try it out first? Practice on our demo page!
            </p>
            <Link
              to="/demo"
              className="inline-block px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
            >
              Go to Demo Page
            </Link>
          </section>
        </div>
      </main>
    </div>
  );
}
