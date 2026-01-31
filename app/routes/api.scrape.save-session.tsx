import { ActionFunctionArgs, json } from "@remix-run/node";
import { requireUserId } from "~/session.server";
import { prisma } from "~/db.server";

interface SaveSessionRequest {
  portal: string;
  cookies: string;
  localStorage?: string;
  sessionStorage?: string;
  token?: string;
}

// Handle OPTIONS preflight request for CORS
export async function action({ request }: ActionFunctionArgs) {
  // Get the origin from the request
  const origin = request.headers.get("Origin");

  console.log('[Save Session] Request received:', {
    method: request.method,
    origin,
    contentType: request.headers.get('Content-Type'),
    cookie: request.headers.get('Cookie') ? 'present' : 'missing'
  });

  // Handle CORS preflight - MUST come before body parsing
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": origin || "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Credentials": "true",
      },
    });
  }

  // Now parse the body (only for POST requests)
  // Handle both JSON and form-encoded data
  let token: string | undefined;
  let portal: string;
  let cookies: string;
  let localStorage: string | undefined;
  let sessionStorage: string | undefined;

  const contentType = request.headers.get("Content-Type") || "";

  if (contentType.includes("application/json")) {
    const body = await request.json();
    token = body.token;
    portal = body.portal;
    cookies = body.cookies;
    localStorage = body.localStorage;
    sessionStorage = body.sessionStorage;
  } else {
    // Form-encoded data
    const formData = await request.formData();
    token = formData.get("token") as string | undefined;
    portal = formData.get("portal") as string;
    cookies = formData.get("cookies") as string;
    localStorage = formData.get("localStorage") as string | undefined;
    sessionStorage = formData.get("sessionStorage") as string | undefined;
  }

  let userId;

  // Try token-based auth first (for bookmarklet)
  if (token) {
    console.log('[Save Session] Using token-based auth');
    const sessionToken = await prisma.sessionToken.findUnique({
      where: { token },
    });

    if (!sessionToken) {
      console.log('[Save Session] Invalid token');
      return json({
        success: false,
        error: 'Invalid or expired token. Please get a new token from the settings page.',
      }, {
        status: 401,
        headers: {
          "Access-Control-Allow-Origin": origin || "*",
        },
      });
    }

    // Tokens don't expire - no expiration check needed

    userId = sessionToken.userId;

    // Note: We DON'T mark tokens as used anymore, allowing reuse within expiry period
    // This makes the UX better - one bookmarklet works for an hour
  } else {
    // Fall back to session-based auth
    console.log('[Save Session] Using session-based auth');
    try {
      userId = await requireUserId(request);
    } catch (e) {
      console.error('[Save Session] Auth failed:', e);
      const origin = request.headers.get("Origin");
      return json({
        success: false,
        error: 'Not authenticated. Please use the token-based approach from the settings page.',
      }, {
        status: 401,
        headers: {
          "Access-Control-Allow-Origin": origin || "*",
        },
      });
    }
  }

  try {
    // Parse cookies - handle both string and JSON array formats
    let cookieArray;
    if (typeof cookies === 'string') {
      if (cookies.startsWith('[')) {
        // Already a JSON array
        cookieArray = JSON.parse(cookies);
      } else {
        // Cookie string format
        cookieArray = cookies.split(';').map(cookie => {
          const [name, value] = cookie.trim().split('=');
          return {
            name,
            value,
            domain: new URL(request.url).hostname,
            path: '/'
          };
        });
      }
    } else {
      cookieArray = cookies;
    }

    // 30 day expiration
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await prisma.portalSession.upsert({
      where: {
        userId_portal: {
          userId,
          portal
        }
      },
      update: {
        cookies: cookieArray,
        localStorage: localStorage ? JSON.parse(localStorage) : null,
        sessionStorage: sessionStorage ? JSON.parse(sessionStorage) : null,
        lastValid: new Date(),
        expiresAt
      },
      create: {
        userId,
        portal,
        cookies: cookieArray,
        localStorage: localStorage ? JSON.parse(localStorage) : null,
        sessionStorage: sessionStorage ? JSON.parse(sessionStorage) : null,
        lastValid: new Date(),
        expiresAt
      }
    });

    const origin = request.headers.get("Origin");
    return json({ success: true }, {
      headers: {
        "Access-Control-Allow-Origin": origin || "*",
        "Access-Control-Allow-Credentials": "true",
      },
    });
  } catch (error: any) {
    console.error('Error saving portal session:', error);
    const origin = request.headers.get("Origin");
    return json({ success: false, error: error.message }, {
      status: 500,
      headers: {
        "Access-Control-Allow-Origin": origin || "*",
        "Access-Control-Allow-Credentials": "true",
      },
    });
  }
}
