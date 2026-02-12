/**
 * History Modal Component
 *
 * Three-panel layout for displaying synthesized response with comparison:
 * - Left (60%): Synthesized response with accept button centered below, superscript citations
 * - Center (25%): Selected previous response for comparison
 * - Right (15%): List of all prior applications + synthesized history
 *
 * Usage:
 *   var modal = new HistoryModal({
 *     fieldId: 'career_aspirations',
 *     fieldLabel: 'Career Aspirations',
 *     scholarshipId: 'scholarship_123',
 *     authToken: '...',
 *     apiBaseUrl: 'https://localhost:3443',
 *     onAccept: function(synthesis) { ... },
 *     onClose: function() { ... }
 *   });
 *   modal.open();
 */

(function() {
  'use strict';

  /**
   * History Modal Constructor
   */
  function HistoryModal(options) {
    this.fieldId = options.fieldId;
    this.fieldLabel = options.fieldLabel;
    this.scholarshipId = options.scholarshipId;
    this.onAccept = options.onAccept || function() {};
    this.onClose = options.onClose || function() {};
    this.authToken = options.authToken;
    this.apiBaseUrl = options.apiBaseUrl || 'http://localhost:3030';

    this.modal = null;
    this.backdrop = null;
    this.currentSynthesis = null;
    this.priorResponses = [];
    this.selectedResponseId = null;
  }

  /**
   * Open the modal and load data
   */
  HistoryModal.prototype.open = function() {
    this.createModal();
    this.loadData();
  };

  /**
   * Close the modal
   */
  HistoryModal.prototype.close = function() {
    if (this.modal) {
      this.modal.remove();
    }
    if (this.backdrop) {
      this.backdrop.remove();
    }
    this.onClose();
  };

  /**
   * Create the modal DOM structure with three-column layout
   */
  HistoryModal.prototype.createModal = function() {
    var self = this;

    // Create backdrop
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'sp-history-backdrop';
    this.backdrop.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      background: rgba(0,0,0,0.5) !important;
      z-index: 999997 !important;
    `;
    this.backdrop.addEventListener('click', function() { self.close(); });
    document.body.appendChild(this.backdrop);

    // Create modal
    this.modal = document.createElement('div');
    this.modal.className = 'sp-history-modal';
    this.modal.style.cssText = `
      position: fixed !important;
      top: 50% !important;
      left: 50% !important;
      transform: translate(-50%, -50%) !important;
      width: 95% !important;
      max-width: 1400px !important;
      max-height: 90vh !important;
      background: white !important;
      border-radius: 12px !important;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3) !important;
      z-index: 999998 !important;
      display: flex !important;
      flex-direction: column !important;
      font-family: system-ui, -apple-system, sans-serif !important;
    `;

    // Create header
    var header = this.createHeader();
    this.modal.appendChild(header);

    // Create body with three columns
    var body = this.createBody();
    this.modal.appendChild(body);

    document.body.appendChild(this.modal);
  };

  /**
   * Create modal header
   */
  HistoryModal.prototype.createHeader = function() {
    var self = this;
    var header = document.createElement('div');
    header.className = 'sp-history-header';
    header.style.cssText = `
      padding: 16px 20px !important;
      border-bottom: 1px solid #e5e7eb !important;
      display: flex !important;
      justify-content: space-between !important;
      align-items: center !important;
    `;

    var title = document.createElement('h3');
    title.textContent = this.fieldLabel || 'Field History';
    title.style.cssText = `
      margin: 0 !important;
      font-size: 18px !important;
      font-weight: 600 !important;
      color: #1f2937 !important;
    `;

    var closeButton = document.createElement('button');
    closeButton.innerHTML = '×';
    closeButton.className = 'sp-history-close';
    closeButton.style.cssText = `
      background: none !important;
      border: none !important;
      font-size: 28px !important;
      cursor: pointer !important;
      color: #6b7280 !important;
      padding: 0 !important;
      width: 36px !important;
      height: 36px !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      border-radius: 6px !important;
    `;
    closeButton.addEventListener('click', function() { self.close(); });
    closeButton.addEventListener('mouseenter', function() {
      this.style.background = '#f3f4f6';
    });
    closeButton.addEventListener('mouseleave', function() {
      this.style.background = 'none';
    });

    header.appendChild(title);
    header.appendChild(closeButton);
    return header;
  };

  /**
   * Create body with three-column layout
   */
  HistoryModal.prototype.createBody = function() {
    var body = document.createElement('div');
    body.className = 'sp-history-body';
    body.style.cssText = `
      padding: 20px !important;
      overflow: hidden !important;
      flex: 1 !important;
      display: flex !important;
      gap: 20px !important;
      min-height: 500px !important;
    `;

    // Left column: Synthesized response (60%)
    var leftCol = this.createLeftColumn();
    leftCol.style.flex = '0 0 60%';
    leftCol.style.maxWidth = '60%';
    body.appendChild(leftCol);

    // Center column: Comparison view (25%)
    var centerCol = this.createCenterColumn();
    centerCol.style.flex = '0 0 25%';
    centerCol.style.maxWidth = '25%';
    body.appendChild(centerCol);

    // Right column: Response list (15%)
    var rightCol = this.createRightColumn();
    rightCol.style.flex = '0 0 15%';
    rightCol.style.maxWidth = '15%';
    body.appendChild(rightCol);

    return body;
  };

  /**
   * Create left column: Synthesized response
   */
  HistoryModal.prototype.createLeftColumn = function() {
    var col = document.createElement('div');
    col.className = 'sp-history-left-col';
    col.style.cssText = `
      background: white !important;
      border: 2px solid #3b82f6 !important;
      border-radius: 8px !important;
      padding: 20px !important;
      display: flex !important;
      flex-direction: column !important;
      overflow-y: auto !important;
    `;

    // Header
    var header = document.createElement('div');
    header.className = 'sp-history-left-header';
    header.innerHTML = '<strong>✨ AI-Synthesized Response</strong>';
    header.style.cssText = `
      font-size: 16px !important;
      color: #1f2937 !important;
      padding-bottom: 12px !important;
      border-bottom: 1px solid #e5e7eb !important;
      margin-bottom: 16px !important;
    `;
    col.appendChild(header);

    // Content area
    var content = document.createElement('div');
    content.className = 'sp-history-left-content';
    content.id = 'sp-history-left-content';
    content.style.cssText = `
      flex: 1 !important;
      overflow-y: auto !important;
      font-size: 14px !important;
      line-height: 1.6 !important;
      color: #1f2937 !important;
      white-space: pre-wrap !important;
    `;
    col.appendChild(content);

    // Citations area
    var citations = document.createElement('div');
    citations.className = 'sp-history-citations';
    citations.id = 'sp-history-citations';
    citations.style.cssText = `
      margin-top: 16px !important;
      padding-top: 12px !important;
      border-top: 1px solid #e5e7eb !important;
      font-size: 12px !important;
      color: #6b7280 !important;
    `;
    col.appendChild(citations);

    // Accept button container (centered)
    var btnContainer = document.createElement('div');
    btnContainer.className = 'sp-history-accept-container';
    btnContainer.id = 'sp-history-accept-container';
    btnContainer.style.cssText = `
      display: flex !important;
      justify-content: center !important;
      align-items: center !important;
      margin-top: 20px !important;
      padding-top: 16px !important;
      border-top: 1px solid #e5e7eb !important;
    `;
    col.appendChild(btnContainer);

    return col;
  };

  /**
   * Create center column: Comparison view
   */
  HistoryModal.prototype.createCenterColumn = function() {
    var col = document.createElement('div');
    col.className = 'sp-history-center-col';
    col.style.cssText = `
      background: #f9fafb !important;
      border-radius: 8px !important;
      padding: 16px !important;
      display: flex !important;
      flex-direction: column !important;
      overflow-y: auto !important;
    `;

    // Header
    var header = document.createElement('div');
    header.className = 'sp-history-center-header';
    header.innerHTML = '<strong>📋 Comparison</strong>';
    header.style.cssText = `
      font-size: 14px !important;
      color: #374151 !important;
      padding-bottom: 8px !important;
      border-bottom: 1px solid #e5e7eb !important;
      margin-bottom: 12px !important;
    `;
    col.appendChild(header);

    // Content area
    var content = document.createElement('div');
    content.className = 'sp-history-center-content';
    content.id = 'sp-history-center-content';
    content.style.cssText = `
      flex: 1 !important;
      overflow-y: auto !important;
      font-size: 13px !important;
      line-height: 1.5 !important;
      color: #1f2937 !important;
      white-space: pre-wrap !important;
    `;
    content.innerHTML = '<div style="color: #9ca3af; text-align: center; padding: 40px 20px;">Select a response from the list to compare</div>';
    col.appendChild(content);

    // Metadata for selected response
    var metadata = document.createElement('div');
    metadata.className = 'sp-history-center-metadata';
    metadata.id = 'sp-history-center-metadata';
    metadata.style.cssText = `
      margin-top: 12px !important;
      padding-top: 12px !important;
      border-top: 1px solid #e5e7eb !important;
      font-size: 11px !important;
      color: #6b7280 !important;
    `;
    col.appendChild(metadata);

    return col;
  };

  /**
   * Create right column: Response list
   */
  HistoryModal.prototype.createRightColumn = function() {
    var col = document.createElement('div');
    col.className = 'sp-history-right-col';
    col.style.cssText = `
      background: #f9fafb !important;
      border-radius: 8px !important;
      padding: 12px !important;
      display: flex !important;
      flex-direction: column !important;
      overflow-y: auto !important;
    `;

    // Header
    var header = document.createElement('div');
    header.className = 'sp-history-right-header';
    header.innerHTML = '<strong>📚 Responses</strong>';
    header.style.cssText = `
      font-size: 13px !important;
      color: #374151 !important;
      padding-bottom: 8px !important;
      border-bottom: 1px solid #e5e7eb !important;
      margin-bottom: 12px !important;
    `;
    col.appendChild(header);

    // List container
    var list = document.createElement('div');
    list.className = 'sp-history-right-list';
    list.id = 'sp-history-right-list';
    list.style.cssText = `
      flex: 1 !important;
      overflow-y: auto !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 8px !important;
    `;
    col.appendChild(list);

    return col;
  };

  /**
   * Load data from API
   */
  HistoryModal.prototype.loadData = function() {
    var self = this;

    // Show loading state
    document.getElementById('sp-history-left-content').innerHTML = '<div style="color: #6b7280; text-align: center; padding: 40px;">Loading synthesized response...</div>';
    document.getElementById('sp-history-right-list').innerHTML = '<div style="color: #6b7280; text-align: center; padding: 20px; font-size: 12px;">Loading responses...</div>';

    fetch(this.apiBaseUrl + '/api/history/' + encodeURIComponent(this.fieldId), {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + this.authToken,
        'Content-Type': 'application/json'
      }
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
      self.renderData(data);
    })
    .catch(function(error) {
      console.error('[History Modal] Failed to load data:', error);
      self.renderError('Failed to load data. Please try again.');
    });
  };

  /**
   * Render the loaded data
   */
  HistoryModal.prototype.renderData = function(data) {
    // Check profile status for synthesized response
    var hasSynthesized = data.synthesized && data.synthesized.content;
    var hasPriorResponses = data.priorResponses && data.priorResponses.length > 0;
    var hasSynthesizedHistory = data.synthesizedHistory && data.synthesizedHistory.length > 0;

    // If no data available at all, show profile not ready message
    if (!hasSynthesized && !hasPriorResponses && !hasSynthesizedHistory) {
      if (data.profileStatus !== 'ready') {
        this.renderProfileNotReady(data.profileStatus, data.profileProgress);
      } else {
        this.renderNoData();
      }
      return;
    }

    // Render synthesized response if available (left column)
    if (hasSynthesized) {
      this.renderSynthesized(data.synthesized);
    } else {
      this.renderNoSynthesized(data.profileStatus);
    }

    // Render response list (right column)
    this.renderResponseList(data.priorResponses || [], data.synthesizedHistory || []);

    // Select first response for comparison (if any)
    if (data.priorResponses && data.priorResponses.length > 0) {
      this.selectResponse(data.priorResponses[0]);
    } else if (hasSynthesizedHistory && data.synthesizedHistory.length > 0) {
      this.selectResponse(data.synthesizedHistory[0]);
    }
  };

  /**
   * Render synthesized response with citations
   */
  HistoryModal.prototype.renderSynthesized = function(synthesized) {
    if (!synthesized) {
      document.getElementById('sp-history-left-content').innerHTML = '<div style="color: #6b7280; text-align: center; padding: 40px;">No synthesized response available. Please generate one first.</div>';
      return;
    }

    this.currentSynthesis = synthesized;

    // Render content with citation superscripts
    var content = synthesized.content || '';
    if (synthesized.citations && synthesized.citations.length > 0) {
      content = this.insertCitationSuperscripts(content, synthesized.citations);
    }

    document.getElementById('sp-history-left-content').innerHTML = content;

    // Render citations
    var citationsHtml = '';
    if (synthesized.citations && synthesized.citations.length > 0) {
      citationsHtml = '<strong>Sources:</strong><br>';
      for (var i = 0; i < synthesized.citations.length; i++) {
        var citation = synthesized.citations[i];
        citationsHtml += '<sup>' + (i + 1) + '</sup> ' + this.escapeHtml(citation.text || citation.source || 'Unknown') + '<br>';
      }
    }
    document.getElementById('sp-history-citations').innerHTML = citationsHtml;

    // Add accept button
    var acceptBtn = this.createAcceptButton();
    var container = document.getElementById('sp-history-accept-container');
    container.innerHTML = '';
    container.appendChild(acceptBtn);
  };

  /**
   * Insert citation superscripts into content
   */
  HistoryModal.prototype.insertCitationSuperscripts = function(content, citations) {
    // This is a simple implementation - in production, the backend would
    // provide the content with citation markers already inserted
    var result = this.escapeHtml(content);
    for (var i = 0; i < citations.length; i++) {
      var citation = citations[i];
      if (citation.position !== undefined) {
        var before = result.substring(0, citation.position);
        var after = result.substring(citation.position);
        result = before + '<sup style="color: #3b82f6; font-size: 11px;">' + (i + 1) + '</sup>' + after;
      }
    }
    return result;
  };

  /**
   * Create accept button
   */
  HistoryModal.prototype.createAcceptButton = function() {
    var self = this;
    var btn = document.createElement('button');
    btn.className = 'sp-history-accept-btn';
    btn.innerHTML = '✨ Accept';
    btn.style.cssText = `
      padding: 12px 32px !important;
      background: linear-gradient(135deg, #3b82f6, #2563eb) !important;
      color: white !important;
      border: none !important;
      border-radius: 8px !important;
      font-size: 15px !important;
      font-weight: 600 !important;
      cursor: pointer !important;
      transition: all 0.2s !important;
      box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3) !important;
    `;
    btn.addEventListener('mouseenter', function() {
      this.style.background = 'linear-gradient(135deg, #2563eb, #1d4ed8)';
      this.style.transform = 'scale(1.05)';
      this.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.4)';
    });
    btn.addEventListener('mouseleave', function() {
      this.style.background = 'linear-gradient(135deg, #3b82f6, #2563eb)';
      this.style.transform = 'scale(1)';
      this.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.3)';
    });
    btn.addEventListener('click', function() {
      self.acceptResponse();
    });
    return btn;
  };

  /**
   * Render response list in right column
   */
  HistoryModal.prototype.renderResponseList = function(priorResponses, synthesizedHistory) {
    var self = this;
    var listEl = document.getElementById('sp-history-right-list');
    listEl.innerHTML = '';

    // Combine and categorize responses
    this.priorResponses = priorResponses || [];
    var synthesizedHistoryItems = synthesizedHistory || [];

    // Prior Applications section
    if (priorResponses.length > 0) {
      var priorHeader = document.createElement('div');
      priorHeader.innerHTML = '<strong style="font-size: 11px; color: #6b7280;">📋 Prior Applications</strong>';
      priorHeader.style.cssText = 'padding: 4px 0; margin-bottom: 4px;';
      listEl.appendChild(priorHeader);

      for (var i = 0; i < priorResponses.length; i++) {
        var item = this.createListItem(priorResponses[i], 'prior');
        listEl.appendChild(item);
      }
    }

    // Synthesized History section
    if (synthesizedHistoryItems.length > 0) {
      var historyHeader = document.createElement('div');
      historyHeader.innerHTML = '<strong style="font-size: 11px; color: #6b7280; margin-top: 8px;">✨ Synthesized History</strong>';
      historyHeader.style.cssText = 'padding: 4px 0; margin-bottom: 4px; margin-top: 12px;';
      listEl.appendChild(historyHeader);

      for (var j = 0; j < synthesizedHistoryItems.length; j++) {
        var histItem = this.createListItem(synthesizedHistoryItems[j], 'synthesized');
        listEl.appendChild(histItem);
      }
    }

    if (priorResponses.length === 0 && synthesizedHistoryItems.length === 0) {
      listEl.innerHTML = '<div style="color: #9ca3af; text-align: center; padding: 20px; font-size: 12px;">No past responses found</div>';
    }
  };

  /**
   * Create a list item
   */
  HistoryModal.prototype.createListItem = function(response, type) {
    var self = this;
    var item = document.createElement('div');
    item.className = 'sp-history-list-item';
    item.setAttribute('data-response-id', response.id);
    item.setAttribute('data-response-type', type);

    var label = '';
    if (type === 'prior') {
      label = (response.scholarship || 'Prior Application') + ' ' + (response.year || '');
    } else {
      label = 'Synthesized #' + (response.index || '?');
    }

    item.innerHTML = '<span style="font-size: 12px; color: #374151;">' + this.escapeHtml(label) + '</span>';
    item.style.cssText = `
      padding: 8px 10px !important;
      background: white !important;
      border: 1px solid #e5e7eb !important;
      border-radius: 6px !important;
      cursor: pointer !important;
      transition: all 0.2s !important;
    `;
    item.addEventListener('mouseenter', function() {
      if (this.getAttribute('data-selected') !== 'true') {
        this.style.background = '#f3f4f6';
        this.style.borderColor = '#d1d5db';
      }
    });
    item.addEventListener('mouseleave', function() {
      if (this.getAttribute('data-selected') !== 'true') {
        this.style.background = 'white';
        this.style.borderColor = '#e5e7eb';
      }
    });
    item.addEventListener('click', function() {
      self.selectResponse(response);
    });

    return item;
  };

  /**
   * Select a response for comparison
   */
  HistoryModal.prototype.selectResponse = function(response) {
    this.selectedResponseId = response.id;

    // Update list item styles
    var items = document.querySelectorAll('.sp-history-list-item');
    for (var i = 0; i < items.length; i++) {
      items[i].setAttribute('data-selected', 'false');
      items[i].style.background = 'white';
      items[i].style.borderColor = '#e5e7eb';
      items[i].style.boxShadow = 'none';
    }

    // Highlight selected item
    var selectedItem = document.querySelector('[data-response-id="' + response.id + '"]');
    if (selectedItem) {
      selectedItem.setAttribute('data-selected', 'true');
      selectedItem.style.background = '#eff6ff';
      selectedItem.style.borderColor = '#3b82f6';
      selectedItem.style.boxShadow = '0 0 0 2px rgba(59, 130, 246, 0.1)';
    }

    // Update comparison view
    document.getElementById('sp-history-center-content').textContent = response.content || '';
    document.getElementById('sp-history-center-metadata').innerHTML = this.formatResponseMetadata(response);
  };

  /**
   * Format response metadata
   */
  HistoryModal.prototype.formatResponseMetadata = function(response) {
    var parts = [];
    if (response.scholarship) parts.push(this.escapeHtml(response.scholarship));
    if (response.year) parts.push(this.escapeHtml(response.year));
    if (response.date) parts.push(this.escapeHtml(response.date));
    if (response.wordCount) parts.push(response.wordCount + ' words');
    return parts.join(' • ');
  };

  /**
   * Accept the synthesized response
   */
  HistoryModal.prototype.acceptResponse = function() {
    var self = this;
    if (!this.currentSynthesis) return;

    var acceptBtn = this.modal.querySelector('.sp-history-accept-btn');
    if (acceptBtn) {
      acceptBtn.innerHTML = 'Accepting...';
      acceptBtn.disabled = true;
    }

    fetch(this.apiBaseUrl + '/api/history/accept', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + this.authToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        synthesisId: this.currentSynthesis.id,
        fieldId: this.fieldId,
        scholarshipId: this.scholarshipId
      })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.success) {
        self.onAccept(data);
        self.close();
        self.triggerBurstAnimation();
      } else {
        throw new Error(data.error || 'Accept failed');
      }
    })
    .catch(function(error) {
      console.error('[History Modal] Accept failed:', error);
      alert('Failed to accept response: ' + error.message);
      if (acceptBtn) {
        acceptBtn.innerHTML = '✨ Accept';
        acceptBtn.disabled = false;
      }
    });
  };

  /**
   * Render "profile not ready" state
   */
  HistoryModal.prototype.renderProfileNotReady = function(status, progress) {
    var contentEl = document.getElementById('sp-history-left-content');
    if (!contentEl) return;

    var message = 'Your writing profile is still being generated.';
    if (status === 'generating') {
      message += ' Progress: ' + progress + '%';
    } else if (status === 'failed') {
      message = 'Profile generation failed. Please upload more essays.';
    } else if (status === 'not_found') {
      message = 'No profile found. Please upload essays to generate your profile.';
    }

    contentEl.innerHTML = '<div style="color: #f59e0b; font-size: 14px; text-align: center; padding: 40px 20px;">' + message + '</div>';
    document.getElementById('sp-history-citations').innerHTML = '';
    document.getElementById('sp-history-accept-container').innerHTML = '';
    document.getElementById('sp-history-right-list').innerHTML = '<div style="color: #9ca3af; text-align: center; padding: 20px; font-size: 12px;">Profile not ready</div>';
  };

  /**
   * Render "no synthesized response" state (when prior responses exist but no synthesis yet)
   */
  HistoryModal.prototype.renderNoSynthesized = function(profileStatus) {
    var contentEl = document.getElementById('sp-history-left-content');
    if (!contentEl) return;

    var message = 'No synthesized response available yet.';
    if (profileStatus !== 'ready') {
      message += ' Your writing profile is still being generated.';
    }

    contentEl.innerHTML = '<div style="color: #9ca3af; font-size: 14px; text-align: center; padding: 40px 20px;">' + message + '<br><br><span style="font-size: 12px;">Compare your past responses on the right</span></div>';
    document.getElementById('sp-history-citations').innerHTML = '';
    document.getElementById('sp-history-accept-container').innerHTML = '';
  };

  /**
   * Render "no data" state
   */
  HistoryModal.prototype.renderNoData = function() {
    var contentEl = document.getElementById('sp-history-left-content');
    if (!contentEl) return;

    contentEl.innerHTML = '<div style="color: #9ca3af; font-size: 14px; text-align: center; padding: 40px 20px;">No prior responses found for this field.<br><br><span style="font-size: 12px;">Fill out more applications to build your history</span></div>';
    document.getElementById('sp-history-citations').innerHTML = '';
    document.getElementById('sp-history-accept-container').innerHTML = '';
    document.getElementById('sp-history-right-list').innerHTML = '<div style="color: #9ca3af; text-align: center; padding: 20px; font-size: 12px;">No responses yet</div>';
  };

  /**
   * Render error state
   */
  HistoryModal.prototype.renderError = function(message) {
    document.getElementById('sp-history-left-content').innerHTML = '<div style="color: #ef4444; font-size: 14px; text-align: center; padding: 40px 20px;">' + message + '</div>';
    document.getElementById('sp-history-citations').innerHTML = '';
    document.getElementById('sp-history-accept-container').innerHTML = '';
    document.getElementById('sp-history-right-list').innerHTML = '<div style="color: #ef4444; text-align: center; padding: 20px; font-size: 12px;">Error loading</div>';
  };

  /**
   * Trigger burst animation on the sparkle icon
   */
  HistoryModal.prototype.triggerBurstAnimation = function() {
    // Find the sparkle icon for this field
    var sparkleIcon = document.querySelector('[data-field-id="' + this.fieldId + '"] .sp-sparkle-icon');
    if (sparkleIcon) {
      var rect = sparkleIcon.getBoundingClientRect();
      var centerX = rect.left + rect.width / 2;
      var centerY = rect.top + rect.height / 2;

      // Create particles
      for (var i = 0; i < 12; i++) {
        this.createParticle(centerX, centerY);
      }
    }
  };

  /**
   * Create a single burst particle
   */
  HistoryModal.prototype.createParticle = function(x, y) {
    var particle = document.createElement('div');
    particle.className = 'sp-sparkle-particle';

    var angle = (Math.random() * 360) * (Math.PI / 180);
    var velocity = 50 + Math.random() * 50;
    var tx = Math.cos(angle) * velocity;
    var ty = Math.sin(angle) * velocity;

    particle.style.cssText = `
      position: fixed !important;
      left: ${x}px !important;
      top: ${y}px !important;
      width: 8px !important;
      height: 8px !important;
      background: #60A5FA !important;
      border-radius: 50% !important;
      pointer-events: none !important;
      z-index: 999999 !important;
      --tw-x: ${tx}px !important;
      --tw-y: ${ty}px !important;
      animation: sparkle-burst 0.6s ease-out forwards !important;
    `;

    document.body.appendChild(particle);
    setTimeout(function() { particle.remove(); }, 600);
  };

  /**
   * Escape HTML to prevent XSS
   */
  HistoryModal.prototype.escapeHtml = function(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  // Export to global scope
  window.HistoryModal = HistoryModal;
})();
