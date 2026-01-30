/**
 * Background Service Worker for Scholarships Plus Extension
 * Handles authentication and cross-tab communication
 */

console.log('Scholarships Plus: Background service worker loaded!');

const CONFIG = {
  apiBaseUrl: 'https://localhost:3443',
};

// Handle extension install
chrome.runtime.onInstalled.addListener(() => {
  console.log('Scholarships Plus: Extension installed!');
});

// Listen for authentication requests from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'authenticate') {
    handleAuthentication(sendResponse);
    return true; // Keep message channel open for async response
  }

  if (message.action === 'checkAuth') {
    checkAuthentication().then(sendResponse);
    return true;
  }

  if (message.action === 'storeAuthToken') {
    storeAuthToken(message.token, message.user).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});

/**
 * Handle authentication by opening login tab and listening for success
 */
async function handleAuthentication(sendResponse) {
  try {
    // Check if already authenticated
    const result = await chrome.storage.local.get(['authToken', 'user']);
    if (result.authToken) {
      sendResponse({ success: true, alreadyAuthenticated: true, user: result.user });
      return;
    }

    // Open extension auth page in new tab
    await chrome.tabs.create({
      url: `${CONFIG.apiBaseUrl}/extension/auth`,
      active: true
    });

    sendResponse({ success: true, message: 'Login page opened' });
  } catch (error) {
    console.error('Authentication error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Check if user is authenticated
 */
async function checkAuthentication() {
  const result = await chrome.storage.local.get(['authToken', 'user', 'authTimestamp']);
  return {
    authenticated: !!result.authToken,
    user: result.user,
    timestamp: result.authTimestamp
  };
}

/**
 * Store authentication token
 */
async function storeAuthToken(token, user) {
  await chrome.storage.local.set({
    authToken: token,
    user: user,
    authTimestamp: Date.now()
  });
  console.log('Scholarships Plus: Auth token stored');
}

// Listen for tab updates to detect extension auth page
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Check if this is the extension auth page
    if (tab.url.includes('/extension/auth')) {
      // Inject a script to get the token from window.extensionAuthData
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: getExtensionAuthToken
      }, (results) => {
        if (results && results[0] && results[0].result) {
          const { token, user } = results[0].result;
          if (token && user) {
            storeAuthToken(token, user);
            // Notify popup and content scripts
            chrome.runtime.sendMessage({
              action: 'authSuccess',
              user: user
            }).catch(() => {}); // Ignore errors if no listeners
          }
        }
      });
    }
  }
});

/**
 * Function to be injected in extension auth page to get token
 */
function getExtensionAuthToken() {
  // Read token from window.extensionAuthData (set by the page)
  if (window.extensionAuthData && window.extensionAuthData.token && window.extensionAuthData.user) {
    return {
      token: window.extensionAuthData.token,
      user: window.extensionAuthData.user
    };
  }
  return null;
}
