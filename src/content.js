const BUTTON_CLASS = "wle-explain-button";
let activeButton = null;
let activeBubble = null;
let hideTimer = null;
let selectionButton = null;

document.addEventListener("mouseover", (event) => {
  const bubble = findMessageBubble(event.target);
  if (!bubble || bubble === activeBubble) return;

  activeBubble = bubble;
  attachButton(bubble);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "CAPTURE_SELECTION") {
    captureSelectionForPanel().then(sendResponse);
    return true;
  }
});

document.addEventListener("selectionchange", () => {
  const selection = window.getSelection()?.toString()?.trim();
  if (!selection || selection.length < 2) {
    removeSelectionButton();
    return;
  }

  if (!isSelectionInsideWhatsApp()) return;

  const capture = buildSelectionCapture(selection);
  chrome.storage.local.set({
    wleSelectedMessage: {
      ...capture,
      rawSelectedText: selection,
      capturedAt: new Date().toISOString()
    }
  });
  showSelectionButton();
});

async function captureSelectionForPanel() {
  const selection = window.getSelection()?.toString()?.trim();
  if (!selection) return { ok: false, error: "No selected WhatsApp text found." };

  const capture = buildSelectionCapture(selection);
  await chrome.storage.local.set({
    wleSelectedMessage: {
      ...capture,
      rawSelectedText: selection,
      capturedAt: new Date().toISOString()
    }
  });

  return { ok: true };
}

function findMessageBubble(target) {
  if (!(target instanceof Element)) return null;

  const candidates = [
    target.closest("[data-pre-plain-text]"),
    target.closest("[data-testid='msg-container']"),
    target.closest("[data-id]"),
    target.closest(".message-in"),
    target.closest(".message-out"),
    target.closest("[role='row']"),
    target.closest("div")
  ].filter(Boolean);

  for (const candidate of candidates) {
    const text = extractMessageText(candidate);
    if (text && text.length > 1 && text.length < 5000) return candidate;
  }

  return null;
}

function isSelectionInsideWhatsApp() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return false;
  const container = selection.getRangeAt(0).commonAncestorContainer;
  const element = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
  return Boolean(element?.closest("#app"));
}

function showSelectionButton() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (!rect || (!rect.width && !rect.height)) return;

  if (!selectionButton) {
    selectionButton = document.createElement("button");
    selectionButton.className = "wle-selection-button";
    selectionButton.type = "button";
    selectionButton.textContent = "Explain selected";
    selectionButton.title = "Explain selected WhatsApp text";
    selectionButton.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    selectionButton.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await captureSelectionAndOpen();
    });
    document.body.appendChild(selectionButton);
  }

  const left = Math.min(window.innerWidth - 170, Math.max(12, rect.left));
  const top = Math.max(12, rect.top - 44);
  selectionButton.style.left = `${left}px`;
  selectionButton.style.top = `${top}px`;
}

function removeSelectionButton() {
  if (selectionButton) selectionButton.remove();
  selectionButton = null;
}

function attachButton(bubble) {
  clearTimeout(hideTimer);
  if (activeButton) activeButton.remove();

  const button = document.createElement("button");
  button.className = BUTTON_CLASS;
  button.type = "button";
  button.textContent = "?";
  button.title = "Explain this message";
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await captureAndOpen(bubble);
  });

  const insertionTarget = bubble.querySelector("[data-pre-plain-text]") || bubble;
  insertionTarget.appendChild(button);
  activeButton = button;

  button.addEventListener("mouseleave", scheduleHide);
  bubble.addEventListener("mouseleave", scheduleHide, { once: true });
}

function scheduleHide() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (activeButton) activeButton.remove();
    activeButton = null;
    activeBubble = null;
  }, 1200);
}

async function captureAndOpen(bubble) {
  const rawSelectedText = appendMissingUrls(extractMessageText(bubble), collectUrlsFromElement(bubble));
  if (!rawSelectedText) {
    showToast("Could not read this message. Try selecting the text manually.");
    return;
  }

  const settings = await getSettings();
  const context = collectNearbyContext(bubble, settings.contextMessages);
  const anonymized = anonymizeCapture(rawSelectedText, context);
  const data = {
    selectedText: anonymized.selectedText,
    rawSelectedText,
    context: anonymized.context,
    aliasMap: anonymized.aliasMap,
    capturedAt: new Date().toISOString(),
    captureId: makeCaptureId(anonymized.selectedText)
  };

  await chrome.storage.local.set({ wleSelectedMessage: data });
  chrome.runtime.sendMessage({ type: "OPEN_EXPLAINER" }, (response) => {
    if (!response?.ok) showToast(response?.error || "Could not open the explainer panel.");
  });
}

async function captureSelectionAndOpen() {
  const selection = window.getSelection()?.toString()?.trim();
  if (!selection) {
    showToast("Select WhatsApp message text first.");
    return;
  }

  const capture = buildSelectionCapture(selection);
  const data = {
    ...capture,
    rawSelectedText: selection,
    capturedAt: new Date().toISOString(),
    captureId: makeCaptureId(capture.selectedText)
  };

  await chrome.storage.local.set({ wleSelectedMessage: data });
  removeSelectionButton();
  chrome.runtime.sendMessage({ type: "OPEN_EXPLAINER" }, (response) => {
    if (!response?.ok) showToast(response?.error || "Could not open the explainer panel.");
  });
}

async function getSettings() {
  const stored = await chrome.storage.local.get("settings");
  return {
    contextMessages: 8,
    ...(stored.settings || {})
  };
}

function extractMessageText(container) {
  const prePlain = collectPrePlainText(container).join("\n");
  const urls = collectUrlsFromElement(container);
  const selectable = Array.from(container.querySelectorAll("span.selectable-text, div.copyable-text, [data-pre-plain-text]"));
  const parts = selectable
    .map((node) => node.innerText || node.textContent || "")
    .map(cleanText)
    .filter(Boolean);

  const joined = unique(parts).join("\n").trim();
  if (joined) return appendMissingUrls(stripUiText(unique([prePlain, joined].filter(Boolean)).join("\n")), urls);

  const fallback = cleanText(container.innerText || container.textContent || "");
  return appendMissingUrls(stripUiText(`${prePlain} ${fallback}`.trim()), urls);
}

function collectUrlsFromElement(container) {
  if (!container?.querySelectorAll) return [];

  const urls = [];
  container.querySelectorAll("a[href]").forEach((anchor) => {
    const href = anchor.getAttribute("href") || "";
    const absoluteHref = anchor.href || href;
    [href, absoluteHref].forEach((value) => {
      const normalized = normalizeUrl(value);
      if (normalized) urls.push(normalized);
    });
  });

  return unique(urls);
}

function appendMissingUrls(text, urls) {
  const cleaned = cleanText(text);
  const missing = unique((urls || []).filter((url) => !cleaned.includes(url)));
  if (!missing.length) return cleaned;
  return [cleaned, ...missing].filter(Boolean).join("\n");
}

function normalizeUrl(value) {
  const cleaned = cleanText(value);
  if (!cleaned || !/^https?:\/\//i.test(cleaned)) return "";
  try {
    const url = new URL(cleaned);
    if (url.hostname.endsWith("whatsapp.com")) return "";
    return url.toString();
  } catch (_) {
    return cleaned;
  }
}

function collectPrePlainText(container) {
  const values = [];
  const own = container.getAttribute?.("data-pre-plain-text");
  if (own) values.push(own);

  container.querySelectorAll?.("[data-pre-plain-text]").forEach((node) => {
    const value = node.getAttribute("data-pre-plain-text");
    if (value) values.push(value);
  });

  return unique(values.map(cleanText).filter(Boolean));
}

function collectNearbyContext(bubble, limit) {
  const rows = Array.from(document.querySelectorAll("[role='row'], .message-in, .message-out, [data-pre-plain-text]"));
  const currentIndex = rows.findIndex((row) => row === bubble || row.contains(bubble) || bubble.contains(row));
  if (currentIndex === -1) return [];

  const start = Math.max(0, currentIndex - limit);
  const end = Math.min(rows.length, currentIndex + 1);
  return rows
    .slice(start, end)
    .map(extractMessageText)
    .map(cleanText)
    .filter(Boolean)
    .slice(-limit);
}

function redact(text) {
  const urls = [];
  const protectedText = cleanText(text).replace(/(?:https?:\/\/|www\.|[A-Za-z0-9.-]+\.[A-Za-z]{2,}\/)[^\s<>"')]+/gi, (url) => {
    urls.push(url);
    return `__WLE_URL_TOKEN_${urls.length - 1}__`;
  });

  const redacted = protectedText
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "[phone]")
    .replace(/\+\s*\[phone\]/g, "[phone]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/\b[\w.-]+@[\w.-]+\b/g, "[handle]")
    .replace(/\b[\w.-]+@[a-z]{2,}\b/gi, "[upi-or-handle]");

  return urls.reduce((output, url, index) => output.replace(`__WLE_URL_TOKEN_${index}__`, url), redacted);
}

function buildSelectionCapture(selection) {
  const selectedBubble = findSelectedBubble();
  const selectedWithUrls = selectedBubble
    ? appendMissingUrls(selection, collectUrlsFromElement(selectedBubble))
    : selection;
  const context = selectedBubble ? collectNearbyContext(selectedBubble, 8) : [];
  const anonymized = anonymizeCapture(selectedWithUrls, context);
  return {
    selectedText: anonymized.selectedText,
    context: anonymized.context,
    aliasMap: anonymized.aliasMap
  };
}

function makeCaptureId(text) {
  let hash = 0;
  const value = cleanText(text);
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return `${Date.now()}-${Math.abs(hash)}`;
}

function findSelectedBubble() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const container = selection.getRangeAt(0).commonAncestorContainer;
  const element = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
  const preferred = [
    element?.closest("[data-pre-plain-text]"),
    element?.closest("[data-testid='msg-container']"),
    element?.closest("[data-id]"),
    element?.closest(".message-in"),
    element?.closest(".message-out"),
    element?.closest("[role='row']")
  ].filter(Boolean);

  return preferred[0] || findMessageBubble(element);
}

function anonymizeCapture(selectedTextValue, contextValues) {
  const sanitizer = createWhatsAppSanitizer();
  [...contextValues, selectedTextValue].forEach((text) => sanitizer.learn(text));

  return {
    selectedText: sanitizer.sanitize(selectedTextValue),
    context: contextValues.map((item) => sanitizer.sanitize(item)),
    aliasMap: sanitizer.getMap()
  };
}

function createWhatsAppSanitizer() {
  const aliasesByKey = new Map();
  const aliasRows = [];

  function learn(text) {
    const lines = splitLines(text);

    lines.forEach((line, index) => {
      const metadata = parseMetadataLine(line);
      if (metadata) {
        getAlias({ name: metadata.name });
        return;
      }

      const phone = extractIdentityPhone(line);
      const previous = cleanText(lines[index - 1] || "");
      const next = cleanText(lines[index + 1] || "");

      if (phone) {
        const adjacentName = looksLikeIdentityNameLine(previous) ? previous : looksLikeIdentityNameLine(next) ? next : "";
        getAlias({ name: adjacentName, phone });
        return;
      }

      const adjacentPhone = extractIdentityPhone(previous) || extractIdentityPhone(next);
      if (looksLikeIdentityNameLine(line) && adjacentPhone) {
        getAlias({ name: line, phone: adjacentPhone });
      }
    });
  }

  function sanitize(text) {
    return splitLines(text)
      .map((line, index, lines) => sanitizeLine(line, index, lines))
      .filter((line) => line !== null)
      .join("\n");
  }

  function sanitizeLine(line, index, lines) {
    const metadata = parseMetadataLine(line);
    if (metadata) {
      const alias = getAlias({ name: metadata.name });
      return metadata.message ? `${alias}: ${redact(metadata.message)}` : alias;
    }

    const phone = extractIdentityPhone(line);
    if (phone) return "[phone]";

    const previous = cleanText(lines[index - 1] || "");
    const next = cleanText(lines[index + 1] || "");
    const adjacentPhone = extractIdentityPhone(previous) || extractIdentityPhone(next);
    if (looksLikeIdentityNameLine(line) && adjacentPhone) {
      return getAlias({ name: line, phone: adjacentPhone });
    }

    return redact(line);
  }

  function getAlias(identity) {
    const name = normalizeName(identity.name || "");
    const phone = normalizePhone(identity.phone || "");
    const keys = [name && `name:${name.toLowerCase()}`, phone && `phone:${phone}`].filter(Boolean);

    for (const key of keys) {
      if (aliasesByKey.has(key)) {
        const alias = aliasesByKey.get(key);
        keys.forEach((item) => aliasesByKey.set(item, alias));
        updateAliasRow(alias, name, phone);
        return alias;
      }
    }

    const alias = `Person ${aliasRows.length + 1}`;
    keys.forEach((key) => aliasesByKey.set(key, alias));
    aliasRows.push({ alias, name: name || phone || "Unknown contact" });
    return alias;
  }

  function updateAliasRow(alias, name, phone) {
    const row = aliasRows.find((item) => item.alias === alias);
    if (!row) return;
    if (name && row.name === "Unknown contact") row.name = name;
    if (name && /^phone:/.test(row.name)) row.name = name;
    if (!row.name && phone) row.name = phone;
  }

  function getMap() {
    return aliasRows.map((row) => ({ name: row.name, alias: row.alias }));
  }

  return { learn, sanitize, getMap };
}

function parseMetadataLine(line) {
  const cleaned = cleanText(line);
  const bracketMatch = cleaned.match(/^\[[^\]]+\]\s*([^:]{2,80}):\s*(.*)$/);
  if (bracketMatch && normalizeName(bracketMatch[1])) {
    return { name: normalizeName(bracketMatch[1]), message: bracketMatch[2] || "" };
  }

  return null;
}

function looksLikeContactName(text) {
  const cleaned = normalizeName(text);
  if (!cleaned) return false;
  if (cleaned.includes("[") || cleaned.includes("]")) return false;
  if (/[.!?,;]{1,}$/.test(cleaned)) return false;
  if (/[:/@#]|https?|www\.|[\d]{2,}/i.test(cleaned)) return false;
  if (cleaned.length > 48) return false;

  const parts = splitNameParts(cleaned);
  if (parts.length < 1 || parts.length > 5) return false;
  if (parts.length === 1 && parts[0].length < 2) return false;

  return parts.every((part, index) => {
    if (/^\d+$/.test(part)) return false;
    const isFinalInitial = index === parts.length - 1 && parts.length > 1 && /^[A-Z]$/i.test(part);
    if (part.length < 2 && !isFinalInitial) return false;
    return /^[A-Z]/.test(part) || /[^\x00-\x7F]/.test(part);
  });
}

function looksLikeIdentityNameLine(text) {
  const cleaned = normalizeName(text);
  if (!cleaned) return false;
  if (looksLikeContactName(cleaned)) return true;
  if (cleaned.includes("[") || cleaned.includes("]")) return false;
  if (/[:/@#.]|https?|www\.|[\d]{2,}/i.test(cleaned)) return false;
  if (/[.!?,;]{1,}$/.test(cleaned)) return false;
  if (cleaned.length > 48) return false;

  const parts = splitNameParts(cleaned);
  if (parts.length < 1 || parts.length > 5) return false;

  return parts.every((part) => {
    if (/^\d+$/.test(part)) return false;
    if (part.length < 2) return false;
    return /^[\p{L}\p{N}_-]+$/u.test(part);
  });
}

function normalizeName(name) {
  const cleaned = cleanText(name)
    .replace(/^[~\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || cleaned.length < 2 || cleaned.length > 80) return "";
  if (/\d{4,}/.test(cleaned)) return "";
  if (looksLikeSystemLabel(cleaned)) return "";
  return cleaned;
}

function splitNameParts(name) {
  return name
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}\p{N}_-]/gu, ""))
    .filter(Boolean);
}

function extractPhone(text) {
  const cleaned = cleanText(text);
  if (containsUrlLikeText(cleaned)) return "";
  const match = cleaned.match(/(?:\+?\d[\d\s().-]{7,}\d)/);
  return match ? match[0] : "";
}

function extractIdentityPhone(text) {
  return looksLikePhoneLine(text) ? extractPhone(text) : "";
}

function containsUrlLikeText(text) {
  return /(?:https?:\/\/|www\.|[A-Za-z0-9.-]+\.[A-Za-z]{2,}\/)/i.test(text);
}

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function splitLines(text) {
  return cleanText(text).split(/\n+/).map(cleanText).filter(Boolean);
}

function looksLikeTime(text) {
  return /^\d{1,2}:\d{2}\s*(?:am|pm)?$/i.test(text.trim());
}

function looksLikePhoneLine(text) {
  return /^(?:\+?\d[\d\s().-]{7,}\d|\[phone\])$/i.test(text.trim());
}

function looksLikeSystemLabel(text) {
  return /^(today|yesterday|forwarded|edited|you|this message was deleted|messages and calls are end-to-end encrypted)$/i.test(text.trim());
}

function stripUiText(text) {
  return text
    .replace(/\b(?:Forwarded|You reacted|Reacted|Edited|Read more|Message info)\b/gi, "")
    .replace(/\b(?:AM|PM)\b\s*$/i, "")
    .trim();
}

function cleanText(text) {
  return String(text || "")
    .replace(/\u200e|\u200f|\u202a|\u202c/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function unique(items) {
  return Array.from(new Set(items));
}

function showToast(message) {
  const existing = document.querySelector(".wle-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = "wle-toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
