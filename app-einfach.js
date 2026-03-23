const STORAGE_KEY = "github-lerneinheit-einfach-v1";
const STORAGE_VERSION = 2;
const TASK_SELECTOR = "input[data-task]";
const FIELD_SELECTOR = "[data-field]";
const PROJECT_CHECK_SELECTOR = "input[data-project-check]";

let currentState = {};
let storageReady = false;
let sessionPassword = "";
let persistQueue = Promise.resolve();
let securityState = {
  enabled: false,
  locked: false
};
let toastTimer = null;

function loadState() {
  return currentState;
}

function saveState(state) {
  currentState = state;
  currentState.updatedAt = new Date().toISOString();
  void queuePersist(cloneState(currentState));
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state || {}));
}

function readStorageEnvelope() {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);

    if (parsed?.storageVersion === STORAGE_VERSION) {
      return parsed;
    }

    return {
      storageVersion: STORAGE_VERSION,
      mode: "plain",
      state: parsed || {}
    };
  } catch {
    return {
      storageVersion: STORAGE_VERSION,
      mode: "plain",
      state: {}
    };
  }
}

function bytesToBase64(bytes) {
  let binary = "";

  bytes.forEach((value) => {
    binary += String.fromCharCode(value);
  });

  return window.btoa(binary);
}

function base64ToBytes(value) {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function deriveKey(password, salt) {
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 120000,
      hash: "SHA-256"
    },
    keyMaterial,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptStateSnapshot(state, password) {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(state));
  const ciphertext = new Uint8Array(
    await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv
      },
      key,
      plaintext
    )
  );

  return {
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext)
  };
}

async function decryptStateSnapshot(payload, password) {
  try {
    const key = await deriveKey(password, base64ToBytes(payload.salt));
    const plaintext = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64ToBytes(payload.iv)
      },
      key,
      base64ToBytes(payload.ciphertext)
    );

    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    return null;
  }
}

async function persistSnapshot(snapshot) {
  if (securityState.enabled) {
    if (!sessionPassword) {
      return;
    }

    const encrypted = await encryptStateSnapshot(snapshot, sessionPassword);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        storageVersion: STORAGE_VERSION,
        mode: "encrypted",
        encrypted
      })
    );
    return;
  }

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      storageVersion: STORAGE_VERSION,
      mode: "plain",
      state: snapshot
    })
  );
}

function queuePersist(snapshot) {
  if (!storageReady) {
    return Promise.resolve();
  }

  persistQueue = persistQueue
    .then(() => persistSnapshot(snapshot))
    .catch((error) => {
      console.error(error);
      showToast("Speichern fehlgeschlagen.");
    });

  return persistQueue;
}

function isStorageLocked() {
  return securityState.enabled && securityState.locked;
}

function clearSecurityInput() {
  const input = document.getElementById("storagePassword");

  if (input) {
    input.value = "";
  }
}

function renderSecurityControls() {
  const status = document.getElementById("securityStatus");
  const hint = document.getElementById("securityHint");
  const input = document.getElementById("storagePassword");
  const setButton = document.getElementById("setStoragePassword");
  const unlockButton = document.getElementById("unlockStorage");
  const lockButton = document.getElementById("lockStorage");
  const removeButton = document.getElementById("removeStoragePassword");
  const enabled = securityState.enabled;
  const locked = isStorageLocked();

  if (!status || !hint || !input) {
    return;
  }

  status.className = "status-pill subtle";

  if (!enabled) {
    status.textContent = "Nicht aktiviert";
    hint.textContent = "Optional: Schütze alle lokal gespeicherten Einträge mit einem Passwort.";
    input.placeholder = "Passwort eingeben";
    setButton.hidden = false;
    unlockButton.hidden = true;
    lockButton.hidden = true;
    removeButton.hidden = true;
    return;
  }

  if (locked) {
    status.classList.add("locked");
    status.textContent = "Gesperrt";
    hint.textContent = "Die Einträge sind geschützt. Gib das Passwort ein, um sie wieder anzuzeigen.";
    input.placeholder = "Passwort zum Entsperren";
    setButton.hidden = true;
    unlockButton.hidden = false;
    lockButton.hidden = true;
    removeButton.hidden = true;
    return;
  }

  status.classList.add("done");
  status.textContent = "Aktiv";
  hint.textContent = "Der Passwortschutz ist aktiv. Du kannst die Einträge sperren oder den Schutz wieder entfernen.";
  input.placeholder = "Optional Passwort erneut eingeben";
  setButton.hidden = true;
  unlockButton.hidden = true;
  lockButton.hidden = false;
  removeButton.hidden = false;
}

function applyGlobalLockState() {
  const locked = isStorageLocked();
  const protectedButtons = [
    "saveProfile",
    "toggleProfileRow",
    "toggleProjectGuide",
    "toggleProjectChecklist",
    "toggleProjectFeedback",
    "toggleLabels",
    "exportSummary",
    "jumpCurrent",
    "focusCurrent",
    "runProjectFeedback",
    "clearProjectFeedback"
  ];

  ["studentName", "studentClass", "projectUrl"].forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      element.disabled = locked;
    }
  });

  document.querySelectorAll("#prompting-unit [data-field], #project-part [data-field]").forEach((element) => {
    element.disabled = locked;
  });

  document.querySelectorAll(PROJECT_CHECK_SELECTOR).forEach((element) => {
    element.disabled = locked;
  });

  protectedButtons.forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      element.disabled = locked;
    }
  });
}

async function initializeStorage() {
  const envelope = readStorageEnvelope();

  if (!envelope) {
    currentState = {};
    securityState = { enabled: false, locked: false };
    return;
  }

  if (envelope.mode === "encrypted") {
    currentState = {};
    securityState = { enabled: true, locked: true };
    return;
  }

  currentState = envelope.state || {};
  securityState = { enabled: false, locked: false };
}

async function enablePasswordProtection() {
  const input = document.getElementById("storagePassword");
  const password = input?.value || "";

  if (!window.crypto?.subtle) {
    showToast("Dieser Browser unterstützt den Passwortschutz hier nicht.");
    return;
  }

  if (password.trim().length < 4) {
    showToast("Bitte wähle ein Passwort mit mindestens 4 Zeichen.");
    return;
  }

  securityState.enabled = true;
  securityState.locked = false;
  sessionPassword = password;
  currentState.updatedAt = new Date().toISOString();
  await queuePersist(cloneState(currentState));
  clearSecurityInput();
  renderSecurityControls();
  renderUI();
  showToast("Passwortschutz aktiviert.");
}

async function unlockProtectedStorage() {
  const input = document.getElementById("storagePassword");
  const password = input?.value || "";
  const envelope = readStorageEnvelope();

  if (!password) {
    showToast("Bitte gib das Passwort ein.");
    return;
  }

  if (!envelope?.encrypted) {
    showToast("Kein geschützter Speicher gefunden.");
    return;
  }

  const decrypted = await decryptStateSnapshot(envelope.encrypted, password);

  if (!decrypted) {
    showToast("Das Passwort stimmt nicht.");
    return;
  }

  currentState = decrypted;
  securityState.locked = false;
  sessionPassword = password;
  clearSecurityInput();
  hydrateInputs();
  renderUI();
  showToast("Einträge entsperrt.");
}

function lockProtectedStorage() {
  securityState.locked = true;
  sessionPassword = "";
  currentState = {};
  clearSecurityInput();
  hydrateInputs();
  renderUI();
  showToast("Einträge gesperrt.");
}

async function removePasswordProtection() {
  const confirmed = window.confirm(
    "Soll der Passwortschutz entfernt und die Einträge wieder normal lokal gespeichert werden?"
  );

  if (!confirmed) {
    return;
  }

  securityState.enabled = false;
  securityState.locked = false;
  currentState.updatedAt = new Date().toISOString();
  await queuePersist(cloneState(currentState));
  sessionPassword = "";
  clearSecurityInput();
  renderSecurityControls();
  renderUI();
  showToast("Passwortschutz entfernt.");
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

function updateProfileRowButton(hidden) {
  const button = document.getElementById("toggleProfileRow");
  if (!button) {
    return;
  }

  button.textContent = hidden ? "Angabenzeile einblenden" : "Angabenzeile ausblenden";
}

function updateProjectGuideButton(hidden) {
  const button = document.getElementById("toggleProjectGuide");
  if (!button) {
    return;
  }

  button.textContent = hidden ? "Leitfaden einblenden" : "Leitfaden ausblenden";
}

function updateProjectChecklistButton(hidden) {
  const button = document.getElementById("toggleProjectChecklist");
  if (!button) {
    return;
  }

  button.textContent = hidden ? "Checkliste einblenden" : "Checkliste ausblenden";
}

function updateProjectFeedbackButton(hidden) {
  const button = document.getElementById("toggleProjectFeedback");
  if (!button) {
    return;
  }

  button.textContent = hidden ? "Feedbacktool einblenden" : "Feedbacktool ausblenden";
}

function renderProjectFeedbackOutput(state) {
  const output = document.getElementById("projectFeedbackOutput");
  if (!output) {
    return;
  }

  if (isStorageLocked()) {
    output.innerHTML = "<p>Das Feedback ist passwortgeschützt.</p>";
    return;
  }

  const feedback = Array.isArray(state.projectFeedbackItems) ? state.projectFeedbackItems : [];

  if (feedback.length === 0) {
    output.innerHTML = "<p>Noch kein Feedback erzeugt.</p>";
    return;
  }

  output.innerHTML = `
    <ol class="feedback-list">
      ${feedback.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ol>
  `;
}

function generateProjectFeedback(state) {
  const feedback = [];
  const title = (state.field_projectTitle || "").trim();
  const audience = (state.field_projectAudience || "").trim();
  const question = (state.field_projectQuestion || "").trim();
  const materials = (state.field_projectMaterials || "").trim();
  const goals = (state.field_projectGoals || "").trim();
  const flow = (state.field_projectFlow || "").trim();
  const product = (state.field_projectProduct || "").trim();
  const support = (state.field_projectSupport || "").trim();

  if (!title) {
    feedback.push("Gib dem Projekt einen klaren Arbeitstitel, damit die Einheit ein erkennbares Profil bekommt.");
  }

  if (!audience) {
    feedback.push("Die Zielgruppe oder Klasse fehlt noch. Das erschwert die passende Schwierigkeitsstufe und Materialwahl.");
  }

  if (question.length < 30) {
    feedback.push("Die Leitfrage wirkt noch zu knapp. Formuliere sie so, dass sie die Deutung oder das Problem wirklich öffnet.");
  }

  if (!materials) {
    feedback.push("Die Materialbasis ist noch offen. Entscheide bewusst, ob Text, Hörbuch, Film oder eine Kombination zentral ist.");
  } else if (!/text|hörbuch|film|verfilmung/i.test(materials)) {
    feedback.push("Benenne die Materialien konkreter, damit sichtbar wird, worauf sich die Einheit tatsächlich stützt.");
  }

  if (goals.length < 50) {
    feedback.push("Die Lernziele sollten noch präziser werden: Was sollen Lernende am Ende erkennen, deuten, vergleichen oder gestalten?");
  }

  if (!/einstieg|erarbeitung|sicherung|transfer|vertiefung/i.test(flow)) {
    feedback.push("Die Ablaufskizze könnte klarer in Phasen gegliedert sein, zum Beispiel Einstieg, Erarbeitung, Sicherung und Transfer.");
  }

  if (!product) {
    feedback.push("Das geplante Produkt oder Ergebnis ist noch nicht sichtbar. Formuliere, was am Ende konkret entsteht.");
  } else if (product.length < 30) {
    feedback.push("Das Produkt ist genannt, aber noch recht knapp. Präzisiere Form, Umfang und Bewertungsperspektive.");
  }

  if (!support) {
    feedback.push("Differenzierung oder Unterstützung fehlen noch. Überlege sprachliche Hilfen, Wahlaufgaben oder gestufte Zugänge.");
  }

  if (feedback.length === 0) {
    feedback.push("Die Projektidee ist bereits schlüssig angelegt. Prüfe als nächsten Schritt noch Zeitrahmen, Materialmenge und Leistungsnachweis.");
  }

  return feedback;
}

function updateSaveState() {
  const badge = document.getElementById("saveState");
  const state = loadState();

  if (isStorageLocked()) {
    badge.textContent = "Passwortgeschützt";
    return;
  }

  if (!state.updatedAt) {
    badge.textContent = "Noch nicht gespeichert";
    return;
  }

  const formatted = new Intl.DateTimeFormat("de-CH", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(state.updatedAt));

  badge.textContent = securityState.enabled ? `Geschützt gespeichert: ${formatted}` : `Lokal gespeichert: ${formatted}`;
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
  document.querySelector(".meta-grid")?.classList.toggle("is-hidden", Boolean(state.profileRowHidden));
  updateProfileRowButton(Boolean(state.profileRowHidden));
  document.getElementById("projectGuidePanel")?.classList.toggle("is-hidden", Boolean(state.projectGuideHidden));
  updateProjectGuideButton(Boolean(state.projectGuideHidden));
  document.getElementById("projectChecklistPanel")?.classList.toggle("is-hidden", Boolean(state.projectChecklistHidden));
  updateProjectChecklistButton(Boolean(state.projectChecklistHidden));
  document.getElementById("projectFeedbackPanel")?.classList.toggle("is-hidden", Boolean(state.projectFeedbackHidden));
  updateProjectFeedbackButton(Boolean(state.projectFeedbackHidden));
  document.querySelectorAll(PROJECT_CHECK_SELECTOR).forEach((checkbox) => {
    checkbox.checked = Boolean(state[`review_${checkbox.dataset.projectCheck}`]);
  });
  renderProjectFeedbackOutput(state);
  renderSecurityControls();
}

function renderProgress(progress) {
  const progressText = document.getElementById("progressText");
  const progressFill = document.getElementById("progressFill");

  if (isStorageLocked()) {
    progressText.textContent = "GitHub-Schritte sind passwortgeschützt";
    progressFill.style.width = "0%";
    return;
  }

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
  if (isStorageLocked()) {
    document.getElementById("currentStepLabel").textContent = "Gesperrt";
    document.getElementById("currentStepTitle").textContent = "Einträge sind passwortgeschützt";
    document.getElementById("unlockedCount").textContent = "geschützt";
    document.getElementById("streakLabel").textContent = "Entsperre oben im Arbeitsblatt";
    return;
  }

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

  if (isStorageLocked()) {
    preview.textContent = "Die gespeicherte URL ist passwortgeschützt.";
    return;
  }

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

  if (isStorageLocked()) {
    summaryBox.innerHTML = `
      <article class="summary-card">
        <strong>Passwortschutz aktiv</strong>
        <p>Entsperre oben im Arbeitsblatt die lokal gespeicherten Einträge, um die Zusammenfassung zu sehen.</p>
      </article>
    `;
    return;
  }

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
    ["Projektidee", state.field_projectTitle || "Noch kein Projekttitel"],
    ["Leitfrage", state.field_projectQuestion || "Noch keine Leitfrage"],
    ["Materialbasis", state.field_projectMaterials || "Noch keine Materialwahl"],
    ["Produkt / Umsetzung", state.field_projectProduct || "Noch keine Umsetzung notiert"],
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
  const protectedLock = isStorageLocked();

  getTaskCards().forEach((card) => {
    const step = getStepNumber(card);
    const isDone = Boolean(state[`task_${step}`]);
    const isCurrent = step === progress.currentStep && !isDone;
    const isLocked = step > progress.unlockedThrough && !isDone;
    const isUnavailable = isLocked || protectedLock;
    const statusChip = card.querySelector(`[data-step-status="${step}"]`);
    const lockedNote = card.querySelector(`[data-locked-note="${step}"]`);
    const nextButton = card.querySelector(`[data-action="jump-next"][data-step="${step}"]`);
    const checkbox = card.querySelector(TASK_SELECTOR);

    card.classList.toggle("done", isDone);
    card.classList.toggle("current", isCurrent);
    card.classList.toggle("locked", isUnavailable);

    if (checkbox) {
      checkbox.checked = isDone;
      checkbox.disabled = isUnavailable;
    }

    card.querySelectorAll("input, select, textarea, button").forEach((element) => {
      const isTaskCheckbox = element.matches(TASK_SELECTOR);
      const isActionButton = element.dataset.action === "jump-next" || element.dataset.action === "focus-image";

      if (isTaskCheckbox) {
        return;
      }

      if (isActionButton) {
        element.disabled = isUnavailable;
        return;
      }

      element.disabled = isUnavailable;
    });

    if (statusChip) {
      statusChip.className = "status-chip";

      if (isDone) {
        statusChip.classList.add("done");
        statusChip.textContent = "Geschafft";
      } else if (protectedLock) {
        statusChip.classList.add("locked");
        statusChip.textContent = "Passwortschutz";
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
      if (protectedLock) {
        lockedNote.hidden = false;
        lockedNote.textContent = "Diese Einträge sind passwortgeschützt. Entsperre sie oben im Arbeitsblatt.";
      } else if (isLocked) {
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
  renderSecurityControls();
  renderProgress(progress);
  renderJourneyMap(state, progress);
  renderMissionCockpit(progress);
  renderUrlPreview(state);
  renderSummary(state, progress);
  renderProjectFeedbackOutput(state);
  applyStepStates(state, progress);
  applyGlobalLockState();
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
  if (isStorageLocked()) {
    showToast("Entsperre zuerst die Einträge, um den Lernnachweis zu exportieren.");
    return;
  }

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
    `Projektidee: ${state.field_projectTitle || "-"}`,
    `Zielgruppe Projekt: ${state.field_projectAudience || "-"}`,
    `Leitfrage Projekt: ${state.field_projectQuestion || "-"}`,
    `Materialbasis Projekt: ${state.field_projectMaterials || "-"}`,
    `Lernziele Projekt: ${state.field_projectGoals || "-"}`,
    `Ablauf Projekt: ${state.field_projectFlow || "-"}`,
    `Produkt / Umsetzung: ${state.field_projectProduct || "-"}`,
    `Differenzierung / Unterstützung: ${state.field_projectSupport || "-"}`,
    `Projekt-Notizen: ${state.field_projectNotes || "-"}`,
    `Projektcheck Fokus: ${state.review_focus ? "ja" : "nein"}`,
    `Projektcheck Materialien: ${state.review_materials ? "ja" : "nein"}`,
    `Projektcheck Lernziele: ${state.review_goals ? "ja" : "nein"}`,
    `Projektcheck Ablauf: ${state.review_flow ? "ja" : "nein"}`,
    `Projektcheck Produkt: ${state.review_product ? "ja" : "nein"}`,
    `Projektcheck Unterstützung: ${state.review_support ? "ja" : "nein"}`,
    `Projektfeedback: ${(state.projectFeedbackItems || []).join(" | ") || "-"}`,
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

    if (isStorageLocked()) {
      event.preventDefault();
      showToast("Entsperre zuerst die passwortgeschützten Einträge.");
      return;
    }

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

  document.getElementById("setStoragePassword").addEventListener("click", () => {
    void enablePasswordProtection();
  });

  document.getElementById("unlockStorage").addEventListener("click", () => {
    void unlockProtectedStorage();
  });

  document.getElementById("lockStorage").addEventListener("click", lockProtectedStorage);
  document.getElementById("removeStoragePassword").addEventListener("click", () => {
    void removePasswordProtection();
  });

  document.getElementById("storagePassword").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    if (isStorageLocked()) {
      void unlockProtectedStorage();
      return;
    }

    if (!securityState.enabled) {
      void enablePasswordProtection();
    }
  });

  document.getElementById("toggleLabels").addEventListener("click", () => {
    const state = loadState();
    state.labelsHidden = !state.labelsHidden;
    saveState(state);
    document.body.classList.toggle("labels-hidden", Boolean(state.labelsHidden));
    updateLabelButton(Boolean(state.labelsHidden));
    renderUI();
  });

  document.getElementById("toggleProfileRow").addEventListener("click", () => {
    const state = loadState();
    state.profileRowHidden = !state.profileRowHidden;
    saveState(state);
    document.querySelector(".meta-grid")?.classList.toggle("is-hidden", Boolean(state.profileRowHidden));
    updateProfileRowButton(Boolean(state.profileRowHidden));
    renderUI();
  });

  document.getElementById("toggleProjectGuide").addEventListener("click", () => {
    const state = loadState();
    state.projectGuideHidden = !state.projectGuideHidden;
    saveState(state);
    document.getElementById("projectGuidePanel")?.classList.toggle("is-hidden", Boolean(state.projectGuideHidden));
    updateProjectGuideButton(Boolean(state.projectGuideHidden));
    renderUI();
  });

  document.getElementById("toggleProjectChecklist").addEventListener("click", () => {
    const state = loadState();
    state.projectChecklistHidden = !state.projectChecklistHidden;
    saveState(state);
    document.getElementById("projectChecklistPanel")?.classList.toggle("is-hidden", Boolean(state.projectChecklistHidden));
    updateProjectChecklistButton(Boolean(state.projectChecklistHidden));
    renderUI();
  });

  document.getElementById("toggleProjectFeedback").addEventListener("click", () => {
    const state = loadState();
    state.projectFeedbackHidden = !state.projectFeedbackHidden;
    saveState(state);
    document.getElementById("projectFeedbackPanel")?.classList.toggle("is-hidden", Boolean(state.projectFeedbackHidden));
    updateProjectFeedbackButton(Boolean(state.projectFeedbackHidden));
    renderUI();
  });

  document.querySelectorAll(PROJECT_CHECK_SELECTOR).forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      setStateValue(`review_${checkbox.dataset.projectCheck}`, checkbox.checked);
    });
  });

  document.getElementById("runProjectFeedback").addEventListener("click", () => {
    const state = loadState();
    state.projectFeedbackItems = generateProjectFeedback(state);
    saveState(state);
    renderUI();
    showToast("Projektfeedback aktualisiert.");
  });

  document.getElementById("clearProjectFeedback").addEventListener("click", () => {
    const state = loadState();
    state.projectFeedbackItems = [];
    saveState(state);
    renderUI();
    showToast("Projektfeedback geleert.");
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

async function init() {
  await initializeStorage();
  storageReady = true;
  hydrateInputs();
  injectStepEnhancements();
  bindEvents();
  renderUI();
}

void init();
