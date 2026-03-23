const STORAGE_KEY = "github-lerneinheit-v3";
const STORAGE_VERSION = 2;
const TASK_SELECTOR = "input[data-task]";
const FIELD_SELECTOR = "[data-field]";
const PROJECT_CHECK_SELECTOR = "input[data-project-check]";
const APP_ID = "github-lerneinheit";
const CURRENT_MODE = "gamifiziert";
const PROJECT_FIELD_KEYS = [
  "projectTitle",
  "projectAudience",
  "projectQuestion",
  "projectMaterials",
  "projectGoals",
  "projectFlow",
  "projectProduct",
  "projectSupport",
  "projectNotes"
];

const QUIZ_CONFIG = {
  2: {
    question: "Welcher Eintrag muss für dein Konto eindeutig sein?",
    options: ["Passwort", "Username", "Klassenname"],
    correct: "Username",
    success: "Genau. Der Username muss einzigartig sein.",
    failure: "Nicht ganz. GitHub braucht hier eine eindeutige Kennung."
  },
  5: {
    question: "Welche Sichtbarkeit brauchst du meist für GitHub Pages im Unterricht?",
    options: ["Public", "Private", "Archived"],
    correct: "Public",
    success: "Richtig. Für einfache Pages-Beispiele ist Public meist nötig.",
    failure: "Prüfe noch einmal, ob die Seite öffentlich erreichbar sein soll."
  },
  8: {
    question: "Welche Datei ist für eine einfache Website fast immer unverzichtbar?",
    options: ["index.html", "notes.txt", "draft.docx"],
    correct: "index.html",
    success: "Ja. Ohne index.html startet die Website meist nicht korrekt.",
    failure: "Tipp: Der Browser braucht eine Startseite."
  },
  11: {
    question: "Welche Bereitstellungsart wählt man hier im gezeigten Ablauf?",
    options: ["Deploy from a branch", "GitHub Actions only", "No deployment"],
    correct: "Deploy from a branch",
    success: "Richtig. Genau diese Option wird im Screenshot gezeigt.",
    failure: "Vergleiche die Markierung im Screenshot noch einmal."
  }
};

const BADGE_CONFIG = [
  {
    id: "startklar",
    icon: "S1",
    title: "Startklar",
    description: "Der Einstieg in GitHub ist geschafft.",
    earned: (state) => Boolean(state.task_1)
  },
  {
    id: "konto-profi",
    icon: "KP",
    title: "Konto-Profi",
    description: "Konto erstellt und erster Check erfolgreich gelöst.",
    earned: (state) => Boolean(state.task_2 && state.quiz_2_passed)
  },
  {
    id: "repo-architekt",
    icon: "RA",
    title: "Repo-Architekt",
    description: "Repository geplant, benannt und gebaut.",
    earned: (state) => [4, 5, 6].every((step) => state[`task_${step}`]) && Boolean(state.quiz_5_passed)
  },
  {
    id: "upload-navigator",
    icon: "UN",
    title: "Upload-Navigator",
    description: "Dateien sicher hochgeladen und richtig eingeordnet.",
    earned: (state) => [7, 8, 9].every((step) => state[`task_${step}`]) && Boolean(state.quiz_8_passed)
  },
  {
    id: "pages-champion",
    icon: "PC",
    title: "Pages-Champion",
    description: "GitHub Pages aktiviert und URL sauber dokumentiert.",
    earned: (state) =>
      [10, 11, 12].every((step) => state[`task_${step}`]) &&
      Boolean(state.quiz_11_passed) &&
      Boolean(state.field_finalUrl || state.projectUrl)
  }
];

const LEVELS = [
  { number: 1, title: "Explorer", minXp: 0 },
  { number: 2, title: "Navigator", minXp: 250 },
  { number: 3, title: "Builder", minXp: 600 },
  { number: 4, title: "Publisher", minXp: 1000 },
  { number: 5, title: "Guide", minXp: 1450 }
];

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

function wordCount(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function getCheckedProjectReviewCount(state) {
  return ["focus", "materials", "goals", "flow", "product", "support"].filter((key) => state[`review_${key}`]).length;
}

function getProjectFieldValue(state, fieldKey) {
  return String(state[`field_${fieldKey}`] || "").trim();
}

function getProjectFieldStatus(state, fieldKey) {
  const value = getProjectFieldValue(state, fieldKey);
  const words = wordCount(value);

  switch (fieldKey) {
    case "projectTitle":
      if (!value) {
        return {
          status: "missing",
          done: false,
          label: "Titel fehlt",
          message: "Ein klarer Arbeitstitel hilft, das Projekt als Einheit erkennbar zu machen."
        };
      }
      if (words < 3) {
        return {
          status: "weak",
          done: false,
          label: "Titel noch knapp",
          message: "Schärfe den Titel noch etwas, damit Thema und Fokus deutlicher werden."
        };
      }
      return {
        status: "strong",
        done: true,
        label: "Titel trägt",
        message: "Der Arbeitstitel gibt deinem Projekt bereits ein klares Profil."
      };
    case "projectAudience":
      if (!value) {
        return {
          status: "missing",
          done: false,
          label: "Zielgruppe offen",
          message: "Lege fest, für welche Klasse oder Stufe die Einheit gedacht ist."
        };
      }
      if (!/klasse|sek|stufe|fm|niveau|lernend/i.test(value)) {
        return {
          status: "weak",
          done: false,
          label: "Zielgruppe präzisieren",
          message: "Ergänze Stufe, Klasse oder Lernniveau, damit die Aufgaben passgenau werden."
        };
      }
      return {
        status: "strong",
        done: true,
        label: "Zielgruppe klar",
        message: "Die Lerngruppe ist konkret genug benannt."
      };
    case "projectQuestion":
      if (!value) {
        return {
          status: "missing",
          done: false,
          label: "Leitfrage fehlt",
          message: "Ohne Leitfrage bleibt der Projektfokus noch zu offen."
        };
      }
      if (words < 8 || !/[?]/.test(value)) {
        return {
          status: "weak",
          done: false,
          label: "Leitfrage schärfen",
          message: "Formuliere eine echte Frage, die ein literarisches oder didaktisches Problem sichtbar macht."
        };
      }
      return {
        status: "strong",
        done: true,
        label: "Leitfrage trägt",
        message: "Die Leitfrage setzt bereits eine klare Richtung für die Einheit."
      };
    case "projectMaterials":
      if (!value) {
        return {
          status: "missing",
          done: false,
          label: "Materialien fehlen",
          message: "Entscheide, ob du mit Text, Hörbuch, Film oder einer Kombination arbeitest."
        };
      }
      if (!/text|hörbuch|film|verfilmung/i.test(value)) {
        return {
          status: "weak",
          done: false,
          label: "Materialwahl konkretisieren",
          message: "Benenne die Materialien so, dass die Grundlage der Einheit sichtbar wird."
        };
      }
      return {
        status: "strong",
        done: true,
        label: "Materialbasis klar",
        message: "Die Materialwahl ist als Arbeitsgrundlage bereits gut erkennbar."
      };
    case "projectGoals":
      if (!value) {
        return {
          status: "missing",
          done: false,
          label: "Lernziele fehlen",
          message: "Formuliere, was Lernende am Ende erkennen, deuten oder gestalten sollen."
        };
      }
      if (words < 10 || !/analys|deut|vergleich|reflex|gestalt|schreib|argument/i.test(value)) {
        return {
          status: "weak",
          done: false,
          label: "Lernziele schärfen",
          message: "Nutze beobachtbare Tätigkeitswörter wie deuten, analysieren oder vergleichen."
        };
      }
      return {
        status: "strong",
        done: true,
        label: "Lernziele tragfähig",
        message: "Die Lernziele sind fachlich und operativ schon gut angelegt."
      };
    case "projectFlow":
      if (!value) {
        return {
          status: "missing",
          done: false,
          label: "Ablauf fehlt",
          message: "Skizziere wenigstens die wichtigsten Phasen deiner Einheit."
        };
      }
      if (words < 12 || !/einstieg|erarbeitung|sicherung|transfer|vertiefung/i.test(value)) {
        return {
          status: "weak",
          done: false,
          label: "Ablauf strukturieren",
          message: "Gliedere die Einheit in erkennbare Phasen wie Einstieg, Erarbeitung und Sicherung."
        };
      }
      return {
        status: "strong",
        done: true,
        label: "Ablauf stimmig",
        message: "Die Phasenstruktur ist nachvollziehbar geplant."
      };
    case "projectProduct":
      if (!value) {
        return {
          status: "missing",
          done: false,
          label: "Produkt fehlt",
          message: "Benutze ein klares Endprodukt oder eine sichtbare Ergebnisform."
        };
      }
      if (words < 6) {
        return {
          status: "weak",
          done: false,
          label: "Produkt präzisieren",
          message: "Form, Umfang und Bewertungsperspektive des Produkts sind noch zu knapp."
        };
      }
      return {
        status: "strong",
        done: true,
        label: "Produkt sichtbar",
        message: "Das Endprodukt gibt der Einheit bereits ein klares Ziel."
      };
    case "projectSupport":
      if (!value) {
        return {
          status: "missing",
          done: false,
          label: "Unterstützung fehlt",
          message: "Überlege Hilfen, Wahlwege oder sprachliche Stützen für unterschiedliche Lernniveaus."
        };
      }
      if (!/hilfe|wahl|differenz|stütz|satz|impuls|niveau/i.test(value)) {
        return {
          status: "weak",
          done: false,
          label: "Differenzierung konkretisieren",
          message: "Benenne sichtbar, welche Hilfen oder Wahlpfade du für Lernende anbietest."
        };
      }
      return {
        status: "strong",
        done: true,
        label: "Unterstützung mitgedacht",
        message: "Hilfen und Differenzierung sind als Teil der Einheit erkennbar."
      };
    case "projectNotes":
      if (!value) {
        return {
          status: "optional",
          done: true,
          label: "Notizen optional",
          message: "Hier kannst du lose Ideen, Alternativen oder offene Fragen sammeln."
        };
      }
      if (words < 10) {
        return {
          status: "weak",
          done: true,
          label: "Notizen ausbaufähig",
          message: "Halte hier ruhig auch Varianten, Risiken oder nächste Schritte fest."
        };
      }
      return {
        status: "strong",
        done: true,
        label: "Notizen hilfreich",
        message: "Die Notizen zeigen bereits Denkwege und Entscheidungen im Prozess."
      };
    default:
      return {
        status: "optional",
        done: true,
        label: "",
        message: ""
      };
  }
}

function getProjectCompletionState(state, gameState = computeGameState(state)) {
  const fieldStatuses = PROJECT_FIELD_KEYS.map((fieldKey) => ({
    key: fieldKey,
    ...getProjectFieldStatus(state, fieldKey)
  }));
  const incompleteFields = fieldStatuses.filter((field) => !field.done);
  const checkedReviewCount = getCheckedProjectReviewCount(state);
  const uncheckedChecks = ["focus", "materials", "goals", "flow", "product", "support"].filter(
    (key) => !state[`review_${key}`]
  );
  const feedbackReady = Boolean(normalizeFeedbackReport(state.projectFeedbackItems));
  const allGitHubTasksDone = gameState.completed === gameState.total;
  const everythingDone = allGitHubTasksDone && incompleteFields.length === 0 && uncheckedChecks.length === 0 && feedbackReady;
  const openItems = [];

  if (!allGitHubTasksDone) {
    openItems.push(`GitHub-Lernstrecke abschliessen (${gameState.completed} von ${gameState.total} Schritten erledigt).`);
  }

  incompleteFields.forEach((field) => {
    openItems.push(field.message);
  });

  uncheckedChecks.forEach((key) => {
    const labels = {
      focus: "Prüfe, ob der Fokus der Einheit klar erkennbar ist.",
      materials: "Prüfe, ob die Materialwahl zur Leitfrage passt.",
      goals: "Prüfe, ob die Lernziele konkret genug formuliert sind.",
      flow: "Prüfe, ob der Ablauf realistisch und nachvollziehbar geplant ist.",
      product: "Prüfe, ob Produkt und Ergebnis sichtbar sind.",
      support: "Prüfe, ob Unterstützung und Differenzierung mitgedacht sind."
    };
    openItems.push(labels[key]);
  });

  if (!feedbackReady) {
    openItems.push("Starte das Feedbacktool mindestens einmal, damit der Projektcheck dokumentiert ist.");
  }

  return {
    fieldStatuses,
    incompleteFields,
    checkedReviewCount,
    uncheckedChecks,
    feedbackReady,
    allGitHubTasksDone,
    everythingDone,
    openItems
  };
}

function sanitizeFilePart(value, fallback) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function createTeamsSubmissionText(state, gameState, projectState) {
  const feedbackReport = normalizeFeedbackReport(state.projectFeedbackItems);

  return [
    "Teams-Abgabe: Prompten, GitHub und Bahnwärter Thiel",
    "",
    `Name: ${state.studentName || "-"}`,
    `Klasse: ${state.studentClass || "-"}`,
    `Abgabe vorbereitet am: ${new Intl.DateTimeFormat("de-CH", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(new Date())}`,
    "",
    "Abschlussstatus",
    `GitHub-Schritte: ${gameState.completed}/${gameState.total}`,
    `Projektcheck: ${projectState.checkedReviewCount}/6`,
    `Feedbacktool: ${projectState.feedbackReady ? "durchgeführt" : "nicht durchgeführt"}`,
    `XP / Level: ${gameState.xp} XP / Level ${gameState.level.number} ${gameState.level.title}`,
    `Badges: ${gameState.badges.length}/${BADGE_CONFIG.length}`,
    "",
    "Projektstudio",
    `Titel: ${state.field_projectTitle || "-"}`,
    `Zielgruppe: ${state.field_projectAudience || "-"}`,
    `Leitfrage: ${state.field_projectQuestion || "-"}`,
    `Materialien: ${state.field_projectMaterials || "-"}`,
    `Lernziele: ${state.field_projectGoals || "-"}`,
    `Ablauf: ${state.field_projectFlow || "-"}`,
    `Produkt / Umsetzung: ${state.field_projectProduct || "-"}`,
    `Differenzierung / Unterstützung: ${state.field_projectSupport || "-"}`,
    `Offene Notizen: ${state.field_projectNotes || "-"}`,
    "",
    "Digitale Umsetzung",
    `Projekt-URL: ${state.field_finalUrl || state.projectUrl || "-"}`,
    `Repository: ${state.field_repoName || "-"}`,
    `GitHub-Username: ${state.field_username || "-"}`,
    "",
    "Projektfeedback",
    `Kurzfazit: ${feedbackReport?.summary || "-"}`,
    `Stärken: ${feedbackReport?.strengths?.join(" | ") || "-"}`,
    `Schärfungen: ${feedbackReport?.priorities?.join(" | ") || "-"}`,
    `Nächster Schritt: ${feedbackReport?.nextStep || "-"}`,
    "",
    "Hinweis",
    "Diese Datei kann als Begleitdokument in der Teams-Hausaufgabe hochgeladen werden."
  ].join("\n");
}

function injectProjectFieldFeedbackSlots() {
  PROJECT_FIELD_KEYS.forEach((fieldKey) => {
    const input = document.querySelector(`[data-field="${fieldKey}"]`);
    const field = input?.closest(".field");

    if (!field || field.querySelector(`[data-field-feedback="${fieldKey}"]`)) {
      return;
    }

    const feedback = document.createElement("p");
    feedback.className = "field-feedback";
    feedback.dataset.fieldFeedback = fieldKey;
    field.append(feedback);
  });
}

function renderProjectFieldFeedback(state) {
  PROJECT_FIELD_KEYS.forEach((fieldKey) => {
    const feedback = document.querySelector(`[data-field-feedback="${fieldKey}"]`);
    const field = document.querySelector(`[data-field="${fieldKey}"]`)?.closest(".field");

    if (!feedback || !field) {
      return;
    }

    const result = getProjectFieldStatus(state, fieldKey);
    field.classList.remove("field-missing", "field-weak", "field-strong", "field-optional");
    field.classList.add(`field-${result.status}`);
    feedback.className = `field-feedback is-${result.status}`;
    feedback.innerHTML = `
      <strong>${escapeHtml(result.label)}</strong>
      <span>${escapeHtml(result.message)}</span>
    `;
  });
}

function renderProjectAlert(state, gameState) {
  const alertBox = document.getElementById("projectAlertBox");

  if (!alertBox) {
    return;
  }

  if (isStorageLocked()) {
    alertBox.className = "project-alert is-locked";
    alertBox.innerHTML = "<strong>Passwortschutz aktiv.</strong><p>Entsperre zuerst die Einträge, um den Projektcheck zu sehen.</p>";
    return;
  }

  const projectState = getProjectCompletionState(state, gameState);

  if (projectState.everythingDone) {
    alertBox.className = "project-alert is-success";
    alertBox.innerHTML = `
      <strong>Projektcheck vollständig.</strong>
      <p>Alle Aufträge sind erledigt. Die Übersicht ist bereit und die Teams-Abgabe kann jetzt exportiert werden.</p>
    `;
    return;
  }

  const openItems = projectState.openItems.slice(0, 5);
  alertBox.className = "project-alert is-warning";
  alertBox.innerHTML = `
    <strong>Projektcheck noch nicht vollständig.</strong>
    <p>Es fehlen noch ${projectState.openItems.length} Punkte, bevor das Projekt als abgeschlossen gilt.</p>
    <ul class="alert-list">
      ${openItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ul>
  `;
}

function renderProjectOverview(state, gameState) {
  const box = document.getElementById("projectOverviewBox");
  const teamsButton = document.getElementById("prepareTeamsSubmission");

  if (!box || !teamsButton) {
    return;
  }

  if (isStorageLocked()) {
    box.innerHTML = `
      <article class="project-overview-card">
        <strong>Passwortschutz aktiv</strong>
        <p>Entsperre zuerst die Einträge, um die Abschlussübersicht zu sehen.</p>
      </article>
    `;
    teamsButton.disabled = true;
    return;
  }

  const projectState = getProjectCompletionState(state, gameState);
  teamsButton.disabled = !projectState.everythingDone;

  box.innerHTML = `
    <article class="project-overview-card ${projectState.everythingDone ? "is-complete" : ""}">
      <strong>Gesamtstatus</strong>
      <p>${projectState.everythingDone ? "Alle Aufträge erledigt" : "Noch nicht vollständig"}</p>
    </article>
    <article class="project-overview-card">
      <strong>GitHub-Aufträge</strong>
      <p>${gameState.completed} von ${gameState.total} Schritten abgeschlossen</p>
    </article>
    <article class="project-overview-card">
      <strong>Projektstudio</strong>
      <p>${projectState.fieldStatuses.filter((item) => item.done).length} von ${projectState.fieldStatuses.length} Feldern tragfähig oder optional</p>
    </article>
    <article class="project-overview-card">
      <strong>Projektcheck</strong>
      <p>${projectState.checkedReviewCount} von 6 Checklistenpunkten markiert</p>
    </article>
    <article class="project-overview-card">
      <strong>Feedbacktool</strong>
      <p>${projectState.feedbackReady ? "bereits ausgeführt" : "noch nicht gestartet"}</p>
    </article>
    <article class="project-overview-card">
      <strong>Teams-Abgabe</strong>
      <p>${state.teamsSubmissionPreparedAt ? `exportiert am ${new Intl.DateTimeFormat("de-CH", {
        dateStyle: "short",
        timeStyle: "short"
      }).format(new Date(state.teamsSubmissionPreparedAt))}` : "noch nicht exportiert"}</p>
    </article>
  `;
}

function maybeUpdateTeamsSubmissionState(previousState, nextState) {
  const previousStatus = getProjectCompletionState(previousState, computeGameState(previousState));
  const nextGameState = computeGameState(nextState);
  const nextStatus = getProjectCompletionState(nextState, nextGameState);

  if (previousStatus.everythingDone && !nextStatus.everythingDone && nextState.teamsSubmissionPreparedAt) {
    delete nextState.teamsSubmissionPreparedAt;
    saveState(nextState);
    renderUI();
    return;
  }

  if (!previousStatus.everythingDone && nextStatus.everythingDone && !nextState.teamsSubmissionPreparedAt) {
    nextState.teamsSubmissionPreparedAt = new Date().toISOString();
    saveState(nextState);
    renderUI();
    showToast("Alle Aufträge erledigt. Die Teams-Abgabe ist jetzt bereit.");
  }
}

function hasMeaningfulState(state = {}) {
  return Object.entries(state || {}).some(([key, value]) => {
    if (key === "updatedAt") {
      return false;
    }

    if (value === null || value === undefined || value === false || value === "") {
      return false;
    }

    if (Array.isArray(value)) {
      return value.length > 0;
    }

    if (typeof value === "object") {
      return Object.keys(value).length > 0;
    }

    return true;
  });
}

function createPortableExportPayload() {
  return {
    app: APP_ID,
    mode: CURRENT_MODE,
    exportedAt: new Date().toISOString(),
    state: cloneState(loadState())
  };
}

function exportStateSnapshot() {
  if (isStorageLocked()) {
    showToast("Entsperre zuerst die Einträge, um den Stand zu exportieren.");
    return;
  }

  const payload = createPortableExportPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const baseName = (loadState().studentName || "projektstand").trim().replace(/\s+/g, "-").toLowerCase();

  link.href = url;
  link.download = `${baseName || "projektstand"}-lernstand.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function importStateSnapshot(payload) {
  if (payload?.app && payload.app !== APP_ID) {
    throw new Error("foreign app");
  }

  if (payload?.storageVersion && /^(plain|encrypted)$/i.test(String(payload.mode || ""))) {
    throw new Error("storage envelope");
  }

  const importedState = payload?.state && typeof payload.state === "object" ? payload.state : payload;

  if (!importedState || typeof importedState !== "object" || Array.isArray(importedState)) {
    throw new Error("invalid payload");
  }

  if (importedState?.encrypted && /^(plain|encrypted)$/i.test(String(importedState.mode || ""))) {
    throw new Error("encrypted payload");
  }

  currentState = cloneState(importedState);
  saveState(currentState);
  hydrateInputs();
  renderUI();

  return {
    importedMode: typeof payload?.mode === "string" ? payload.mode : null
  };
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
    "exportState",
    "importState",
    "toggleProfileRow",
    "toggleProjectGuide",
    "toggleProjectChecklist",
    "toggleProjectFeedback",
    "toggleLabels",
    "exportSummary",
    "jumpCurrent",
    "focusCurrent",
    "prepareTeamsSubmission",
    "printProjectOverview",
    "exportSubmissionPdf",
    "exportCertificate",
    "printCertificate",
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

function getLevelInfo(xp) {
  let current = LEVELS[0];

  LEVELS.forEach((level) => {
    if (xp >= level.minXp) {
      current = level;
    }
  });

  const nextLevel = LEVELS.find((level) => level.minXp > xp) || null;

  return {
    ...current,
    nextLevel
  };
}

function getEarnedBadges(state) {
  return BADGE_CONFIG.filter((badge) => badge.earned(state));
}

function computeGameState(state = loadState()) {
  const progress = getProgressInfo(state);
  const quizzesPassed = Object.keys(QUIZ_CONFIG).filter((step) => state[`quiz_${step}_passed`]).length;
  const profileBonus = state.studentName && state.studentClass ? 50 : 0;
  const urlBonus = state.field_finalUrl || state.projectUrl ? 100 : 0;
  const completionBonus = progress.completed === progress.total ? 250 : 0;
  const xp = progress.completed * 100 + quizzesPassed * 50 + profileBonus + urlBonus + completionBonus;
  const level = getLevelInfo(xp);
  const badges = getEarnedBadges(state);

  return {
    ...progress,
    quizzesPassed,
    xp,
    level,
    badges
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
  }, 2600);
}

function createConfettiBurst() {
  const layer = document.getElementById("confettiLayer");
  if (!layer) {
    return;
  }

  const colors = ["#d66a1f", "#f4b942", "#0d7a73", "#2d6cdf", "#2e8b57"];

  for (let index = 0; index < 28; index += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[index % colors.length];
    piece.style.animationDelay = `${Math.random() * 160}ms`;
    piece.style.transform = `translateY(0) rotate(${Math.random() * 240}deg)`;
    layer.append(piece);

    window.setTimeout(() => {
      piece.remove();
    }, 1500);
  }
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

  const feedbackReport = normalizeFeedbackReport(state.projectFeedbackItems);

  if (!feedbackReport) {
    output.innerHTML = "<p>Noch kein Feedback erzeugt.</p>";
    return;
  }

  output.innerHTML = `
    <p class="feedback-summary">${escapeHtml(feedbackReport.summary)}</p>
    ${
      feedbackReport.strengths.length
        ? `
          <section class="feedback-section">
            <h4>Schon tragfähig</h4>
            <ul class="feedback-list">
              ${feedbackReport.strengths.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ul>
          </section>
        `
        : ""
    }
    ${
      feedbackReport.priorities.length
        ? `
          <section class="feedback-section">
            <h4>Nächste Schärfungen</h4>
            <ol class="feedback-list">
              ${feedbackReport.priorities.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
            </ol>
          </section>
        `
        : ""
    }
    ${
      feedbackReport.nextStep
        ? `
          <section class="feedback-section">
            <h4>Sinnvoller nächster Schritt</h4>
            <p>${escapeHtml(feedbackReport.nextStep)}</p>
          </section>
        `
        : ""
    }
  `;
}

function normalizeFeedbackReport(value) {
  if (Array.isArray(value)) {
    return value.length
      ? {
          summary: "Der Projektcheck hat offene Punkte sichtbar gemacht.",
          strengths: [],
          priorities: value,
          nextStep: "Überarbeite zuerst die Punkte, die Leitfrage, Ablauf und Produkt am stärksten schärfen."
        }
      : null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const strengths = Array.isArray(value.strengths) ? value.strengths : [];
  const priorities = Array.isArray(value.priorities) ? value.priorities : [];

  if (!value.summary && strengths.length === 0 && priorities.length === 0 && !value.nextStep) {
    return null;
  }

  return {
    summary: value.summary || "Der Projektcheck wurde aktualisiert.",
    strengths,
    priorities,
    nextStep: value.nextStep || ""
  };
}

function generateProjectFeedback(state) {
  const strengths = [];
  const priorities = [];
  const title = (state.field_projectTitle || "").trim();
  const audience = (state.field_projectAudience || "").trim();
  const question = (state.field_projectQuestion || "").trim();
  const materials = (state.field_projectMaterials || "").trim();
  const goals = (state.field_projectGoals || "").trim();
  const flow = (state.field_projectFlow || "").trim();
  const product = (state.field_projectProduct || "").trim();
  const support = (state.field_projectSupport || "").trim();
  const notes = (state.field_projectNotes || "").trim();
  const reviewCount = getCheckedProjectReviewCount(state);
  const questionWords = wordCount(question);
  const goalsWords = wordCount(goals);
  const flowWords = wordCount(flow);
  const productWords = wordCount(product);

  if (!title) {
    priorities.push("Gib dem Projekt einen klaren Arbeitstitel, damit die Einheit ein erkennbares Profil bekommt.");
  } else {
    strengths.push(`Der Titel „${title}“ gibt dem Projekt bereits einen erkennbaren Rahmen.`);
  }

  if (!audience) {
    priorities.push("Die Zielgruppe oder Klasse fehlt noch. Das erschwert die passende Schwierigkeitsstufe und Materialwahl.");
  } else {
    strengths.push(`Die Zielgruppe ist benannt (${audience}), dadurch lässt sich die Einheit gezielter zuschneiden.`);
  }

  if (questionWords < 8) {
    priorities.push("Die Leitfrage wirkt noch zu kurz oder zu allgemein. Formuliere sie so, dass ein echtes literarisches oder didaktisches Problem sichtbar wird.");
  } else if (!/[?]/.test(question)) {
    priorities.push("Die Leitfrage ist inhaltlich angelegt, aber noch nicht als echte Frage formuliert. Eine präzise Frage schärft Fokus und Aufgabenbau.");
  } else {
    strengths.push("Die Leitfrage gibt bereits eine erkennbare Richtung für die Projektentwicklung vor.");
  }

  if (!materials) {
    priorities.push("Die Materialbasis ist noch offen. Entscheide bewusst, ob Text, Hörbuch, Film oder eine Kombination zentral ist.");
  } else if (!/text|hörbuch|film|verfilmung/i.test(materials)) {
    priorities.push("Benenne die Materialien konkreter, damit sichtbar wird, worauf sich die Einheit tatsächlich stützt.");
  } else if (!/vergleich|kombination|kontrast|gegenüber|ergänz/i.test(materials) && /text|hörbuch|film|verfilmung/i.test(materials)) {
    priorities.push("Die Materialien sind benannt. Begründe noch genauer, warum genau diese Auswahl für deine Leitfrage didaktisch sinnvoll ist.");
  } else {
    strengths.push("Die Materialwahl ist konkret genug, um daraus tragfähige Arbeitsaufträge zu entwickeln.");
  }

  if (goalsWords < 10) {
    priorities.push("Die Lernziele sollten noch präziser werden: Was sollen Lernende am Ende erkennen, deuten, vergleichen oder gestalten?");
  } else if (!/analys|deut|vergleich|reflex|gestalt|schreib|argument/i.test(goals)) {
    priorities.push("Die Lernziele sind schon vorhanden, aber ihre fachliche Operation bleibt noch unscharf. Nutze Tätigkeitswörter wie deuten, analysieren, vergleichen oder gestalten.");
  } else {
    strengths.push("Die Lernziele haben bereits Substanz und zeigen fachliche Arbeitsschritte.");
  }

  if (flowWords < 12) {
    priorities.push("Der Ablauf ist noch zu knapp. Eine gute Projektentwicklung braucht erkennbare Phasen, damit Zeit, Material und Sozialform realistisch bleiben.");
  } else if (!/einstieg|erarbeitung|sicherung|transfer|vertiefung/i.test(flow)) {
    priorities.push("Die Ablaufskizze könnte klarer in Phasen gegliedert sein, zum Beispiel Einstieg, Erarbeitung, Sicherung und Transfer.");
  } else {
    strengths.push("Der Ablauf ist bereits in erkennbaren Phasen angelegt.");
  }

  if (!product) {
    priorities.push("Das geplante Produkt oder Ergebnis ist noch nicht sichtbar. Formuliere, was am Ende konkret entsteht.");
  } else if (productWords < 6) {
    priorities.push("Das Produkt ist genannt, aber noch recht knapp. Präzisiere Form, Umfang und Bewertungsperspektive.");
  } else {
    strengths.push("Das Endprodukt ist sichtbar und gibt der Einheit ein klares Ziel.");
  }

  if (!support) {
    priorities.push("Differenzierung oder Unterstützung fehlen noch. Überlege sprachliche Hilfen, Wahlaufgaben oder gestufte Zugänge.");
  } else if (!/hilfe|wahl|differenz|stütz|satz|impuls|niveau/i.test(support)) {
    priorities.push("Unterstützung ist angedeutet, aber noch nicht konkret genug. Benenne klar, welche Hilfen, Wahlpfade oder sprachlichen Stützen du gibst.");
  } else {
    strengths.push("Unterstützung und Differenzierung sind bereits mitgedacht.");
  }

  if (reviewCount < 3) {
    priorities.push("In der Abschluss-Checkliste sind bisher nur wenige Punkte markiert. Nutze sie, um blinde Flecken vor der Umsetzung sichtbar zu machen.");
  } else if (reviewCount === 6) {
    strengths.push("Die Abschluss-Checkliste ist vollständig bearbeitet und zeigt bereits Reflexionstiefe.");
  }

  if (notes && wordCount(notes) > 20) {
    strengths.push("Die offenen Notizen zeigen, dass bereits aktiv an Varianten und Entscheidungen gearbeitet wurde.");
  }

  const summary =
    priorities.length === 0
      ? "Die Projektidee ist bereits schlüssig und umsetzungsnah angelegt."
      : priorities.length <= 3
        ? "Die Projektidee ist gut erkennbar, braucht aber noch einige gezielte Schärfungen."
        : "Die Projektidee hat Potenzial, sollte aber vor der Umsetzung noch deutlich präzisiert werden.";

  const nextStep =
    priorities[0] ||
    "Prüfe als Nächstes noch einmal Zeitrahmen, Materialmenge und Leistungsnachweis im Zusammenspiel.";

  return {
    summary,
    strengths,
    priorities,
    nextStep
  };
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

function renderProgress(gameState) {
  const progressText = document.getElementById("progressText");
  const progressFill = document.getElementById("progressFill");

  if (isStorageLocked()) {
    progressText.textContent = "GitHub-Schritte sind passwortgeschützt";
    progressFill.style.width = "0%";
    return;
  }

  const ratio = gameState.total ? (gameState.completed / gameState.total) * 100 : 0;

  progressText.textContent = `${gameState.completed} / ${gameState.total} GitHub-Schritte erledigt`;
  progressFill.style.width = `${ratio}%`;
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

function renderSummary(state, gameState) {
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
    ["Projektcheck", `${["focus", "materials", "goals", "flow", "product", "support"].filter((key) => state[`review_${key}`]).length} von 6 Punkten markiert`],
    ["Punkte und Level", `${gameState.xp} XP · Level ${gameState.level.number} ${gameState.level.title}`],
    ["Badges", `${gameState.badges.length} von ${BADGE_CONFIG.length} freigeschaltet`],
    ["Fortschritt", `${gameState.completed} von ${gameState.total} Schritten erledigt`],
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

function renderJourneyMap(state, gameState) {
  const map = document.getElementById("journeyMap");

  map.innerHTML = getTaskCards()
    .map((card, index) => {
      const step = index + 1;
      const title = card.querySelector("h3")?.textContent || `Schritt ${step}`;
      const isDone = Boolean(state[`task_${step}`]);
      const isCurrent = step === gameState.currentStep && !isDone;
      const isLocked = step > gameState.unlockedThrough && !isDone;

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

function renderMissionCockpit(gameState) {
  if (isStorageLocked()) {
    document.getElementById("currentStepLabel").textContent = "Gesperrt";
    document.getElementById("currentStepTitle").textContent = "Einträge sind passwortgeschützt";
    document.getElementById("unlockedCount").textContent = "geschützt";
    document.getElementById("xpLabel").textContent = "geschützt";
    document.getElementById("levelLabel").textContent = "geschützt";
    document.getElementById("streakLabel").textContent = "Entsperre oben im Arbeitsblatt";
    document.getElementById("badgeCount").textContent = "geschützt";
    return;
  }

  const currentCard = document.getElementById(`step-${gameState.currentStep}`);
  const title = currentCard?.querySelector("h3")?.textContent || "Lernstrecke abgeschlossen";
  const currentLabel = gameState.completed === gameState.total ? "Abschluss" : `Schritt ${gameState.currentStep}`;

  document.getElementById("currentStepLabel").textContent = currentLabel;
  document.getElementById("currentStepTitle").textContent = title;
  document.getElementById("unlockedCount").textContent = `${gameState.unlockedThrough} von ${gameState.total}`;
  document.getElementById("xpLabel").textContent = `${gameState.xp} XP`;
  document.getElementById("levelLabel").textContent = `Level ${gameState.level.number} · ${gameState.level.title}`;
  document.getElementById("badgeCount").textContent = `${gameState.badges.length} von ${BADGE_CONFIG.length}`;

  if (gameState.completed === gameState.total) {
    document.getElementById("streakLabel").textContent = "Alle Checkpoints geschafft";
    return;
  }

  const nextCheckpoint = Math.min(Math.ceil((gameState.completed + 1) / 3) * 3, gameState.total);
  const remaining = nextCheckpoint - gameState.completed;
  const checkpointText =
    remaining <= 1 ? "Noch 1 Schritt bis zum nächsten Checkpoint" : `Noch ${remaining} Schritte bis zum nächsten Checkpoint`;

  document.getElementById("streakLabel").textContent = checkpointText;
}

function renderBadgeBoard(state) {
  const badgeBoard = document.getElementById("badgeBoard");

  if (isStorageLocked()) {
    badgeBoard.innerHTML = `
      <article class="badge-card locked">
        <div class="badge-medal">?</div>
        <strong>Passwortschutz aktiv</strong>
        <p>Entsperre die Einträge, um Badges und Meilensteine zu sehen.</p>
      </article>
    `;
    return;
  }

  const earnedIds = new Set(getEarnedBadges(state).map((badge) => badge.id));

  badgeBoard.innerHTML = BADGE_CONFIG
    .map((badge) => {
      const unlocked = earnedIds.has(badge.id);

      return `
        <article class="badge-card ${unlocked ? "unlocked" : "locked"}">
          <div class="badge-medal">${escapeHtml(badge.icon)}</div>
          <strong>${escapeHtml(badge.title)}</strong>
          <p>${escapeHtml(badge.description)}</p>
        </article>
      `;
    })
    .join("");
}

function renderCertificate(state, gameState) {
  if (isStorageLocked()) {
    document.getElementById("certificateName").textContent = "Passwortschutz aktiv";
    document.getElementById("certificateBody").textContent =
      "Entsperre die lokal gespeicherten Einträge, um das Zertifikat wieder anzuzeigen.";
    document.getElementById("certificateLevel").textContent = "geschützt";
    document.getElementById("certificateXp").textContent = "geschützt";
    document.getElementById("certificateBadges").textContent = "geschützt";
    document.getElementById("certificateProject").textContent = "geschützt";
    document.getElementById("certificateStatus").textContent = "Gesperrt";
    return;
  }

  const formattedDate = new Intl.DateTimeFormat("de-CH", {
    dateStyle: "long"
  }).format(new Date());
  const completed = gameState.completed === gameState.total;
  const projectName = state.field_repoName || "Noch kein Repository eingetragen";
  const personName = state.studentName || "Noch kein Name eingetragen";
  const certificateBody = completed
    ? `für die erfolgreiche Bearbeitung der technischen Grundlagen zu Prompten und GitHub sowie aller ${gameState.total} GitHub-Schritte am ${formattedDate}.`
    : `für den bisherigen Fortschritt in der Lernstrecke zu Prompten, GitHub und dem Anwendungsbeispiel Bahnwärter Thiel. Aktuell wurden ${gameState.completed} von ${gameState.total} GitHub-Schritten abgeschlossen.`;

  document.getElementById("certificateName").textContent = personName;
  document.getElementById("certificateBody").textContent = certificateBody;
  document.getElementById("certificateLevel").textContent = `Level ${gameState.level.number} · ${gameState.level.title}`;
  document.getElementById("certificateXp").textContent = `${gameState.xp} XP`;
  document.getElementById("certificateBadges").textContent = String(gameState.badges.length);
  document.getElementById("certificateProject").textContent = projectName;
  document.getElementById("certificateStatus").textContent = completed ? "Vollständig abgeschlossen" : "Lernstrecke läuft";
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
        <button class="btn ghost small" type="button" data-action="export-state" data-step="${step}">Stand exportieren</button>
        <button class="btn ghost small" type="button" data-action="focus-image" data-step="${step}">Zum Bild</button>
        <button class="btn secondary small" type="button" data-action="jump-next" data-step="${step}">Nächster Schritt</button>
      </div>
    `;
    taskBox.append(statusRow);

    if (QUIZ_CONFIG[step]) {
      const quiz = document.createElement("section");
      quiz.className = "micro-quiz";
      quiz.dataset.quizStep = String(step);
      quiz.innerHTML = `
        <p><strong>Mini-Check:</strong> ${escapeHtml(QUIZ_CONFIG[step].question)}</p>
        <div class="quiz-options">
          ${QUIZ_CONFIG[step].options
            .map(
              (option) => `
                <button class="quiz-option" type="button" data-quiz-step="${step}" data-quiz-option="${escapeHtml(option)}">
                  ${escapeHtml(option)}
                </button>
              `
            )
            .join("")}
        </div>
        <p class="quiz-feedback" data-quiz-feedback="${step}">Beantworte den Mini-Check, um diesen Schritt voll abzuschliessen.</p>
      `;
      taskBox.append(quiz);
    }

    const lockedNote = document.createElement("p");
    lockedNote.className = "locked-note";
    lockedNote.dataset.lockedNote = String(step);
    lockedNote.hidden = true;
    taskBox.append(lockedNote);
  });
}

function renderQuizStates(state) {
  Object.keys(QUIZ_CONFIG).forEach((stepKey) => {
    const step = Number(stepKey);
    const config = QUIZ_CONFIG[step];
    const passed = Boolean(state[`quiz_${step}_passed`]);
    const lastChoice = state[`quiz_${step}_choice`] || "";
    const feedback = document.querySelector(`[data-quiz-feedback="${step}"]`);
    const options = [...document.querySelectorAll(`[data-quiz-step="${step}"]`)];

    options.forEach((button) => {
      button.classList.remove("correct", "wrong");

      if (passed && button.dataset.quizOption === config.correct) {
        button.classList.add("correct");
      } else if (!passed && lastChoice && button.dataset.quizOption === lastChoice) {
        button.classList.add("wrong");
      }
    });

    if (!feedback) {
      return;
    }

    if (passed) {
      feedback.textContent = config.success;
      return;
    }

    if (lastChoice) {
      feedback.textContent = config.failure;
      return;
    }

    feedback.textContent = "Beantworte den Mini-Check, um diesen Schritt voll abzuschliessen.";
  });
}

function applyStepStates(state, gameState) {
  const protectedLock = isStorageLocked();

  getTaskCards().forEach((card) => {
    const step = getStepNumber(card);
    const isDone = Boolean(state[`task_${step}`]);
    const isCurrent = step === gameState.currentStep && !isDone;
    const isLocked = step > gameState.unlockedThrough && !isDone;
    const isUnavailable = isLocked || protectedLock;
    const quizRequired = Boolean(QUIZ_CONFIG[step]);
    const quizPassed = Boolean(state[`quiz_${step}_passed`]);
    const canComplete = !quizRequired || quizPassed || isDone;
    const statusChip = card.querySelector(`[data-step-status="${step}"]`);
    const lockedNote = card.querySelector(`[data-locked-note="${step}"]`);
    const nextButton = card.querySelector(`[data-action="jump-next"][data-step="${step}"]`);
    const checkbox = card.querySelector(TASK_SELECTOR);

    card.classList.toggle("done", isDone);
    card.classList.toggle("current", isCurrent);
    card.classList.toggle("locked", isUnavailable);

    if (checkbox) {
      checkbox.checked = isDone;
      checkbox.disabled = isUnavailable || !canComplete;
    }

    card.querySelectorAll("input, select, textarea, button").forEach((element) => {
      const isTaskCheckbox = element.matches(TASK_SELECTOR);
      const isJumpButton = element.dataset.action === "jump-next" || element.dataset.action === "focus-image";
      const isQuizButton = element.classList.contains("quiz-option");

      if (isTaskCheckbox) {
        return;
      }

      if (isJumpButton) {
        element.disabled = isUnavailable;
        return;
      }

      if (isQuizButton) {
        element.disabled = isUnavailable || quizPassed;
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
      } else if (quizRequired && !quizPassed) {
        statusChip.classList.add("current");
        statusChip.textContent = "Mini-Check offen";
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
      } else if (quizRequired && !quizPassed && !isDone) {
        lockedNote.hidden = false;
        lockedNote.textContent = "Löse zuerst den Mini-Check, dann kannst du den Schritt als erledigt markieren.";
      } else {
        lockedNote.hidden = true;
      }
    }

    if (nextButton) {
      if (step === gameState.total) {
        nextButton.textContent = gameState.completed === gameState.total ? "Zum Abschluss" : "Letzter Schritt";
      } else {
        nextButton.textContent = "Nächster Schritt";
      }
    }
  });
}

function renderUI() {
  const state = loadState();
  const gameState = computeGameState(state);

  updateSaveState();
  renderSecurityControls();
  renderProgress(gameState);
  renderJourneyMap(state, gameState);
  renderMissionCockpit(gameState);
  renderBadgeBoard(state);
  renderUrlPreview(state);
  renderSummary(state, gameState);
  renderCertificate(state, gameState);
  renderProjectFieldFeedback(state);
  renderProjectAlert(state, gameState);
  renderProjectOverview(state, gameState);
  renderProjectFeedbackOutput(state);
  renderQuizStates(state);
  applyStepStates(state, gameState);
  applyGlobalLockState();
}

function setStateValue(key, value) {
  const previousState = cloneState(loadState());
  const state = loadState();
  state[key] = value;
  saveState(state);
  renderUI();
  maybeUpdateTeamsSubmissionState(previousState, state);
}

function persistProfile() {
  const previousState = cloneState(loadState());
  const state = loadState();
  state.studentName = document.getElementById("studentName").value;
  state.studentClass = document.getElementById("studentClass").value;
  state.projectUrl = document.getElementById("projectUrl").value;
  saveState(state);
  renderUI();
  maybeUpdateTeamsSubmissionState(previousState, state);
}

function createCertificateDocument(state, gameState) {
  const personName = escapeHtml(state.studentName || "Noch kein Name eingetragen");
  const projectName = escapeHtml(state.field_repoName || "Noch kein Repository eingetragen");
  const status = gameState.completed === gameState.total ? "Vollständig abgeschlossen" : "Lernstrecke läuft";
  const levelText = `Level ${gameState.level.number} · ${gameState.level.title}`;
  const dateText = new Intl.DateTimeFormat("de-CH", { dateStyle: "long" }).format(new Date());

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>Zertifikat zu Prompten und GitHub</title>
  <style>
    body {
      margin: 0;
      font-family: "Georgia", serif;
      background: #f8f4eb;
      color: #1b2430;
      display: grid;
      place-items: center;
      min-height: 100vh;
      padding: 32px;
    }
    .card {
      max-width: 980px;
      width: 100%;
      background: #fffdf8;
      border: 8px solid #e8c16a;
      border-radius: 28px;
      padding: 48px;
      box-sizing: border-box;
      text-align: center;
    }
    .kicker {
      text-transform: uppercase;
      letter-spacing: .2em;
      color: #b7621e;
      font-weight: 700;
      font-size: 14px;
    }
    h1 {
      margin: 12px 0 8px;
      font-size: 54px;
    }
    .name {
      margin: 18px 0;
      font-size: 42px;
      color: #16324f;
    }
    .meta {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-top: 32px;
    }
    .meta div,
    .footer div {
      padding: 14px;
      border-radius: 16px;
      background: #faf6ef;
    }
    .label {
      display: block;
      text-transform: uppercase;
      letter-spacing: .08em;
      font-size: 12px;
      color: #b7621e;
      margin-bottom: 8px;
    }
    .footer {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      margin-top: 16px;
    }
  </style>
</head>
<body>
  <section class="card">
    <div class="kicker">Prompten, GitHub und Bahnwärter Thiel</div>
    <h1>Zertifikat</h1>
    <p>Dieses Zertifikat wird verliehen an</p>
    <div class="name">${personName}</div>
    <p>für die Bearbeitung der technischen Grundlagen zu Prompten und GitHub sowie des Anwendungsbeispiels am ${dateText}.</p>
    <div class="meta">
      <div><span class="label">Level</span>${escapeHtml(levelText)}</div>
      <div><span class="label">Punkte</span>${gameState.xp} XP</div>
      <div><span class="label">Badges</span>${gameState.badges.length} von ${BADGE_CONFIG.length}</div>
    </div>
    <div class="footer">
      <div><span class="label">Projekt</span>${projectName}</div>
      <div><span class="label">Status</span>${escapeHtml(status)}</div>
    </div>
  </section>
</body>
</html>`;
}

function exportCertificate() {
  if (isStorageLocked()) {
    showToast("Entsperre zuerst die Einträge, um das Zertifikat zu exportieren.");
    return;
  }

  const state = loadState();
  const gameState = computeGameState(state);
  const html = createCertificateDocument(state, gameState);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const baseName = (state.studentName || "github-zertifikat").trim().replace(/\s+/g, "-").toLowerCase();

  link.href = url;
  link.download = `${baseName || "github-zertifikat"}-zertifikat.html`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportSummary() {
  if (isStorageLocked()) {
    showToast("Entsperre zuerst die Einträge, um den Lernnachweis zu exportieren.");
    return;
  }

  const state = loadState();
  const gameState = computeGameState(state);
  const feedbackReport = normalizeFeedbackReport(state.projectFeedbackItems);
  const lines = [
    "Prompten, GitHub und Bahnwärter Thiel",
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
    `Projektfeedback Zusammenfassung: ${feedbackReport?.summary || "-"}`,
    `Projektfeedback Stärken: ${feedbackReport?.strengths?.join(" | ") || "-"}`,
    `Projektfeedback Schärfungen: ${feedbackReport?.priorities?.join(" | ") || "-"}`,
    `Projektfeedback Nächster Schritt: ${feedbackReport?.nextStep || "-"}`,
    `Punkte: ${gameState.xp} XP`,
    `Level: ${gameState.level.number} ${gameState.level.title}`,
    `Badges: ${gameState.badges.length}/${BADGE_CONFIG.length}`,
    `Fortschritt: ${gameState.completed}/${gameState.total}`,
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
  const baseName = (state.studentName || "github-lernstrecke").trim().replace(/\s+/g, "-").toLowerCase();

  link.href = url;
  link.download = `${baseName || "github-lernstrecke"}-lernnachweis.txt`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function notifyProgression(previousState, nextState, context) {
  const previousGame = computeGameState(previousState);
  const nextGame = computeGameState(nextState);
  const previousBadges = new Set(getEarnedBadges(previousState).map((badge) => badge.id));
  const unlockedBadges = getEarnedBadges(nextState).filter((badge) => !previousBadges.has(badge.id));

  if (context.type === "task" && !previousState[`task_${context.step}`] && nextState[`task_${context.step}`]) {
    if (context.step < nextGame.total) {
      showToast(`Schritt ${context.step} geschafft. Schritt ${context.step + 1} ist jetzt freigeschaltet.`);
    } else {
      showToast("Stark. Alle Schritte der Lernstrecke sind geschafft.");
    }
  }

  if (context.type === "quiz" && !previousState[`quiz_${context.step}_passed`] && nextState[`quiz_${context.step}_passed`]) {
    showToast(`Mini-Check in Schritt ${context.step} geschafft. +50 XP`);
  }

  if (nextGame.level.number > previousGame.level.number) {
    showToast(`Levelaufstieg: Du bist jetzt ${nextGame.level.title}.`);
    createConfettiBurst();
  }

  if (unlockedBadges.length > 0) {
    showToast(`Neues Badge: ${unlockedBadges[0].title}`);
    createConfettiBurst();
  }

  if (previousGame.completed < previousGame.total && nextGame.completed === nextGame.total) {
    showToast("Abschlussbonus freigeschaltet. Zertifikat ist bereit.");
    createConfettiBurst();
  }
}

function bindJourneyMap() {
  document.getElementById("journeyMap").addEventListener("click", (event) => {
    const link = event.target.closest("[data-journey-step]");
    if (!link) {
      return;
    }

    const step = Number(link.dataset.journeyStep);
    const gameState = computeGameState(loadState());

    if (isStorageLocked()) {
      event.preventDefault();
      showToast("Entsperre zuerst die passwortgeschützten Einträge.");
      return;
    }

    if (step > gameState.unlockedThrough) {
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
      const previousState = loadState();
      const nextState = { ...previousState, [`task_${step}`]: checkbox.checked };

      saveState(nextState);
      renderUI();
      notifyProgression(previousState, nextState, { type: "task", step });
      maybeUpdateTeamsSubmissionState(previousState, nextState);
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
    const previousState = cloneState(loadState());
    const state = loadState();
    const projectState = getProjectCompletionState(state);
    state.projectFeedbackItems = generateProjectFeedback(state);
    saveState(state);
    renderUI();

    if (projectState.openItems.length > 0) {
      showToast("Projektfeedback aktualisiert. Im Projektcheck sind noch offene Punkte markiert.");
      document.getElementById("projectAlertBox")?.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      showToast("Projektfeedback aktualisiert.");
    }

    maybeUpdateTeamsSubmissionState(previousState, state);
  });

  document.getElementById("clearProjectFeedback").addEventListener("click", () => {
    const previousState = cloneState(loadState());
    const state = loadState();
    state.projectFeedbackItems = [];
    delete state.teamsSubmissionPreparedAt;
    saveState(state);
    renderUI();
    showToast("Projektfeedback geleert.");
    maybeUpdateTeamsSubmissionState(previousState, state);
  });

  document.getElementById("exportSummary").addEventListener("click", exportSummary);
  document.getElementById("exportState").addEventListener("click", exportStateSnapshot);
  document.getElementById("importState").addEventListener("click", () => {
    if (isStorageLocked()) {
      showToast("Entsperre zuerst die Einträge, bevor du einen Stand importierst.");
      return;
    }

    document.getElementById("importStateFile").click();
  });
  document.getElementById("importStateFile").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const payload = JSON.parse(await file.text());
      if (hasMeaningfulState(loadState())) {
        const confirmed = window.confirm(
          "Es gibt bereits einen Lernstand in dieser Version. Soll er durch den importierten Stand ersetzt werden?"
        );

        if (!confirmed) {
          return;
        }
      }

      const result = importStateSnapshot(payload);
      const modeLabel =
        result.importedMode === "gamifiziert"
          ? "gamifizierten"
          : result.importedMode === "einfach"
            ? "einfachen"
            : null;

      showToast(modeLabel ? `Stand aus der ${modeLabel} Version importiert.` : "Stand importiert.");
    } catch {
      showToast("Die Datei konnte nicht importiert werden.");
    }
  });
  document.getElementById("exportCertificate").addEventListener("click", exportCertificate);
  document.getElementById("printCertificate").addEventListener("click", () => {
    document.getElementById("certificateSection").scrollIntoView({ behavior: "smooth", block: "start" });
    window.print();
  });
  document.getElementById("prepareTeamsSubmission").addEventListener("click", () => {
    const state = loadState();
    const gameState = computeGameState(state);
    const projectState = getProjectCompletionState(state, gameState);

    if (!projectState.everythingDone) {
      showToast("Die Teams-Abgabe wird erst exportiert, wenn alle Aufträge vollständig erledigt sind.");
      document.getElementById("projectAlertBox")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    if (!state.teamsSubmissionPreparedAt) {
      state.teamsSubmissionPreparedAt = new Date().toISOString();
      saveState(state);
      renderUI();
    }

    const baseName = sanitizeFilePart(state.studentName || state.field_projectTitle || "teams-abgabe", "teams-abgabe");
    downloadTextFile(`${baseName}-teams-abgabe.txt`, createTeamsSubmissionText(state, gameState, projectState));
    showToast("Teams-Abgabe exportiert. Lade die Datei jetzt in der Teams-Hausaufgabe hoch.");
  });
  document.getElementById("printProjectOverview").addEventListener("click", () => {
    document.getElementById("projectOverviewBox")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.print();
  });
  document.getElementById("exportSubmissionPdf").addEventListener("click", () => {
    document.getElementById("summaryBox")?.scrollIntoView({ behavior: "smooth", block: "start" });
    showToast("Im Druckdialog kannst du die Übersicht jetzt als PDF speichern und danach an die Lehrperson senden.");
    window.setTimeout(() => {
      window.print();
    }, 180);
  });

  document.getElementById("resetAll").addEventListener("click", () => {
    const confirmed = window.confirm(
      "Sollen wirklich alle lokal gespeicherten Angaben, Punkte und Fortschritte entfernt werden?"
    );

    if (!confirmed) {
      return;
    }

    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  });

  document.getElementById("jumpCurrent").addEventListener("click", () => {
    jumpToStep(computeGameState(loadState()).currentStep);
  });

  document.getElementById("focusCurrent").addEventListener("click", () => {
    jumpToStep(computeGameState(loadState()).currentStep);
  });

  document.addEventListener("click", (event) => {
    const quizButton = event.target.closest(".quiz-option");
    const actionButton = event.target.closest("[data-action]");

    if (quizButton) {
      const step = Number(quizButton.dataset.quizStep);
      const option = quizButton.dataset.quizOption;
      const previousState = loadState();
      const config = QUIZ_CONFIG[step];
      const nextState = {
        ...previousState,
        [`quiz_${step}_choice`]: option,
        [`quiz_${step}_passed`]: option === config.correct
      };

      saveState(nextState);
      renderUI();
      notifyProgression(previousState, nextState, { type: "quiz", step });
      maybeUpdateTeamsSubmissionState(previousState, nextState);
      return;
    }

    if (!actionButton) {
      return;
    }

    const step = Number(actionButton.dataset.step);

    if (actionButton.dataset.action === "export-state") {
      exportStateSnapshot();
      return;
    }

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
      const gameState = computeGameState(loadState());
      jumpToStep(Math.min(step + 1, gameState.total));
    }
  });

  bindJourneyMap();
}

async function init() {
  await initializeStorage();
  storageReady = true;
  hydrateInputs();
  injectStepEnhancements();
  injectProjectFieldFeedbackSlots();
  bindEvents();
  renderUI();
}

void init();
