/**
 * Extension Authentication Hook
 *
 * This component handles authentication flow for the Chrome extension.
 * When user logs in with ?extension=true, it exchanges the session for a JWT
 * and sends it to the extension via window.postMessage.
 */

import { useEffect } from "react";

export function ExtensionAuth() {
  useEffect(() => {
    // Check if this is an extension login flow
    const urlParams = new URLSearchParams(window.location.search);
    const isExtensionLogin = urlParams.get("extension") === "true";

    if (!isExtensionLogin) return;

    // Function to authenticate extension
    const authenticateExtension = async () => {
      try {
        // Call the extension auth endpoint
        const response = await fetch("/api/extension/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          console.error("Extension auth failed:", response.status);
          return;
        }

        const data = await response.json();

        if (data.token) {
          // Wait for extension to be ready
          const maxWaitTime = 5000; // 5 seconds
          const checkInterval = 100; // 100ms
          let waited = 0;

          const waitForExtension = () => {
            return new Promise<boolean>((resolve) => {
              const checkReady = () => {
                // Check if extension content script is ready
                const isReady =
                  (window as any).scholarshipsPlusExtensionReady === true;

                if (isReady || waited >= maxWaitTime) {
                  resolve(isReady);
                  return;
                }

                waited += checkInterval;
                setTimeout(checkReady, checkInterval);
              };

              checkReady();
            });
          };

          const extensionReady = await waitForExtension();

          if (extensionReady) {
            // Send to extension via window.postMessage
            window.postMessage(
              {
                type: "SCHOLARSHIPS_PLUS_AUTH",
                token: data.token,
                user: data.user,
              },
              window.location.origin
            );

            console.log("Extension auth message sent");
          } else {
            console.warn("Extension not ready, storing token for later pickup");
            // Store token for extension to pick up via alternative method
            sessionStorage.setItem("extension_auth_token", data.token);
            sessionStorage.setItem("extension_user", JSON.stringify(data.user));
          }

          // Clean up URL
          urlParams.delete("extension");
          const newUrl =
            window.location.pathname +
            (urlParams.toString() ? "?" + urlParams.toString() : "");
          window.history.replaceState({}, "", newUrl);
        }
      } catch (error) {
        console.error("Extension auth error:", error);
      }
    };

    // Listen for extension ready signal
    const handleExtensionReady = () => {
      (window as any).scholarshipsPlusExtensionReady = true;
      console.log("Extension ready signal received");
    };

    window.addEventListener(
      "scholarshipsPlusWebAppReady",
      handleExtensionReady
    );

    // Small delay to ensure session is established
    setTimeout(authenticateExtension, 500);

    return () => {
      window.removeEventListener(
        "scholarshipsPlusWebAppReady",
        handleExtensionReady
      );
    };
  }, []);

  return null;
}
