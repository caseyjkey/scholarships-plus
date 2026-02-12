/**
 * Style Settings Modal Component
 *
 * Allows users to override the writing style for synthesis regeneration:
 * - Tone (radio): inspirational, pragmatic, personal, formal, conversational
 * - Voice (radio): first-person narrative, confident, humble, enthusiastic
 * - Complexity (slider): simple (1) to sophisticated (10)
 * - Focus (radio): story-driven, achievement-oriented, community-focused, academic
 *
 * Usage:
 *   var modal = new StyleSettingsModal({
 *     currentStyle: { tone: 'conversational', voice: 'first-person narrative', ... },
 *     onSave: function(styleOverrides) { ... }
 *   });
 *   modal.open();
 */

(function() {
  'use strict';

  /**
   * Style Settings Modal Constructor
   */
  function StyleSettingsModal(options) {
    this.currentStyle = options.currentStyle || {};
    this.onSave = options.onSave || function() {};
    this.onCancel = options.onCancel || function() {};

    this.modal = null;
    this.backdrop = null;

    // Default values
    this.defaults = {
      tone: 'conversational',
      voice: 'first-person narrative',
      complexity: 5,
      focus: 'story-driven'
    };

    // Options
    this.options = {
      tone: ['inspirational', 'pragmatic', 'personal', 'formal', 'conversational'],
      voice: ['first-person narrative', 'confident', 'humble', 'enthusiastic'],
      focus: ['story-driven', 'achievement-oriented', 'community-focused', 'academic']
    };
  }

  /**
   * Open the modal
   */
  StyleSettingsModal.prototype.open = function() {
    this.createModal();
  };

  /**
   * Close the modal
   */
  StyleSettingsModal.prototype.close = function() {
    if (this.modal) {
      this.modal.remove();
    }
    if (this.backdrop) {
      this.backdrop.remove();
    }
  };

  /**
   * Create the modal DOM structure
   */
  StyleSettingsModal.prototype.createModal = function() {
    var self = this;

    // Create backdrop
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'sp-style-backdrop';
    this.backdrop.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      background: rgba(0,0,0,0.5) !important;
      z-index: 999999 !important;
    `;
    this.backdrop.addEventListener('click', function() { self.close(); });
    document.body.appendChild(this.backdrop);

    // Create modal
    this.modal = document.createElement('div');
    this.modal.className = 'sp-style-modal';
    this.modal.style.cssText = `
      position: fixed !important;
      top: 50% !important;
      left: 50% !important;
      transform: translate(-50%, -50%) !important;
      width: 90% !important;
      max-width: 450px !important;
      background: white !important;
      border-radius: 12px !important;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3) !important;
      z-index: 1000000 !important;
      display: flex !important;
      flex-direction: column !important;
      font-family: system-ui, -apple-system, sans-serif !important;
    `;

    // Create header
    var header = document.createElement('div');
    header.className = 'sp-style-header';
    header.style.cssText = `
      padding: 16px 20px !important;
      border-bottom: 1px solid #e5e7eb !important;
    `;

    var title = document.createElement('h3');
    title.textContent = 'Writing Style';
    title.style.cssText = `
      margin: 0 !important;
      font-size: 18px !important;
      font-weight: 600 !important;
      color: #1f2937 !important;
    `;

    var subtitle = document.createElement('p');
    subtitle.textContent = 'Adjust how your response sounds';
    subtitle.style.cssText = `
      margin: 4px 0 0 0 !important;
      font-size: 13px !important;
      color: #6b7280 !important;
    `;

    var closeButton = document.createElement('button');
    closeButton.innerHTML = '×';
    closeButton.className = 'sp-style-close';
    closeButton.style.cssText = `
      position: absolute !important;
      top: 12px !important;
      right: 12px !important;
      background: none !important;
      border: none !important;
      font-size: 24px !important;
      cursor: pointer !important;
      color: #6b7280 !important;
      padding: 0 !important;
      width: 32px !important;
      height: 32px !important;
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

    header.style.position = 'relative';
    header.appendChild(title);
    header.appendChild(subtitle);
    header.appendChild(closeButton);

    // Create body with settings
    var body = this.createSettingsBody();

    // Create footer with buttons
    var footer = this.createFooter();

    this.modal.appendChild(header);
    this.modal.appendChild(body);
    this.modal.appendChild(footer);

    document.body.appendChild(this.modal);
  };

  /**
   * Create settings body with controls
   */
  StyleSettingsModal.prototype.createSettingsBody = function() {
    var body = document.createElement('div');
    body.className = 'sp-style-body';
    body.style.cssText = `
      padding: 20px !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 20px !important;
    `;

    // Tone (radio)
    body.appendChild(this.createRadioGroup('tone', 'Tone', this.options.tone, this.currentStyle.tone));

    // Voice (radio)
    body.appendChild(this.createRadioGroup('voice', 'Voice', this.options.voice, this.currentStyle.voice));

    // Complexity (slider)
    body.appendChild(this.createSliderGroup('complexity', 'Complexity', this.currentStyle.complexity || this.defaults.complexity));

    // Focus (radio)
    body.appendChild(this.createRadioGroup('focus', 'Focus', this.options.focus, this.currentStyle.focus));

    return body;
  };

  /**
   * Create radio button group
   */
  StyleSettingsModal.prototype.createRadioGroup = function(name, label, options, currentValue) {
    var container = document.createElement('div');
    container.className = 'sp-style-group sp-style-group-' + name;

    var labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.className = 'sp-style-label';
    labelEl.style.cssText = `
      display: block !important;
      font-size: 14px !important;
      font-weight: 600 !important;
      color: #374151 !important;
      margin-bottom: 10px !important;
    `;
    container.appendChild(labelEl);

    var optionsContainer = document.createElement('div');
    optionsContainer.className = 'sp-style-options';
    optionsContainer.style.cssText = `
      display: grid !important;
      grid-template-columns: 1fr 1fr !important;
      gap: 8px !important;
    `;

    for (var i = 0; i < options.length; i++) {
      var option = options[i];
      var optionLabel = this.formatOptionLabel(option);

      var radioContainer = document.createElement('label');
      radioContainer.className = 'sp-style-radio';
      radioContainer.style.cssText = `
        display: flex !important;
        align-items: center !important;
        gap: 6px !important;
        padding: 8px !important;
        border: 1px solid #d1d5db !important;
        border-radius: 6px !important;
        cursor: pointer !important;
        transition: all 0.2s !important;
        font-size: 13px !important;
      `;

      var isSelected = currentValue === option;

      if (isSelected) {
        radioContainer.style.background = '#eff6ff';
        radioContainer.style.borderColor = '#3b82f6';
      }

      radioContainer.addEventListener('mouseenter', function() {
        if (!this.style.background || this.style.background === 'white' || this.style.background === 'rgb(255, 255, 255)') {
          this.style.background = '#f9fafb';
        }
      });
      radioContainer.addEventListener('mouseleave', function() {
        if (!this.dataset.selected) {
          this.style.background = 'white';
        }
      });

      var radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'sp-style-' + name;
      radio.value = option;
      radio.checked = isSelected;
      radio.style.cssText = `
        margin: 0 !important;
        cursor: pointer !important;
      `;
      radio.addEventListener('change', (function(container) {
        return function() {
          // Reset all in group
          var all = container.parentElement.querySelectorAll('.sp-style-radio');
          for (var j = 0; j < all.length; j++) {
            all[j].style.background = 'white';
            all[j].style.borderColor = '#d1d5db';
            delete all[j].dataset.selected;
          }
          // Highlight selected
          var selected = this.parentElement;
          selected.style.background = '#eff6ff';
          selected.style.borderColor = '#3b82f6';
          selected.dataset.selected = 'true';
        };
      })(radioContainer));

      var text = document.createElement('span');
      text.textContent = optionLabel;
      text.style.cssText = `
        flex: 1 !important;
        color: #374151 !important;
      `;

      radioContainer.appendChild(radio);
      radioContainer.appendChild(text);
      optionsContainer.appendChild(radioContainer);
    }

    container.appendChild(optionsContainer);
    return container;
  };

  /**
   * Create slider group for complexity
   */
  StyleSettingsModal.prototype.createSliderGroup = function(name, label, currentValue) {
    var container = document.createElement('div');
    container.className = 'sp-style-group sp-style-group-' + name;

    var labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.className = 'sp-style-label';
    labelEl.style.cssText = `
      display: flex !important;
      justify-content: space-between !important;
      font-size: 14px !important;
      font-weight: 600 !important;
      color: #374151 !important;
      margin-bottom: 10px !important;
    `;

    var valueDisplay = document.createElement('span');
    valueDisplay.className = 'sp-style-value-display';
    valueDisplay.id = 'sp-style-value-' + name;
    valueDisplay.textContent = this.formatComplexityLabel(currentValue);
    valueDisplay.style.cssText = `
      color: #3b82f6 !important;
      font-weight: 500 !important;
    `;

    labelEl.appendChild(valueDisplay);
    container.appendChild(labelEl);

    // Slider container
    var sliderContainer = document.createElement('div');
    sliderContainer.style.cssText = `
      display: flex !important;
      align-items: center !important;
      gap: 12px !important;
    `;

    // Labels
    var minLabel = document.createElement('span');
    minLabel.textContent = 'Simple';
    minLabel.style.cssText = `
      font-size: 12px !important;
      color: #9ca3af !important;
    `;

    var maxLabel = document.createElement('span');
    maxLabel.textContent = 'Sophisticated';
    maxLabel.style.cssText = `
      font-size: 12px !important;
      color: #9ca3af !important;
    `;

    // Slider
    var slider = document.createElement('input');
    slider.type = 'range';
    slider.name = 'sp-style-' + name;
    slider.min = '1';
    slider.max = '10';
    slider.value = currentValue;
    slider.className = 'sp-style-slider';
    slider.style.cssText = `
      flex: 1 !important;
      height: 6px !important;
      border-radius: 3px !important;
      background: #e5e7eb !important;
      outline: none !important;
      -webkit-appearance: none !important;
    `;
    slider.addEventListener('input', function() {
      var display = document.getElementById('sp-style-value-' + name);
      display.textContent = this.formatComplexityLabel(parseInt(this.value));
    }.bind(this));

    sliderContainer.appendChild(minLabel);
    sliderContainer.appendChild(slider);
    sliderContainer.appendChild(maxLabel);

    container.appendChild(sliderContainer);
    return container;
  };

  /**
   * Format option label for display
   */
  StyleSettingsModal.prototype.formatOptionLabel = function(option) {
    // Convert snake_case or kebab-case to Title Case
    return option
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, function(l) { return l.toUpperCase(); });
  };

  /**
   * Format complexity label
   */
  StyleSettingsModal.prototype.formatComplexityLabel = function(value) {
    var labels = {
      1: 'Simple (1)',
      2: 'Simple (2)',
      3: 'Simple (3)',
      4: 'Moderate (4)',
      5: 'Moderate (5)',
      6: 'Moderate (6)',
      7: 'Sophisticated (7)',
      8: 'Sophisticated (8)',
      9: 'Sophisticated (9)',
      10: 'Sophisticated (10)'
    };
    return labels[value] || 'Moderate (' + value + ')';
  };

  /**
   * Create footer with action buttons
   */
  StyleSettingsModal.prototype.createFooter = function() {
    var self = this;
    var footer = document.createElement('div');
    footer.className = 'sp-style-footer';
    footer.style.cssText = `
      padding: 16px 20px !important;
      border-top: 1px solid #e5e7eb !important;
      display: flex !important;
      gap: 12px !important;
      justify-content: flex-end !important;
    `;

    // Cancel button
    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.className = 'sp-style-cancel';
    cancelBtn.style.cssText = `
      padding: 10px 20px !important;
      background: white !important;
      color: #374151 !important;
      border: 1px solid #d1d5db !important;
      border-radius: 6px !important;
      font-size: 14px !important;
      font-weight: 500 !important;
      cursor: pointer !important;
      transition: all 0.2s !important;
    `;
    cancelBtn.addEventListener('mouseenter', function() {
      this.style.background = '#f9fafb';
    });
    cancelBtn.addEventListener('mouseleave', function() {
      this.style.background = 'white';
    });
    cancelBtn.addEventListener('click', function() {
      self.close();
      self.onCancel();
    });

    // Apply & Regenerate button
    var applyBtn = document.createElement('button');
    applyBtn.textContent = 'Apply & Regenerate';
    applyBtn.className = 'sp-style-apply';
    applyBtn.style.cssText = `
      padding: 10px 20px !important;
      background: #3b82f6 !important;
      color: white !important;
      border: none !important;
      border-radius: 6px !important;
      font-size: 14px !important;
      font-weight: 600 !important;
      cursor: pointer !important;
      transition: all 0.2s !important;
    `;
    applyBtn.addEventListener('mouseenter', function() {
      this.style.background = '#2563eb';
    });
    applyBtn.addEventListener('mouseleave', function() {
      this.style.background = '#3b82f6';
    });
    applyBtn.addEventListener('click', function() {
      var styleOverrides = self.getFormValues();
      self.close();
      self.onSave(styleOverrides);
    });

    footer.appendChild(cancelBtn);
    footer.appendChild(applyBtn);

    return footer;
  };

  /**
   * Get current form values as style overrides
   */
  StyleSettingsModal.prototype.getFormValues = function() {
    // Get tone
    var toneInput = this.modal.querySelector('input[name="sp-style-tone"]:checked');
    var tone = toneInput ? toneInput.value : null;

    // Get voice
    var voiceInput = this.modal.querySelector('input[name="sp-style-voice"]:checked');
    var voice = voiceInput ? voiceInput.value : null;

    // Get complexity
    var complexityInput = this.modal.querySelector('input[name="sp-style-complexity"]');
    var complexity = complexityInput ? parseInt(complexityInput.value) : null;

    // Get focus
    var focusInput = this.modal.querySelector('input[name="sp-style-focus"]:checked');
    var focus = focusInput ? focusInput.value : null;

    var overrides = {};

    if (tone && tone !== this.currentStyle.tone) {
      overrides.tone = tone;
    }
    if (voice && voice !== this.currentStyle.voice) {
      overrides.voice = voice;
    }
    if (complexity && complexity !== this.currentStyle.complexity) {
      // Map 1-10 to simple/moderate/sophisticated
      if (complexity <= 3) {
        overrides.complexity = 'simple';
      } else if (complexity <= 6) {
        overrides.complexity = 'moderate';
      } else {
        overrides.complexity = 'sophisticated';
      }
    }
    if (focus && focus !== this.currentStyle.focus) {
      overrides.focus = focus;
    }

    return overrides;
  };

  // Export to global scope
  window.StyleSettingsModal = StyleSettingsModal;
})();
