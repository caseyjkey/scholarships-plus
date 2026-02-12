/**
 * Progress Banner Component
 *
 * Shows a banner when persona profile is not ready.
 * Displays progress bar and estimated time.
 * Includes "Skip to Chat" option and dismissible (×).
 * Auto-refreshes when profile generation completes.
 *
 * Usage:
 *   var banner = new ProgressBanner({
 *     authToken: '...',
 *     apiBaseUrl: 'https://localhost:3443',
 *     onSkipToChat: function() { ... },
 *     onReady: function() { ... }
 *   });
 *   banner.show();
 */

(function() {
  'use strict';

  /**
   * Progress Banner Constructor
   */
  function ProgressBanner(options) {
    this.authToken = options.authToken;
    this.apiBaseUrl = options.apiBaseUrl || 'http://localhost:3030';
    this.onSkipToChat = options.onSkipToChat || function() {};
    this.onReady = options.onReady || function() {};
    this.pollInterval = options.pollInterval || 3000;
    this.maxPolls = options.maxPolls || 40; // Max 2 minutes

    this.banner = null;
    this.progressBar = null;
    this.progressText = null;
    this.pollCount = 0;
    this.pollTimer = null;
  }

  /**
   * Show the banner and start polling
   */
  ProgressBanner.prototype.show = function() {
    this.createBanner();
    this.startPolling();
  };

  /**
   * Hide the banner and stop polling
   */
  ProgressBanner.prototype.hide = function() {
    if (this.banner) {
      this.banner.remove();
    }
    this.stopPolling();
  };

  /**
   * Stop polling
   */
  ProgressBanner.prototype.stopPolling = function() {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  };

  /**
   * Create the banner DOM
   */
  ProgressBanner.prototype.createBanner = function() {
    var self = this;

    // Check if banner already exists
    if (document.querySelector('.sp-progress-banner')) {
      this.banner = document.querySelector('.sp-progress-banner');
      return;
    }

    this.banner = document.createElement('div');
    this.banner.className = 'sp-progress-banner';
    this.banner.style.cssText = `
      position: fixed !important;
      bottom: 20px !important;
      left: 50% !important;
      transform: translateX(-50%) !important;
      width: 90% !important;
      max-width: 500px !important;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
      color: white !important;
      padding: 16px 20px !important;
      border-radius: 12px !important;
      font-family: system-ui, -apple-system, sans-serif !important;
      font-size: 14px !important;
      z-index: 999999 !important;
      box-shadow: 0 10px 40px rgba(102, 126, 234, 0.4) !important;
      animation: slideUp 0.3s ease-out !important;
    `;

    // Add keyframe animation
    if (!document.querySelector('#sp-progress-animations')) {
      var style = document.createElement('style');
      style.id = 'sp-progress-animations';
      style.textContent = `
        @keyframes slideUp {
          from { transform: translateX(-50%) translateY(100px); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
        @keyframes slideDown {
          from { transform: translateX(-50%) translateY(0); opacity: 1; }
          to { transform: translateX(-50%) translateY(100px); opacity: 0; }
        }
        .sp-progress-bar-fill {
          transition: width 0.5s ease-out !important;
        }
      `;
      document.head.appendChild(style);
    }

    // Banner content
    var content = document.createElement('div');
    content.style.cssText = `
      display: flex !important;
      flex-direction: column !important;
      gap: 12px !important;
    `;

    // Header with title and close button
    var header = document.createElement('div');
    header.style.cssText = `
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
    `;

    var title = document.createElement('div');
    title.innerHTML = '<strong>✨ Building Your Writing Profile</strong>';
    title.style.cssText = `
      font-size: 15px !important;
    `;

    var closeButton = document.createElement('button');
    closeButton.innerHTML = '×';
    closeButton.className = 'sp-progress-close';
    closeButton.style.cssText = `
      background: none !important;
      border: none !important;
      font-size: 20px !important;
      cursor: pointer !important;
      color: white !important;
      padding: 0 !important;
      width: 28px !important;
      height: 28px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      border-radius: 50% !important;
      transition: background 0.2s !important;
    `;
    closeButton.addEventListener('mouseenter', function() {
      this.style.background = 'rgba(255,255,255,0.2)';
    });
    closeButton.addEventListener('mouseleave', function() {
      this.style.background = 'none';
    });
    closeButton.addEventListener('click', function() {
      self.hide();
    });

    header.appendChild(title);
    header.appendChild(closeButton);

    // Description
    var description = document.createElement('div');
    description.className = 'sp-progress-description';
    description.textContent = 'We\'re analyzing your essays to learn your writing style. This usually takes about 30 seconds.';
    description.style.cssText = `
      font-size: 13px !important;
      opacity: 0.9 !important;
      line-height: 1.4 !important;
    `;

    // Progress bar container
    var progressContainer = document.createElement('div');
    progressContainer.style.cssText = `
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
    `;

    // Progress bar background
    var barBg = document.createElement('div');
    barBg.style.cssText = `
      flex: 1 !important;
      height: 8px !important;
      background: rgba(255,255,255,0.3) !important;
      border-radius: 4px !important;
      overflow: hidden !important;
    `;

    // Progress bar fill
    this.progressBar = document.createElement('div');
    this.progressBar.className = 'sp-progress-bar-fill';
    this.progressBar.style.cssText = `
      height: 100% !important;
      background: white !important;
      border-radius: 4px !important;
      width: 0% !important;
    `;

    barBg.appendChild(this.progressBar);

    // Progress text
    this.progressText = document.createElement('div');
    this.progressText.className = 'sp-progress-text';
    this.progressText.textContent = '0%';
    this.progressText.style.cssText = `
      font-size: 13px !important;
      font-weight: 600 !important;
      min-width: 35px !important;
      text-align: right !important;
    `;

    progressContainer.appendChild(barBg);
    progressContainer.appendChild(this.progressText);

    // Skip to chat link
    var skipLink = document.createElement('button');
    skipLink.textContent = 'Skip to Chat';
    skipLink.className = 'sp-progress-skip';
    skipLink.style.cssText = `
      background: none !important;
      border: none !important;
      color: white !important;
      font-size: 13px !important;
      text-decoration: underline !important;
      cursor: pointer !important;
      padding: 0 !important;
      text-align: left !important;
    `;
    skipLink.addEventListener('mouseenter', function() {
      this.style.opacity = '0.8';
    });
    skipLink.addEventListener('mouseleave', function() {
      this.style.opacity = '1';
    });
    skipLink.addEventListener('click', function() {
      self.hide();
      self.onSkipToChat();
    });

    content.appendChild(header);
    content.appendChild(description);
    content.appendChild(progressContainer);
    content.appendChild(skipLink);

    this.banner.appendChild(content);
    document.body.appendChild(this.banner);
  };

  /**
   * Start polling for progress updates
   */
  ProgressBanner.prototype.startPolling = function() {
    var self = this;

    // Initial check
    this.checkProgress();

    // Poll function
    var poll = function() {
      self.pollCount++;

      if (self.pollCount >= self.maxPolls) {
        console.warn('[Progress Banner] Max polls reached');
        self.stopPolling();
        return;
      }

      self.checkProgress();

      // Schedule next poll
      self.pollTimer = setTimeout(poll, self.pollInterval);
    };

    // Start polling
    this.pollTimer = setTimeout(poll, this.pollInterval);
  };

  /**
   * Check persona profile progress
   */
  ProgressBanner.prototype.checkProgress = function() {
    var self = this;

    fetch(this.apiBaseUrl + '/api/persona/progress', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + this.authToken,
        'Content-Type': 'application/json'
      }
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
      self.updateProgress(data);
    })
    .catch(function(error) {
      console.error('[Progress Banner] Failed to check progress:', error);
    });
  };

  /**
   * Update the progress display
   */
  ProgressBanner.prototype.updateProgress = function(data) {
    var progress = data.progress || 0;
    var status = data.status;

    // Update progress bar
    if (this.progressBar) {
      this.progressBar.style.width = progress + '%';
    }

    // Update progress text
    if (this.progressText) {
      this.progressText.textContent = progress + '%';
    }

    // Check if complete
    if (status === 'ready') {
      this.onComplete();
    } else if (status === 'failed') {
      this.onFailed(data.errorMessage);
    }
  };

  /**
   * Handle completion
   */
  ProgressBanner.prototype.onComplete = function() {
    var self = this;

    // Show 100%
    if (this.progressBar) {
      this.progressBar.style.width = '100%';
    }
    if (this.progressText) {
      this.progressText.textContent = '100%';
    }

    // Update description
    var description = this.banner.querySelector('.sp-progress-description');
    if (description) {
      description.textContent = 'Your writing profile is ready! You can now generate AI responses in your own voice.';
    }

    // Change skip link to dismiss
    var skipLink = this.banner.querySelector('.sp-progress-skip');
    if (skipLink) {
      skipLink.textContent = 'Dismiss';
      skipLink.onclick = function() {
        self.hide();
      };
    }

    // Stop polling
    this.stopPolling();

    // Notify callback after a short delay
    setTimeout(function() {
      self.onReady();
    }, 1500);
  };

  /**
   * Handle failure
   */
  ProgressBanner.prototype.onFailed = function(errorMessage) {
    var self = this;

    // Update description
    var description = this.banner.querySelector('.sp-progress-description');
    if (description) {
      description.textContent = errorMessage || 'Profile generation failed. Please try uploading more essays.';
      description.style.color = '#fca5a5';
    }

    // Change skip link to Dismiss
    var skipLink = this.banner.querySelector('.sp-progress-skip');
    if (skipLink) {
      skipLink.textContent = 'Dismiss';
      skipLink.onclick = function() {
        self.hide();
      };
    }

    // Stop polling
    this.stopPolling();
  };

  /**
   * Check if banner is currently visible
   */
  ProgressBanner.prototype.isVisible = function() {
    return this.banner && this.banner.parentElement;
  };

  // Export to global scope
  window.ProgressBanner = ProgressBanner;
})();
