/**
 * Bookmarklet Generator Page
 *
 * This page provides a bookmarklet that users can install to capture
 * their SmarterSelect session after logging in.
 */

import { Link, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import { json } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { prisma } from "~/db.server";
import { randomBytes } from "crypto";

export async function loader({ request }: { request: Request }) {
  const userId = await requireUserId(request);

  // Generate a fresh token for this page load
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000); // 100 years (effectively never expires)

  // Clean up old tokens for this user
  await prisma.sessionToken.deleteMany({
    where: {
      userId,
      expiresAt: { lt: new Date() },
    },
  });

  // Store the new token
  await prisma.sessionToken.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  });

  return json({ token });
}

export default function BookmarkletPage() {
  const { token } = useLoaderData<typeof loader>();
  const [copied, setCopied] = useState(false);

  // Generate universal bookmarklet code with the token
  const BOOKMARKLET_CODE = `javascript:(function(){const token="${token}";const cookies=document.cookie;const localStorageData=JSON.stringify(localStorage);const sessionStorageData=JSON.stringify(sessionStorage);const cookieArray=cookies.split(';').map(c=>{const[name,value]=c.trim().split('=');return{name,value};});const hostname=window.location.hostname;let portal='unknown';if(hostname.includes('smarterselect.com')){portal='nativeforward';}else if(hostname.includes('webportalapp.com')){portal='oasis';}const params=new URLSearchParams();params.append('portal',portal);params.append('token',token);params.append('cookies',JSON.stringify(cookieArray));params.append('localStorage',localStorageData);params.append('sessionStorage',sessionStorageData);fetch('http://localhost:3030/api/scrape/save-session',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:params}).then(r=>r.json()).then(data=>{if(data.success){alert('✅ '+portal.toUpperCase()+' connected successfully! You can close this tab.');}else{alert('❌ Failed to connect: '+(data.error||'Unknown error'));}}).catch(err=>{alert('❌ Error: '+err.message);});})();`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(BOOKMARKLET_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      {/* Back link */}
      <Link
        to="/settings"
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
        Back to Settings
      </Link>

      <h1 className="text-3xl font-bold text-gray-900 mb-6">Universal Portal Session Bookmarklet</h1>

      <div className="space-y-6">
        {/* What is a bookmarklet */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-blue-900 mb-2">What is a bookmarklet?</h2>
          <p className="text-blue-800">
            A bookmarklet is a small piece of JavaScript stored as a bookmark in your browser.
            When you click it, it runs on the current page to extract your session data.
            <br /><br />
            <strong>This universal bookmarklet works for all scholarship portals</strong> (Native Forward, OASIS, AISES, Cobell) -
            it automatically detects which portal you're on and connects accordingly.
          </p>
        </div>

        {/* Instructions */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">How to install:</h2>
          <ol className="space-y-3 text-gray-700">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">1</span>
              <span>Copy the bookmarklet code below (click "Copy Code")</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">2</span>
              <span>Show your bookmarks bar (Ctrl+Shift+B or Cmd+Shift+B)</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">3</span>
              <span>Right-click your bookmarks bar and select "Add bookmark..." or "Add page"</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-medium">4</span>
              <span>
                Name it "Connect Portal" and paste the code in the URL field
                <br />
                <span className="text-sm text-gray-500">(Make sure it starts with "javascript:")</span>
              </span>
            </li>
          </ol>
        </div>

        {/* Bookmarklet code */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Bookmarklet Code:</h2>
            <button
              onClick={copyToClipboard}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              {copied ? '✓ Copied!' : 'Copy Code'}
            </button>
          </div>

          <code className="block bg-white border border-gray-300 rounded p-4 text-xs text-gray-800 overflow-x-auto break-all">
            {BOOKMARKLET_CODE}
          </code>
        </div>

        {/* How to use */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-green-900 mb-3">How to use:</h2>
          <p className="text-sm text-green-800 mb-4">
            <strong>This bookmarklet works for all portals!</strong> It automatically detects which portal you're on.
          </p>
          <ol className="space-y-2 text-green-800">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-medium">1</span>
              <span>Open your scholarship portal in a normal tab:
                <br /><span className="ml-6">• <a href="https://app.smarterselect.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">app.smarterselect.com</a> (Native Forward)</span>
                <br /><span className="ml-6">• <a href="https://webportalapp.com/sp/login/access_oasis" target="_blank" rel="noopener noreferrer" className="underline font-medium">webportalapp.com</a> (OASIS/AISES/Cobell)</span>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-medium">2</span>
              <span>Log in to your scholarship portal account</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-medium">3</span>
              <span>Click the bookmarklet in your bookmarks bar</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-medium">4</span>
              <span>You should see "✅ [PORTAL] connected successfully!"</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-medium">5</span>
              <span>Refresh your Scholarships Plus settings page - you should now be connected!</span>
            </li>
          </ol>
        </div>

        {/* Note about localhost */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-900">
            <strong>Note:</strong> This bookmarklet connects to <code>http://localhost:3030</code>.
            If you're running the app on a different port or URL, let me know and I'll update it.
          </p>
        </div>
      </div>
    </div>
  );
}
