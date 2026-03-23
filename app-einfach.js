const STORAGE_KEY = "github-lerneinheit-einfach-v1";
const TASK_SELECTOR = "input[data-task]";
const FIELD_SELECTOR = "[data-field]";

let toastTimer = null;

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveState(state) {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getTaskCheckboxes() {
  return [...document.querySelectorAll(TASK_SELECTOR)];
}

function getTaskCards() {
  return [...document.querySelectorAll(".task")];
}

function getStepNumber(card) {
  return Number(card.querySelector(TASK_SELECTOR)?.dataset.task || 0);
}

function getProgressInfo(state = loadState()) {
  const tasks = getTaskCheckboxes();
  const completed = tasks.filter((checkbox) => Boolean(state[`task_${checkbox.dataset.task}`])).length;
  const firstOpen = tasks.find((checkbox) => !state[`task_${checkbox.dataset.task}`]);
  const currentStep = firstOpen ? Number(firstOpen.dataset.task) : tasks.length;
  const unlockedThrough = completed === tasks.length ? tasks.length : Math.min(completed + 1, tasks.length);

  return {
    completed,
    total: tasks.length,
    currentStep,
    unlockedThrough
  };
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) {
    return;
  }

  toast.textContent = message;
  toast.classList.add("visible");

  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("visible");
  }, 2200);
}

function jumpToStep(stepNumber) {
  const target = document.getElementById(`step-${stepNumber}`);
  if (!target) {
    return;
  }

  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateLabelButton(hidden) {
  const button = document.getElementById("toggleLabels");
  button.textContent = hidden ? "Bildhinweise einblenden" : "Bildhinweise ausblenden";
}

function updateSaveState() {
  const badge = document.getElementById("saveState");
  const state = loadState();

  if (!state.updatedAt) {
    badge.textContent = "Noch nicht gespeichert";
    return;
  }

  const formatted = new Intl.DateTimeFormat("de-CH", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(state.updatedAt));

  badge.textContent = `Lokal gespeichert: ${formatted}`;
}

function hydrateInputs() {
  const state = loadState();

  document.getElementById("studentName").value = state.studentName || "";
  document.getElementById("studentClass").value = state.studentClass || "";
  document.getElementById("projectUrl").value = state.projectUrl || "";

  document.querySelectorAll(FIELD_SELECTOR).forEach((element) => {
    element.value = state[`field_${element.dataset.field}`] || "";
  });

  document.body.classList.toggle("labels-hidden", Boolean(state.labelsHidden));
  updateLabelButton(Boolean(state.labelsHidden));
}

function renderProgress(progress) {
  const progressText = document.getElementById("progressText");
  const progressFill = document.getElementById("progressFill");
  const ratio = progress.total ? (progress.completed / progress.total) * 100 : 0;

  progressText.textContent = `${progress.completed} / ${progress.total} GitHub-Schritte erledigt`;
  progressFill.style.width = `${ratio}%`;
}

function renderJourneyMap(state, progress) {
  const map = document.getElementById("journeyMap");

  map.innerHTML = getTaskCards()
    .map((card, index) => {
      const step = index + 1;
      const title = card.querySelector("h3")?.textContent || `Schritt ${step}`;
      const isDone = Boolean(state[`task_${step}`]);
      const isCurrent = step === progress.currentStep && !isDone;
      const isLocked = step > progress.unlockedThrough && !isDone;

      return `
        <a
          href="#step-${step}"
          class="journey-node ${isDone ? "is-done" : ""} ${isCurrent ? "is-current" : ""} ${isLocked ? "is-locked" : ""}"
          data-journey-step="${step}"
          ${isLocked ? 'aria-disabled="true"' : ""}
        >
          <span class="journey-dot">${step}</span>
          <span class="journey-label">${escapeHtml(title)}</span>
        </a>
      `;
    })
    .join("");
}

function renderMissionCockpit(progress) {
  const currentCard = document.getElementById(`step-${progress.currentStep}`);
  const title = currentCard?.querySelector("h3")?.textContent || "Lernstrecke abgeschlossen";
  const currentLabel = progress.completed === progress.total ? "Abschluss" : `Schritt ${progress.currentStep}`;

  document.getElementById("currentStepLabel").textContent = currentLabel;
  document.getElementById("currentStepTitle").textContent = title;
  document.getElementById("unlockedCount").textContent = `${progress.unlockedThrough} von ${progress.total}`;

  if (progress.completed === progress.total) {
    document.getElementById("streakLabel").textContent = "Alle Schritte abgeschlossen";
    return;
  }

  const remaining = progress.total - progress.completed;
  document.getElementById("streakLabel").textContent =
    remaining === 1 ? "Noch 1 Schritt offen" : `Noch ${remaining} Schritte offen`;
}

function renderUrlPreview(state) {
  const preview = document.getElementById("urlPreview");
  const url = state.field_finalUrl || state.projectUrl || "";

  if (!url) {
    preview.textContent = "Noch keine URL gespeichert.";
    return;
  }

  const safeUrl = escapeHtml(url);
  const link = url.startsWith("http")
    ? `<a href="${safeUrl}" target="_blank" rel="noreferrer">${safeUrl}</a>`
    : safeUrl;

  preview.innerHTML = `Gespeicherte URL: ${link}`;
}

function renderSummary(state, progress) {
  const summaryBox = document.getElementById("summaryBox");
  const entries = [
    ["Name", state.studentName || "Noch nicht eingetragen"],
    ["Klasse", state.studentClass || "Noch nicht eingetragen"],
    ["Prompt-Formel", state.field_promptFormula || "Noch nicht notiert"],
    ["Startprompt verbessern", state.field_promptWeakness || "Noch keine Beobachtung"],
    ["Rolle und Kontext", state.field_promptRoleContext || "Noch keine Ergänzung"],
    ["Konkrete Szene", state.field_promptSceneFocus || "Noch keine Szene notiert"],
    ["Fachliche Präzisierung", state.field_promptPrecision || "Noch keine Präzisierung"],
    ["GitHub-Username", state.field_username || "Noch nicht eingetragen"],
    ["Repository", state.field_repoName || "Noch nicht eingetragen"],
    ["Sichtbarkeit", state.field_visibility || "Noch nicht gewählt"],
    ["Projekt-URL", state.field_finalUrl || state.projectUrl || "Noch nicht eingetragen"],
    ["Fortschritt", `${progress.completed} von ${progress.total} Schritten erledigt`],
    ["Schwierigster Teil", state.field_reflectionChallenge || "Noch keine Reflexion"],
    ["Das kann ich jetzt", state.field_reflectionSkill || "Noch keine Reflexion"],
    ["Wichtige Startdatei", state.field_entryFile || "Noch nicht eingetragen"]
  ];

  summaryBox.innerHTML = entries
    .map(([label, value]) => {
      const renderedValue =
        label === "Projekt-URL" && String(value).startsWith("http")
          ? `<a href="${escapeHtml(value)}" target="_blank" rel="noreferrer">${escapeHtml(value)}</a>`
          : escapeHtml(value);

      return `
        <article class="summary-card">
          <strong>${escapeHtml(label)}</strong>
          <p>${renderedValue}</p>
        </article>
      `;
    })
    .join("");
}

function injectStepEnhancements() {
  getTaskCards().forEach((card) => {
    const step = getStepNumber(card);
    const taskBox = card.querySelector(".task-box");

    if (!taskBox || taskBox.querySelector(".step-status-row")) {
      return;
    }

    const statusRow = document.createElement("div");
    statusRow.className = "step-status-row";
    statusRow.innerHTML = `
      <span class="status-chip" data-step-status="${step}">Bereit</span>
      <div class="step-controls">
        <button class="btn ghost small" type="button" data-action="focus-image" data-step="${step}">Zum Bild</button>
        <button class="btn secondary small" type="button" data-action="jump-next" data-step="${step}">Nächster Schritt</button>
      </div>
    `;
    taskBox.append(statusRow);

    const lockedNote = document.createElement("p");
    lockedNote.className = "locked-note";
    lockedNote.dataset.lockedNote = String(step);
    lockedNote.hidden = true;
    taskBox.append(lockedNote);
  });
}

function applyStepStates(state, progress) {
  getTaskCards().forEach((card) => {
    const step = getStepNumber(card);
    const isDone = Boolean(state[`task_${step}`]);
    const isCurrent = step === progress.currentStep && !isDone;
    const isLocked = step > progress.unlockedThrough && !isDone;
    const statusChip = card.querySelector(`[data-step-status="${step}"]`);
    const lockedNote = card.querySelector(`[data-locked-note="${step}"]`);
    const nextButton = card.querySelector(`[data-action="jump-next"][data-step="${step}"]`);
    const checkbox = card.querySelector(TASK_SELECTOR);

    card.classList.toggle("done", isDone);
    card.classList.toggle("current", isCurrent);
    card.classList.toggle("locked", isLocked);

    if (checkbox) {
      checkbox.checked = isDone;
      checkbox.disabled = isLocked;
    }

    card.querySelectorAll("input, select, textarea, button").forEach((element) => {
      const isTaskCheckbox = element.matches(TASK_SELECTOR);
      const isActionButton = element.dataset.action === "jump-next" || element.dataset.action === "focus-image";

      if (isTaskCheckbox) {
        return;
      }

      if (isActionButton) {
        element.disabled = isLocked;
        return;
      }

      element.disabled = isLocked;
    });

    if (statusChip) {
      statusChip.className = "status-chip";

      if (isDone) {
        statusChip.classList.add("done");
        statusChip.textContent = "Geschafft";
      } else if (isLocked) {
        statusChip.classList.add("locked");
        statusChip.textContent = "Gesperrt";
      } else if (isCurrent) {
        statusChip.classList.add("current");
        statusChip.textContent = "Jetzt dran";
      } else {
        statusChip.textContent = "Freigeschaltet";
      }
    }

    if (lockedNote) {
      if (isLocked) {
        lockedNote.hidden = false;
        lockedNote.textContent = `Dieser Schritt wird aktiv, sobald du Schritt ${step - 1} abgeschlossen hast.`;
      } else {
        lockedNote.hidden = true;
      }
    }

    if (nextButton) {
      nextButton.textContent = step === progress.total ? "Letzter Schritt" : "Nächster Schritt";
    }
  });
}

function renderUI() {
  const state = loadState();
  const progress = getProgressInfo(state);

  updateSaveState();
  renderProgress(progress);
  renderJourneyMap(state, progress);
  renderMissionCockpit(progress);
  renderUrlPreview(state);
  renderSummary(state, progress);
  applyStepStates(state, progress);
}

function setStateValue(key, value) {
  const state = loadState();
  state[key] = value;
  saveState(state);
  renderUI();
}

function persistProfile() {
  const state = loadState();
  state.studentName = document.getElementById("studentName").value;
  state.studentClass = document.getElementById("studentClass").value;
  state.projectUrl = document.getElementById("projectUrl").value;
  saveState(state);
  renderUI();
}

function exportSummary() {
  const state = loadState();
  const progress = getProgressInfo(state);
  const lines = [
    "Prompting- und GitHub-Lernstrecke - Einfache Version",
    "",
    `Name: ${state.studentName || "-"}`,
    `Klasse: ${state.studentClass || "-"}`,
    `Prompt-Formel: ${state.field_promptFormula || "-"}`,
    `Startprompt verbessern: ${state.field_promptWeakness || "-"}`,
    `Rolle und Kontext: ${state.field_promptRoleContext || "-"}`,
    `Konkrete Szene: ${state.field_promptSceneFocus || "-"}`,
    `Fachliche Präzisierung: ${state.field_promptPrecision || "-"}`,
    `GitHub-Username: ${state.field_username || "-"}`,
    `Repository: ${state.field_repoName || "-"}`,
    `Sichtbarkeit: ${state.field_visibility || "-"}`,
    `Projekt-URL: ${state.field_finalUrl || state.projectUrl || "-"}`,
    `Fortschritt: ${progress.completed}/${progress.total}`,
    `Wichtige Startdatei: ${state.field_entryFile || "-"}`,
    `Schwierigster Teil: ${state.field_reflectionChallenge || "-"}`,
    `Das kann ich jetzt: ${state.field_reflectionSkill || "-"}`,
    "",
    "Einzelantworten:",
    `Startaktion: ${state.field_startAction || "-"}`,
    `Passwort-Merkhilfe: ${state.field_passwordRule || "-"}`,
    `Plus-Menü: ${state.field_plusMenuPurpose || "-"}`,
    `New Repository: ${state.field_newRepoEntry || "-"}`,
    `Namensbegründung: ${state.field_repoReason || "-"}`,
    `Repo erstellt erkennbar an: ${state.field_repoCreatedHint || "-"}`,
    `Nötige Dateien: ${state.field_requiredFiles || "-"}`,
    `Pages-Position: ${state.field_pagesLocation || "-"}`,
    `Branch: ${state.field_branch || "-"}`,
    `Ordner: ${state.field_rootFolder || "-"}`
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const baseName = (state.studentName || "github-lernstrecke-einfach").trim().replace(/\s+/g, "-").toLowerCase();

  link.href = url;
  link.download = `${baseName || "github-lernstrecke-einfach"}-lernnachweis.txt`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function bindJourneyMap() {
  document.getElementById("journeyMap").addEventListener("click", (event) => {
    const link = event.target.closest("[data-journey-step]");
    if (!link) {
      return;
    }

    const step = Number(link.dataset.journeyStep);
    const progress = getProgressInfo(loadState());

    if (step > progress.unlockedThrough) {
      event.preventDefault();
      showToast("Dieser Schritt ist noch gesperrt.");
      return;
    }

    event.preventDefault();
    jumpToStep(step);
  });
}

function bindEvents() {
  getTaskCheckboxes().forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const step = Number(checkbox.dataset.task);
      const state = loadState();
      const wasChecked = Boolean(state[`task_${step}`]);

      state[`task_${step}`] = checkbox.checked;
      saveState(state);
      renderUI();

      if (!wasChecked && checkbox.checked) {
        const progress = getProgressInfo(state);

        if (step < progress.total) {
          showToast(`Schritt ${step} geschafft. Schritt ${step + 1} ist jetzt freigeschaltet.`);
        } else {
          showToast("Alle Schritte der einfachen Lernstrecke sind geschafft.");
        }
      }
    });
  });

  document.querySelectorAll(FIELD_SELECTOR).forEach((element) => {
    element.addEventListener("input", () => {
      setStateValue(`field_${element.dataset.field}`, element.value);
    });
  });

  ["studentName", "studentClass", "projectUrl"].forEach((id) => {
    document.getElementById(id).addEventListener("input", persistProfile);
  });

  document.getElementById("saveProfile").addEventListener("click", () => {
    persistProfile();
    showToast("Deine Angaben wurden lokal gespeichert.");
  });

  document.getElementById("toggleLabels").addEventListener("click", () => {
    const state = loadState();
    state.labelsHidden = !state.labelsHidden;
    saveState(state);
    document.body.classList.toggle("labels-hidden", Boolean(state.labelsHidden));
    updateLabelButton(Boolean(state.labelsHidden));
    renderUI();
  });

  document.getElementById("exportSummary").addEventListener("click", exportSummary);

  document.getElementById("resetAll").addEventListener("click", () => {
    const confirmed = window.confirm(
      "Sollen wirklich alle lokal gespeicherten Angaben und Fortschritte entfernt werden?"
    );

    if (!confirmed) {
      return;
    }

    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  });

  document.getElementById("jumpCurrent").addEventListener("click", () => {
    jumpToStep(getProgressInfo(loadState()).currentStep);
  });

  document.getElementById("focusCurrent").addEventListener("click", () => {
    jumpToStep(getProgressInfo(loadState()).currentStep);
  });

  document.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) {
      return;
    }

    const step = Number(actionButton.dataset.step);

    if (actionButton.dataset.action === "focus-image") {
      const state = loadState();
      state.labelsHidden = false;
      saveState(state);
      document.body.classList.remove("labels-hidden");
      updateLabelButton(false);
      document.querySelector(`#step-${step} .shot`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      renderUI();
      return;
    }

    if (actionButton.dataset.action === "jump-next") {
      const progress = getProgressInfo(loadState());
      jumpToStep(Math.min(step + 1, progress.total));
    }
  });

  bindJourneyMap();
}

function init() {
  hydrateInputs();
  injectStepEnhancements();
  bindEvents();
  renderUI();
}

init();
