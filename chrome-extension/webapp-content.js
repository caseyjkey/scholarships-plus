/**
 * Web App Content Script for Extension Authentication
 *
 * This script runs on localhost:3000 and listens for authentication messages
 * from the web app, then stores the JWT token in chrome.storage.local.
 */

console.log('Scholarships Plus: Web app content script loaded');

// Listen for messages from the web app via window.postMessage
window.addEventListener('message', function(event) {
  console.log('Scholarships Plus (webapp): Received message:', event.data);

  // Only accept messages from same origin
  if (event.origin !== window.location.origin) {
    console.log('Scholarships Plus (webapp): Message from different origin, ignoring:', event.origin);
    return;
  }

  if (event.data && event.data.type === 'SCHOLARSHIPS_PLUS_AUTH') {
    console.log('Scholarships Plus: Received auth token from web app');

    var token = event.data.token;
    var user = event.data.user;

    console.log('Scholarships Plus: Token length:', token ? token.length : 0, 'User:', user);

    // Store token in chrome.storage.local
    chrome.storage.local.set(
      {
        authToken: token,
        user: user,
        authTimestamp: Date.now(),
      },
      function() {
        if (chrome.runtime.lastError) {
          console.error('Scholarships Plus: Failed to store auth token:', chrome.runtime.lastError);
        } else {
          console.log('Scholarships Plus: Auth token stored successfully');

          // Notify extension
          chrome.runtime.sendMessage({
            action: 'authSuccess',
            user: user,
          }).catch(function() {
            // Background script might not be listening, that's okay
            console.log('Scholarships Plus: Background script not ready');
          });

          // Show success message to user
          alert('Extension authenticated successfully! You can now use the extension on scholarship portals.');
        }
      }
    );
  }
});

// Signal to web app that extension is ready
var readyEvent = new CustomEvent('scholarshipsPlusWebAppReady');
window.dispatchEvent(readyEvent);
console.log('Scholarships Plus: Extension ready signal sent to web app');
