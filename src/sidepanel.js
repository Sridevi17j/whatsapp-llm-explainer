let selectedMessage = null;
let conversation = [];
let activeCaptureId = "";

const selectedText = document.getElementById("selectedText");
const chatTranscript = document.getElementById("chatTranscript");
const statusText = document.getElementById("status");
const question = document.getElementById("question");
const explainButton = document.getElementById("explainButton");
const clearButton = document.getElementById("clearButton");
const optionsButton = document.getElementById("optionsButton");

loadPanelState();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.wleSelectedMessage) {
    renderSelectedMessage(changes.wleSelectedMessage.newValue, { resetOnChange: true });
  }
});

document.querySelectorAll("[data-prompt]").forEach((button) => {
  button.addEventListener("click", () => {
    question.value = button.dataset.prompt;
    question.focus();
  });
});

optionsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());
explainButton.addEventListener("click", explain);
clearButton.addEventListener("click", clearChat);

async function loadPanelState() {
  const stored = await chrome.storage.local.get(["wleSelectedMessage", "wleConversation"]);
  renderSelectedMessage(stored.wleSelectedMessage, { resetOnChange: false });

  if (stored.wleConversation?.captureId === activeCaptureId) {
    conversation = stored.wleConversation.items || [];
  }

  renderConversation();
}

function renderSelectedMessage(message, options) {
  const nextCaptureId = message?.captureId || message?.capturedAt || "";
  const changed = activeCaptureId && nextCaptureId && activeCaptureId !== nextCaptureId;

  selectedMessage = message || null;
  activeCaptureId = nextCaptureId;
  selectedText.textContent = selectedMessage?.selectedText || "No message captured yet.";
  statusText.textContent = selectedMessage?.capturedAt
    ? `Captured ${new Date(selectedMessage.capturedAt).toLocaleTimeString()}`
    : "Select a WhatsApp message.";

  if (options?.resetOnChange && changed) {
    conversation = [];
    question.value = "Explain this";
    saveConversation();
    renderConversation();
  }
}

function renderConversation() {
  chatTranscript.replaceChildren();

  if (!conversation.length) {
    chatTranscript.textContent = "The explanation will appear here.";
    explainButton.textContent = "Explain message";
    clearButton.disabled = true;
    return;
  }

  explainButton.textContent = "Ask follow-up";
  clearButton.disabled = false;

  const latestAssistant = conversation
    .filter((item) => item.role === "assistant" && !item.pending)
    .at(-1);
  const pending = conversation.find((item) => item.pending);
  const visibleItem = pending || latestAssistant;

  if (!visibleItem) {
    chatTranscript.textContent = "Ask a follow-up below.";
    return;
  }

  const message = document.createElement("div");
  message.className = `chat-message ${visibleItem.role}`;

  const body = document.createElement("div");
  body.className = "chat-body";
  body.textContent = visibleItem.text;

  message.append(body);
  chatTranscript.append(message);
}

async function explain() {
  if (!selectedMessage?.selectedText) {
    showSystemMessage("Select a message in WhatsApp Web first.");
    return;
  }

  const asked = question.value.trim() || "Explain this";
  const priorConversation = conversation.slice();

  conversation = [...conversation, { role: "user", text: asked }];
  renderConversation();
  await saveConversation();

  explainButton.disabled = true;
  question.disabled = true;
  showThinking();

  const payload = {
    selectedText: selectedMessage.selectedText,
    context: selectedMessage.context || [],
    question: asked,
    conversation: priorConversation
  };

  chrome.runtime.sendMessage({ type: "LLM_EXPLAIN", payload }, async (response) => {
    explainButton.disabled = false;
    question.disabled = false;
    removeThinking();

    if (!response?.ok) {
      conversation = [...conversation, { role: "assistant", text: response?.error || "The LLM request failed." }];
      renderConversation();
      await saveConversation();
      return;
    }

    conversation = [...conversation, { role: "assistant", text: response.text || "No answer returned." }];
    question.value = "";
    question.placeholder = "Ask a follow-up...";
    renderConversation();
    await saveConversation();
  });
}

function showThinking() {
  conversation = [...conversation, { role: "assistant", text: "Thinking...", pending: true }];
  renderConversation();
}

function removeThinking() {
  conversation = conversation.filter((item) => !item.pending);
}

async function clearChat() {
  conversation = [];
  question.value = "Explain this";
  question.placeholder = "";
  renderConversation();
  await saveConversation();
}

function showSystemMessage(text) {
  conversation = [{ role: "assistant", text }];
  renderConversation();
}

async function saveConversation() {
  await chrome.storage.local.set({
    wleConversation: {
      captureId: activeCaptureId,
      items: conversation
    }
  });
}
