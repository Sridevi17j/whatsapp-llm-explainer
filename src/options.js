const DEFAULT_SETTINGS = {
  provider: "gemini",
  model: "gemini-2.5-flash-lite",
  apiKey: "",
  contextMessages: 8,
  firecrawlEnabled: false,
  firecrawlApiKey: "",
  firecrawlMaxUrls: 2
};

const DEFAULT_MODELS = {
  gemini: "gemini-2.5-flash-lite",
  groq: "llama-3.1-8b-instant",
  openrouter: "openrouter/free"
};

const form = document.getElementById("settingsForm");
const provider = document.getElementById("provider");
const model = document.getElementById("model");
const apiKey = document.getElementById("apiKey");
const contextMessages = document.getElementById("contextMessages");
const firecrawlEnabled = document.getElementById("firecrawlEnabled");
const firecrawlApiKey = document.getElementById("firecrawlApiKey");
const firecrawlMaxUrls = document.getElementById("firecrawlMaxUrls");
const status = document.getElementById("status");
const testButton = document.getElementById("testButton");

load();

provider.addEventListener("change", () => {
  model.value = DEFAULT_MODELS[provider.value] || "";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveSettings();
  status.textContent = "Saved.";
  setTimeout(() => {
    status.textContent = "";
  }, 1800);
});

testButton.addEventListener("click", async () => {
  await saveSettings();
  testButton.disabled = true;
  status.textContent = "Testing provider...";

  chrome.runtime.sendMessage({ type: "LLM_TEST" }, (response) => {
    testButton.disabled = false;

    if (!response?.ok) {
      status.style.color = "#b42318";
      status.textContent = response?.error || "Provider test failed.";
      return;
    }

    status.style.color = "#0f7b35";
    status.textContent = `Provider works.\n${response.text || ""}`;
  });
});

async function saveSettings() {
  await chrome.storage.local.set({
    settings: {
      provider: provider.value,
      model: model.value.trim(),
      apiKey: apiKey.value.trim(),
      contextMessages: Number(contextMessages.value || 8),
      firecrawlEnabled: firecrawlEnabled.checked,
      firecrawlApiKey: firecrawlApiKey.value.trim(),
      firecrawlMaxUrls: Number(firecrawlMaxUrls.value || 2)
    }
  });
}

async function load() {
  const stored = await chrome.storage.local.get("settings");
  const settings = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
  if (settings.provider === "pollinations") {
    settings.provider = "openrouter";
    settings.model = DEFAULT_MODELS.openrouter;
  }
  provider.value = settings.provider;
  model.value = settings.model;
  apiKey.value = settings.apiKey;
  contextMessages.value = settings.contextMessages;
  firecrawlEnabled.checked = Boolean(settings.firecrawlEnabled);
  firecrawlApiKey.value = settings.firecrawlApiKey;
  firecrawlMaxUrls.value = settings.firecrawlMaxUrls;
}
