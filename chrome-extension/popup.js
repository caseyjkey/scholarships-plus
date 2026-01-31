/**
 * Popup Script for Scholarships Plus Extension
 */

const CONFIG = {
  apiBaseUrl: 'http://localhost:3030',
};

document.addEventListener('DOMContentLoaded', async () => {
  const statusText = document.getElementById('status-text');
  const openSidebarBtn = document.getElementById('open-sidebar');
  const openAppBtn = document.getElementById('open-app');

  // Check authentication status
  const result = await chrome.storage.local.get(['authToken', 'user']);

  if (result.authToken) {
    // User is authenticated
    statusText.textContent = `Logged in as ${result.user?.email || 'user'}`;
    checkCurrentPage();
  } else {
    // User needs to authenticate
    statusText.textContent = 'Please log in to use the extension';
    openSidebarBtn.style.display = 'none';

    // Change openAppBtn to login button
    openAppBtn.textContent = 'Log In';
    openAppBtn.onclick = handleLogin;
  }

  // Open sidebar button - now opens general chat
  openSidebarBtn.addEventListener('click', async () => {
    // Send message to content script to open general chat
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, { action: 'openGeneralChat' });
    }
    window.close();
  });

  // Original open app handler (for when already logged in)
  if (!openAppBtn.onclick) {
    openAppBtn.addEventListener('click', async () => {
      await chrome.tabs.create({
        url: `${CONFIG.apiBaseUrl}/applications`
      });
      window.close();
    });
  }
});

/**
 * Check current page and show appropriate options
 */
async function checkCurrentPage() {
  const statusText = document.getElementById('status-text');
  const openSidebarBtn = document.getElementById('open-sidebar');

  // Check if current tab is on a scholarship portal
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (tab.url) {
    const portal = detectPortal(tab.url);

    if (portal) {
      statusText.textContent = `Detected: ${portal} portal`;
      openSidebarBtn.style.display = 'block';
    } else {
      statusText.textContent = 'Navigate to a scholarship application to get started';
      openSidebarBtn.style.display = 'none';
    }
  }
}

/**
 * Handle login flow
 */
async function handleLogin() {
  // Use background service worker to handle authentication
  const response = await chrome.runtime.sendMessage({ action: 'authenticate' });

  if (response.success) {
    if (response.alreadyAuthenticated) {
      statusText.textContent = `Already logged in as ${response.user?.email || 'user'}`;
      openSidebarBtn.style.display = 'block';
      openAppBtn.style.display = 'block';
    } else {
      // Login page opened, close popup
      window.close();
    }
  } else {
    statusText.textContent = 'Failed to open login page';
  }
}

/**
 * Listen for messages from content script or background
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'authSuccess') {
    // Reload the popup to show updated status
    window.location.reload();
  }
});

function detectPortal(url) {
  if (url.includes('smarterselect.com')) return 'SmarterSelect';
  if (url.includes('webportalapp.com')) return 'OASIS';
  if (url.includes('nativeforward.org')) return 'Native Forward';
  return null;
}
