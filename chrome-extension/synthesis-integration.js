/**
 * Synthesized Essay Integration Module
 *
 * This module integrates the Synthesized Essay Generation feature
 * with the existing content script (content-v037.js).
 *
 * To integrate, add this file to manifest.json content_scripts
 * after content-v037.js, or inject it dynamically.
 *
 * Features:
 * - Loads history-modal, style-settings, progress-banner modules
 * - Adds history button icon (📋) next to sparkle
 * - Wires up history API and autofill
 * - Shows progress banner when profile not ready
 */

(function() {
  'use strict';

  console.log('[Synthesis Integration] Initializing...');

  // Configuration
  var API_BASE_URL = 'http://localhost:3030';
  var PROGRESS_POLL_INTERVAL = 3000;

  // Progress banner instance
  var progressBannerInstance = null;

  /**
   * Check if modules are loaded (they're now loaded as content scripts)
   */
  function checkModulesAvailable() {
    return typeof window.HistoryModal === 'function' &&
           typeof window.StyleSettingsModal === 'function' &&
           typeof window.ProgressBanner === 'function';
  }

  /**
   * Create history button icon
   */
  function createHistoryButton(fieldName, fieldLabel) {
    var button = document.createElement('div');
    button.className = 'sp-history-button';
    button.setAttribute('data-field-id', fieldName);
    button.innerHTML = '📋';
    button.title = 'View history for this field';
    button.style.cssText = `
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 18px !important;
      height: 18px !important;
      font-size: 14px !important;
      margin-left: 4px !important;
      cursor: pointer !important;
      opacity: 0.6 !important;
      transition: all 0.2s ease !important;
      flex-shrink: 0 !important;
    `;

    button.addEventListener('mouseenter', function() {
      this.style.opacity = '1';
      this.style.transform = 'scale(1.1)';
    });
    button.addEventListener('mouseleave', function() {
      this.style.opacity = '0.6';
      this.style.transform = 'scale(1)';
    });

    button.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      openHistoryModal(fieldName, fieldLabel);
    });

    return button;
  }

  /**
   * Add history button next to sparkle icon
   */
  function addHistoryButtonToField(sparkleIcon, fieldName, fieldLabel) {
    // Check if history button already exists
    if (sparkleIcon.parentElement && sparkleIcon.parentElement.querySelector('.sp-history-button')) {
      return;
    }

    var historyButton = createHistoryButton(fieldName, fieldLabel);

    // Insert before the sparkle icon
    if (sparkleIcon.parentElement) {
      sparkleIcon.parentElement.insertBefore(historyButton, sparkleIcon);
    }
  }

  /**
   * Open history modal for a field
   */
  function openHistoryModal(fieldName, fieldLabel) {
    // Check if modules are available
    if (!checkModulesAvailable()) {
      console.error('[Synthesis Integration] Required modules not loaded');
      return;
    }

    if (!window.HistoryModal) {
      console.error('[Synthesis Integration] HistoryModal not loaded');
      return;
    }

    getAuthToken(function(authToken) {
      if (!authToken) {
        alert('Please log in to use this feature.');
        return;
      }

      // Get scholarship info from global variables
      var scholarshipId = window.scholarshipId || null;

      var modal = new window.HistoryModal({
        fieldId: fieldName,
        fieldLabel: fieldLabel,
        scholarshipId: scholarshipId,
        authToken: authToken,
        apiBaseUrl: API_BASE_URL,
        onAccept: function(data) {
          handleAcceptResponse(fieldName, data);
        },
        onClose: function() {
          console.log('[Synthesis Integration] History modal closed');
        }
      });

      modal.open();
    });
  }

  /**
   * Handle accept response - autofill field and update sparkle
   */
  function handleAcceptResponse(fieldName, data) {
    console.log('[Synthesis Integration] Accepting response for field:', fieldName, data);

    // Get the field element
    var fieldElement = window.fieldElements ? window.fieldElements[fieldName] : null;
    if (!fieldElement) {
      console.error('[Synthesis Integration] Field element not found:', fieldName);
      return;
    }

    // Autofill the field
    var value = data.fieldMapping.approvedValue || data.synthesis.content;
    if (value) {
      // Use existing fillField function if available
      if (typeof fillField === 'function') {
        fillField(fieldElement, value);
      } else {
        // Fallback autofill
        if (fieldElement.tagName === 'TEXTAREA' || fieldElement.type === 'text') {
          fieldElement.value = value;
          // Trigger change event
          var event = new Event('input', { bubbles: true });
          fieldElement.dispatchEvent(event);
        }
      }
    }

    // Update sparkle state to filled
    if (fieldElement._sparkleIcon) {
      updateSparkleState(fieldElement._sparkleIcon, 'filled');
    }

    // Update field mappings
    if (window.fieldMappings && data.fieldMapping) {
      window.fieldMappings[fieldName] = data.fieldMapping;
    }

    console.log('[Synthesis Integration] Field filled successfully');
  }

  /**
   * Update sparkle icon state
   */
  function updateSparkleState(sparkleIcon, state) {
    // Remove all state classes
    sparkleIcon.classList.remove('sp-sparkle-empty', 'sp-sparkle-generating', 'sp-sparkle-ready', 'sp-sparkle-filled');

    // Add new state class
    if (state === 'empty') {
      sparkleIcon.classList.add('sp-sparkle-empty');
    } else if (state === 'generating') {
      sparkleIcon.classList.add('sp-sparkle-generating');
    } else if (state === 'ready') {
      sparkleIcon.classList.add('sp-sparkle-ready');
    } else if (state === 'filled') {
      sparkleIcon.classList.add('sp-sparkle-filled');
    }
  }

  /**
   * Get auth token from storage
   */
  function getAuthToken(callback) {
    if (window.authToken) {
      callback(window.authToken);
      return;
    }

    // Check if chrome.storage is available
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['authToken'], function(result) {
        window.authToken = result.authToken;
        callback(result.authToken);
      });
    } else {
      // chrome.storage not available, return null
      console.warn('[Synthesis Integration] chrome.storage not available');
      callback(null);
    }
  }

  /**
   * Check persona profile status and show progress banner if needed
   */
  function checkProfileStatus() {
    getAuthToken(function(authToken) {
      if (!authToken) return;

      fetch(API_BASE_URL + '/api/persona/progress', {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + authToken,
          'Content-Type': 'application/json'
        }
      })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (data.status === 'ready') {
          // Profile is ready, no banner needed
          if (progressBannerInstance) {
            progressBannerInstance.hide();
          }
        } else if (data.status === 'generating' || data.status === 'not_started') {
          // Show progress banner
          showProgressBanner(data.progress || 0);
        }
        // If failed, don't show banner - user can still use chat
      })
      .catch(function(error) {
        console.error('[Synthesis Integration] Failed to check profile status:', error);
      });
    });
  }

  /**
   * Show progress banner
   */
  function showProgressBanner(initialProgress) {
    // Check if modules are available
    if (!checkModulesAvailable()) {
      console.error('[Synthesis Integration] Required modules not loaded');
      return;
    }

    if (!window.ProgressBanner) {
      console.error('[Synthesis Integration] ProgressBanner not loaded');
      return;
    }

    // Don't show if already showing
    if (progressBannerInstance && progressBannerInstance.isVisible()) {
      return;
    }

    getAuthToken(function(authToken) {
      progressBannerInstance = new window.ProgressBanner({
        authToken: authToken,
        apiBaseUrl: API_BASE_URL,
        pollInterval: PROGRESS_POLL_INTERVAL,
        onSkipToChat: function() {
          console.log('[Synthesis Integration] User skipped to chat');
        },
        onReady: function() {
          console.log('[Synthesis Integration] Profile is ready!');
          // Reload sparkles to show ready state
          if (typeof refreshAllSparkles === 'function') {
            refreshAllSparkles();
          }
        }
      });

      progressBannerInstance.show();
    });
  }

  /**
   * Initialize integration - add history buttons to all sparkles
   */
  function initializeIntegration() {
    console.log('[Synthesis Integration] Initializing...');

    // Wait for sparkles to be added
    setTimeout(function() {
      var sparkles = document.querySelectorAll('.sp-sparkle-icon');
      console.log('[Synthesis Integration] Found', sparkles.length, 'sparkles');

      sparkles.forEach(function(sparkle) {
        // Find the field name from the label or input element
        var fieldName = null;
        var fieldLabel = null;

        // Try to get field info from the input element
        if (sparkle.parentElement) {
          var wrapper = sparkle.parentElement;
          var label = wrapper.parentElement;
          if (label) {
            // The input is typically a sibling of the label, not a child
            // Try nextElementSibling first
            var input = label.nextElementSibling;
            // Check if it's an input/textarea/select
            if (!input || !/^(input|textarea|select)$/i.test(input.tagName)) {
              // If not, try to find input in the parent
              input = label.parentElement?.querySelector('input, textarea, select');
            }
            if (input && /^(input|textarea|select)$/i.test(input.tagName)) {
              // Use input name or id as field name
              fieldName = input.name || input.id;
              // Get label text, remove "Click to generate response" suffix
              fieldLabel = label.textContent.replace('Click to generate response', '').replace(/\*/g, '').trim();
              console.log('[Synthesis Integration] Found field:', fieldName, fieldLabel);
            }
          }
        }

        if (fieldName) {
          addHistoryButtonToField(sparkle, fieldName, fieldLabel);
        } else {
          console.warn('[Synthesis Integration] Could not find field name for sparkle');
        }
      });

      // Check profile status
      checkProfileStatus();

      console.log('[Synthesis Integration] Initialized');
    }, 2000); // Wait 2 seconds for sparkles to be added
  }

  /**
   * Hook into existing sparkle creation
   * This is called after addSparkleIcon in content-v037.js
   */
  function onSparkleAdded(sparkleIcon, fieldName, fieldLabel) {
    addHistoryButtonToField(sparkleIcon, fieldName, fieldLabel);
  }

  /**
   * Public API
   */
  window.SynthesisIntegration = {
    checkModulesAvailable: checkModulesAvailable,
    openHistoryModal: openHistoryModal,
    checkProfileStatus: checkProfileStatus,
    onSparkleAdded: onSparkleAdded,
    handleAcceptResponse: handleAcceptResponse
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeIntegration);
  } else {
    initializeIntegration();
  }

  // Also initialize after a delay in case sparkles are added later
  setTimeout(initializeIntegration, 3000);

  console.log('[Synthesis Integration] Module loaded');
})();
