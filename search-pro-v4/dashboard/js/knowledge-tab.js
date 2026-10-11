/**
 * Search Pro Control Panel - Knowledge Tab Handler
 * Version 4.5 - Last Update on 10/11/2026 - Knowledge Base rebuilt as an explaining page: the only thing it does is the Copy buttons of the two code blocks
 * The tab has no setting. The core still expects the handler methods below, so each one answers "nothing to do".
 */

class KnowledgeTabHandler {
  constructor() {
    this.core = null;
    this.tabId = "management";
    this.resetTimers = new Map();
  }

  setCore(core) {
    this.core = core;
  }

  init(container) {
    try {
      this.setupCopyButtons(container);
    } catch (error) {
      console.error("❌ Error initializing the Knowledge tab:", error);
    }
  }

  /**
   * Each Copy button copies the text of the code block named in its data-copy-target and says so on the button for a moment
   */
  setupCopyButtons(container) {
    container.querySelectorAll(".kb-copy[data-copy-target]").forEach((button) => {
      button.addEventListener("click", async () => {
        const target = container.querySelector(`#${button.dataset.copyTarget}`);
        if (!target) return;
        const copied = await this.copyToClipboard(target.textContent);
        this.showCopyResult(button, copied);
      });
    });
  }

  async copyToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      // Older browsers and pages that are not served over https
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.className = "kb-copy-buffer";
      document.body.appendChild(area);
      area.select();
      const done = document.execCommand("copy");
      document.body.removeChild(area);
      return done;
    } catch (error) {
      console.error("🚨 Could not copy to the clipboard:", error);
      return false;
    }
  }

  showCopyResult(button, copied) {
    const label = button.querySelector("span");
    if (!label) return;
    label.textContent = copied ? "Copied" : "Press Ctrl+C";
    button.classList.toggle("is-copied", copied);
    this.core?.showToast?.(
      copied ? "success" : "warning",
      copied ? "Copied" : "Not Copied",
      copied ? "The code is on your clipboard" : "Select the code and copy it by hand"
    );
    clearTimeout(this.resetTimers.get(button));
    this.resetTimers.set(
      button,
      setTimeout(() => {
        label.textContent = "Copy";
        button.classList.remove("is-copied");
      }, 1800)
    );
  }

  // ---- Interface the core expects (nothing to save, check or restore on this page) ----------------------------------------------

  getValidationStatus() {
    return true;
  }

  validateForm() {
    return true;
  }

  updateConfigFromForm() {}

  resetToDefaults() {}

  getConfigSummary() {
    return { tab: "Knowledge Base", sections: {} };
  }

  cleanup() {
    this.resetTimers.forEach((timer) => clearTimeout(timer));
    this.resetTimers.clear();
  }
}

// Export for module use
if (typeof module !== "undefined" && module.exports) {
  module.exports = KnowledgeTabHandler;
} else {
  window.KnowledgeTabHandler = KnowledgeTabHandler;
}
