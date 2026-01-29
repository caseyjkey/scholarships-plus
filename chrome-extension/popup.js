/**
 * Popup Script for Scholarships Plus Extension
 */

document.addEventListener('DOMContentLoaded', async () => {
  const statusText = document.getElementById('status-text');
  const openSidebarBtn = document.getElementById('open-sidebar');
  const openAppBtn = document.getElementById('open-app');

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

  // Open sidebar button
  openSidebarBtn.addEventListener('click', async () => {
    await chrome.sidePanel.open();
    window.close();
  });

  // Open web app button
  openAppBtn.addEventListener('click', async () => {
    await chrome.tabs.create({
      url: 'http://localhost:3000/applications'
    });
    window.close();
  });
});

function detectPortal(url) {
  if (url.includes('smarterselect.com')) return 'SmarterSelect';
  if (url.includes('webportalapp.com')) return 'OASIS';
  if (url.includes('nativeforward.org')) return 'Native Forward';
  return null;
}
