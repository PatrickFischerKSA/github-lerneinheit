const STORAGE_KEY = "github-lerneinheit-v3";
const TASK_SELECTOR = "input[data-task]";
const FIELD_SELECTOR = "[data-field]";

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

function renderProgress(gameState) {
  const progressText = document.getElementById("progressText");
  const progressFill = document.getElementById("progressFill");
  const ratio = gameState.total ? (gameState.completed / gameState.total) * 100 : 0;

  progressText.textContent = `${gameState.completed} / ${gameState.total} GitHub-Schritte erledigt`;
  progressFill.style.width = `${ratio}%`;
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

function renderSummary(state, gameState) {
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
  const formattedDate = new Intl.DateTimeFormat("de-CH", {
    dateStyle: "long"
  }).format(new Date());
  const completed = gameState.completed === gameState.total;
  const projectName = state.field_repoName || "Noch kein Repository eingetragen";
  const personName = state.studentName || "Noch kein Name eingetragen";
  const certificateBody = completed
    ? `für die erfolgreiche Bearbeitung der Prompting-Einheit sowie aller ${gameState.total} GitHub-Schritte am ${formattedDate}.`
    : `für den bisherigen Fortschritt in der Prompting- und GitHub-Lernstrecke. Aktuell wurden ${gameState.completed} von ${gameState.total} GitHub-Schritten abgeschlossen.`;

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
  getTaskCards().forEach((card) => {
    const step = getStepNumber(card);
    const isDone = Boolean(state[`task_${step}`]);
    const isCurrent = step === gameState.currentStep && !isDone;
    const isLocked = step > gameState.unlockedThrough && !isDone;
    const quizRequired = Boolean(QUIZ_CONFIG[step]);
    const quizPassed = Boolean(state[`quiz_${step}_passed`]);
    const canComplete = !quizRequired || quizPassed || isDone;
    const statusChip = card.querySelector(`[data-step-status="${step}"]`);
    const lockedNote = card.querySelector(`[data-locked-note="${step}"]`);
    const nextButton = card.querySelector(`[data-action="jump-next"][data-step="${step}"]`);
    const checkbox = card.querySelector(TASK_SELECTOR);

    card.classList.toggle("done", isDone);
    card.classList.toggle("current", isCurrent);
    card.classList.toggle("locked", isLocked);

    if (checkbox) {
      checkbox.checked = isDone;
      checkbox.disabled = isLocked || !canComplete;
    }

    card.querySelectorAll("input, select, textarea, button").forEach((element) => {
      const isTaskCheckbox = element.matches(TASK_SELECTOR);
      const isJumpButton = element.dataset.action === "jump-next" || element.dataset.action === "focus-image";
      const isQuizButton = element.classList.contains("quiz-option");

      if (isTaskCheckbox) {
        return;
      }

      if (isJumpButton) {
        element.disabled = isLocked;
        return;
      }

      if (isQuizButton) {
        element.disabled = isLocked || quizPassed;
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
      if (isLocked) {
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
  renderProgress(gameState);
  renderJourneyMap(state, gameState);
  renderMissionCockpit(gameState);
  renderBadgeBoard(state);
  renderUrlPreview(state);
  renderSummary(state, gameState);
  renderCertificate(state, gameState);
  renderQuizStates(state);
  applyStepStates(state, gameState);
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
  <title>Prompting- und GitHub-Zertifikat</title>
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
    <div class="kicker">Prompting- und GitHub-Lernstrecke</div>
    <h1>Zertifikat</h1>
    <p>Dieses Zertifikat wird verliehen an</p>
    <div class="name">${personName}</div>
    <p>für die Bearbeitung der Prompting-Einheit sowie der interaktiven GitHub-Lernstrecke am ${dateText}.</p>
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
  const state = loadState();
  const gameState = computeGameState(state);
  const lines = [
    "Prompting- und GitHub-Lernstrecke",
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
  document.getElementById("exportCertificate").addEventListener("click", exportCertificate);
  document.getElementById("printCertificate").addEventListener("click", () => {
    document.getElementById("certificateSection").scrollIntoView({ behavior: "smooth", block: "start" });
    window.print();
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
      return;
    }

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
      const gameState = computeGameState(loadState());
      jumpToStep(Math.min(step + 1, gameState.total));
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
