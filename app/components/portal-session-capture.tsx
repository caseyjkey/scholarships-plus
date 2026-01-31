import { useState, useEffect, useRef } from 'react';
import { useFetcher } from '@remix-run/react';

interface PortalSessionCaptureProps {
  portal: string;
  portalUrl: string;
  onSessionCaptured: () => void;
}

const PORTAL_CONFIGS: Record<string, { url: string; loginSelector: string; name: string }> = {
  oasis: {
    url: 'https://webportalapp.com/sp/login/access_oasis',
    loginSelector: 'a[href*="logout"], [class*="dashboard"], [class*="welcome"]',
    name: 'OASIS'
  },
  nativeforward: {
    url: 'https://app.smarterselect.com',
    loginSelector: '[aria-label="Profile menu container"], a[href*="logout"], [class*="logout"], button[class*="logout"]',
    name: 'Native Forward'
  },
  aises: {
    url: 'https://www.aises.org/login',
    loginSelector: '[href*="logout"]',
    name: 'AISES'
  },
  cobell: {
    url: 'https://cobellscholar.org/login',
    loginSelector: '[href*="logout"]',
    name: 'Cobell'
  }
};

export function PortalSessionCapture({ portal, portalUrl, onSessionCaptured }: PortalSessionCaptureProps) {
  const [popupOpen, setPopupOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'waiting' | 'success' | 'error'>('idle');
  const fetcher = useFetcher();
  const popupRef = useRef<Window | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Accept messages from our origin or the portal
      if (!event.origin.includes(window.location.hostname) &&
          !event.origin.includes('webportalapp.com') &&
          !event.origin.includes('smarterselect.com') &&
          !event.origin.includes('nativeforward.org') &&
          !event.origin.includes('aises.org') &&
          !event.origin.includes('cobellscholar.org')) {
        return;
      }

      if (event.data.type === 'portal_session') {
        // Parse cookies from string to array
        const cookieString = event.data.cookies;
        const cookieArray = cookieString.split(';').map(cookie => {
          const [name, value] = cookie.trim().split('=');
          return { name, value };
        });

        fetcher.submit(
          {
            portal,
            cookies: JSON.stringify(cookieArray),
            localStorage: event.data.localStorage || '{}',
            sessionStorage: event.data.sessionStorage || '{}'
          },
          {
            method: 'post',
            action: '/api/scrape/save-session'
          }
        );

        setStatus('success');
        setPopupOpen(false);
        popupRef.current?.close();
        onSessionCaptured();
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [portal, fetcher, onSessionCaptured]);

  const openPopup = () => {
    const config = PORTAL_CONFIGS[portal] || { url: portalUrl, loginSelector: '[href*="logout"]', name: portal };

    console.log('[Scholarships Plus] Opening popup to:', config.url);

    const popup = window.open(
      config.url,
      'portal_login',
      'width=800,height=600,scrollbars=yes,resizable=yes'
    );

    if (popup) {
      popupRef.current = popup;
      setPopupOpen(true);
      setStatus('waiting');

      // Log when popup is opened
      console.log('[Scholarships Plus] Popup opened');

      // Inject script with visual debugging
      const injectedScript = `
        (function() {
          window.__SCHOLARSHIPS_PLUS_DEBUG__ = true;

          function createDebugPanel() {
            // Remove existing if any
            const existing = document.getElementById('scholarships-plus-debug');
            if (existing) existing.remove();

            // Create a persistent debug panel
            const debugPanel = document.createElement('div');
            debugPanel.id = 'scholarships-plus-debug';
            debugPanel.style.cssText = 'position: fixed; top: 10px; right: 10px; background: #fff; border: 2px solid red; padding: 10px; z-index: 999999; font-family: monospace; font-size: 12px; max-width: 300px;';
            debugPanel.innerHTML = '<strong>Scholarships Plus</strong><br>Waiting for page...';
            document.body.appendChild(debugPanel);
            return debugPanel;
          }

          function init() {
            const debugPanel = createDebugPanel();

            function log(msg) {
              if (debugPanel && debugPanel.parentNode) {
                debugPanel.innerHTML += '<br>' + msg;
              }
              console.log('[Scholarships Plus]', msg);
            }

            log('Page loaded, checking login status...');

            // Wait a bit for page to settle
            setTimeout(() => {
              // Check if user_email field exists = NOT logged in
              const emailField = document.querySelector('#user_email');
              // Check for Profile menu = logged in
              const profileMenu = document.querySelector('[aria-label="Profile menu container"]');

              log('Email field exists: ' + (emailField ? 'YES (not logged in)' : 'NO'));
              log('Profile menu exists: ' + (profileMenu ? 'YES (logged in!)' : 'NO'));

              // If no email field and has profile menu, we're logged in!
              if (!emailField && profileMenu) {
                log('Already logged in! Extracting...');
                extractSession();
                return;
              }

              log('Not logged in, waiting for login...');

              // Set up observer to watch for login
              let debounceTimer;
              const observer = new MutationObserver(() => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                  const emailField = document.querySelector('#user_email');
                  const profileMenu = document.querySelector('[aria-label="Profile menu container"]');

                  if (!emailField && profileMenu) {
                    log('Login detected!');
                    extractSession();
                    observer.disconnect();
                  }
                }, 500);
              });

              observer.observe(document.body, { childList: true, subtree: true });
            }, 1500);

            function extractSession() {
              try {
                log('Extracting session...');

                const cookies = document.cookie;
                const localStorageData = JSON.stringify(localStorage);
                const sessionStorageData = JSON.stringify(sessionStorage);

                log('Cookies: ' + cookies.substring(0, 100) + '...');

                log('Sending postMessage...');
                window.opener.postMessage({
                  type: 'portal_session',
                  cookies: cookies,
                  localStorage: localStorageData,
                  sessionStorage: sessionStorageData
                }, '*');

                log('Session sent! Check parent window.');
                if (debugPanel && debugPanel.parentNode) {
                  debugPanel.style.background = '#90EE90';
                }
              } catch (e) {
                log('ERROR: ' + e.message);
              }
            }
          }

          // Wait for DOM to be ready
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
          } else {
            init();
          }
        })();
      `;

      // Try to inject the script immediately AND on load
      const injectScript = () => {
        console.log('[Scholarships Plus] Attempting script injection...');
        console.log('[Scholarships Plus] Popup document readyState:', popup.document?.readyState);

        try {
          // Method 1: Create script in popup's context
          const script = popup.document.createElement('script');
          script.textContent = injectedScript;
          popup.document.head.appendChild(script);
          console.log('[Scholarships Plus] Script injected via method 1');
        } catch (e) {
          console.error('[Scholarships Plus] Method 1 failed:', e);

          try {
            // Method 2: Using URL with blob
            const blob = new Blob([injectedScript], { type: 'text/javascript' });
            const url = URL.createObjectURL(blob);
            const script = popup.document.createElement('script');
            script.src = url;
            popup.document.head.appendChild(script);
            console.log('[Scholarships Plus] Script injected via method 2 (blob)');
          } catch (e2) {
            console.error('[Scholarships Plus] Method 2 failed:', e2);
          }
        }
      };

      // Try injecting immediately
      setTimeout(() => injectScript(), 100);

      // Also try on load
      popup.addEventListener('load', () => {
        console.log('[Scholarships Plus] Popup load event fired');
        injectScript();
      });

      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          setPopupOpen(false);
          if (status === 'waiting') {
            setStatus('error');
          }
        }
      }, 1000);
    }
  };

  const config = PORTAL_CONFIGS[portal] || { url: portalUrl, loginSelector: '[href*="logout"]', name: portal };

  return (
    <div className="portal-session-capture">
      {status === 'idle' && (
        <button
          onClick={openPopup}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Connect {config.name} Account
        </button>
      )}

      {status === 'waiting' && (
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
          <span>Waiting for you to log in to {config.name}...</span>
        </div>
      )}

      {status === 'success' && (
        <div className="text-green-600">
          ✅ {config.name} connected successfully!
        </div>
      )}

      {status === 'error' && (
        <div>
          <p className="text-red-600 mb-2">Connection cancelled or failed.</p>
          <button
            onClick={openPopup}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
