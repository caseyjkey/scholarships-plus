/**
 * Simple Background Service Worker - Test Version
 */

console.log('Scholarships Plus: Background service worker loaded!');

// Handle extension install
chrome.runtime.onInstalled.addListener(() => {
  console.log('Scholarships Plus: Extension installed!');
});
