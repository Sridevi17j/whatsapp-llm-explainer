const DEFAULT_SETTINGS = {
  provider: "gemini",
  model: "gemini-2.5-flash-lite",
  apiKey: "",
  contextMessages: 8,
  redactNames: false,
  firecrawlEnabled: false,
  firecrawlApiKey: "",
  firecrawlMaxUrls: 2
};

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  const existing = await chrome.storage.local.get("settings");
  if (!existing.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab?.id && tab.url?.startsWith("https://web.whatsapp.com/")) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "CAPTURE_SELECTION" });
    } catch (_) {
      // The side panel can still open even if the content script is unavailable.
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "OPEN_EXPLAINER") {
    openExplainer(sender.tab?.id).then(sendResponse);
    return true;
  }

  if (message?.type === "LLM_EXPLAIN") {
    explainMessage(message.payload).then(sendResponse);
    return true;
  }

  if (message?.type === "LLM_TEST") {
    testProvider().then(sendResponse);
    return true;
  }
});

async function openExplainer(tabId) {
  if (!tabId) return { ok: false, error: "No active WhatsApp tab found." };
  await chrome.sidePanel.open({ tabId });
  return { ok: true };
}

async function getSettings() {
  const stored = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
}

async function explainMessage(payload) {
  try {
    const settings = await getSettings();
    const linkContext = await buildLinkContext(payload, settings);
    const prompt = buildPrompt(payload, linkContext);
    return await callProvider(prompt, settings);
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

async function testProvider() {
  try {
    const settings = await getSettings();
    return await callProvider("Reply exactly: Provider test OK", settings);
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
}

async function callProvider(prompt, settings) {
  if (settings.provider === "groq") {
    return await callGroq(prompt, settings);
  }

  if (settings.provider === "openrouter") {
    return await callOpenRouter(prompt, settings);
  }

  if (settings.provider === "gemini") {
    return await callGemini(prompt, settings);
  }

  return await callPollinations(prompt, settings);
}

async function callGemini(prompt, settings) {
  if (!settings.apiKey) throw new Error("Gemini API key is missing. Add it in extension options.");

  const model = encodeURIComponent(settings.model || "gemini-2.5-flash-lite");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": settings.apiKey
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.2
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini failed: HTTP ${response.status}: ${await readErrorMessage(response)}`);
  }

  const json = await response.json();
  const text = (json.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || "")
    .join("")
    .trim();

  return { ok: true, text: text || "No answer returned.", provider: "gemini" };
}

function buildPrompt(payload, linkContext = "") {
  const question = payload?.question?.trim() || "Explain this";
  const selected = payload?.selectedText?.trim() || "";
  const context = (payload?.context || []).filter(Boolean).join("\n");
  const conversation = formatConversation(payload?.conversation || []);

  return [
    "You are helping a user understand a WhatsApp group chat.",
    "The text may be in English, Hindi, Telugu, Tamil, Kannada, or mixed language.",
    "Answer the user's question directly, briefly, and in very simple everyday language.",
    "Write like you are explaining to a busy friend.",
    "Avoid jargon, corporate-sounding wording, and long sentences.",
    "Do not use fixed sections unless the user asks for them.",
    "Prefer 1-3 short sentences or 2-3 tiny bullets if that is easier to read.",
    "Do not invent facts. If the selected text does not contain enough context, say that briefly.",
    "Only suggest a reply if the user asks what to reply or if a reply is clearly needed.",
    "For follow-up questions, use the original WhatsApp context as the source of truth and use prior Q/A only to understand references.",
    "",
    "Conversation so far:",
    conversation || "(none)",
    "",
    "Selected message:",
    selected,
    "",
    "Nearby context:",
    context || "(none)",
    "",
    "Linked page context:",
    linkContext || "(not fetched)",
    "",
    `User question: ${question}`
  ].join("\n");
}

function formatConversation(conversation) {
  return conversation
    .filter((item) => item?.role && item?.text)
    .slice(-8)
    .map((item) => `${item.role === "assistant" ? "Assistant" : "User"}: ${item.text}`)
    .join("\n");
}

async function buildLinkContext(payload, settings) {
  if (!settings.firecrawlEnabled) return "";
  if (!settings.firecrawlApiKey) {
    throw new Error("Firecrawl API key is missing. Add it in extension options or disable link scraping.");
  }

  const text = [payload?.selectedText || "", ...(payload?.context || [])].join("\n");
  const urls = extractUrls(text).slice(0, Number(settings.firecrawlMaxUrls || 2));
  if (!urls.length) return "";

  const results = [];
  for (const url of urls) {
    try {
      const scraped = await scrapeWithFirecrawl(url, settings.firecrawlApiKey);
      results.push(`URL: ${url}\n${scraped}`);
    } catch (error) {
      results.push(`URL: ${url}\nCould not fetch with Firecrawl: ${error.message || String(error)}`);
    }
  }

  return results.join("\n\n");
}

function extractUrls(text) {
  const matches = String(text || "").match(/https?:\/\/[^\s<>"')]+/gi) || [];
  return unique(matches.map((url) => url.replace(/[.,;:!?]+$/, "")));
}

async function scrapeWithFirecrawl(url, apiKey) {
  const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      onlyMainContent: true,
      timeout: 30000
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await readErrorMessage(response)}`);
  }

  const json = await response.json();
  const markdown = json.data?.markdown || json.markdown || "";
  return truncateText(markdown || "No markdown returned.", 4000);
}

function truncateText(text, maxLength) {
  const cleaned = String(text || "").replace(/\n{3,}/g, "\n\n").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength)}\n...[truncated]`;
}

async function callPollinations(prompt, settings) {
  const model = encodeURIComponent(settings.model || "openai-fast");
  const encodedPrompt = encodeURIComponent(prompt);
  const url = `https://text.pollinations.ai/${encodedPrompt}?model=${model}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Pollinations failed: HTTP ${response.status}`);
  }

  return { ok: true, text: await response.text(), provider: "pollinations" };
}

async function callGroq(prompt, settings) {
  if (!settings.apiKey) throw new Error("Groq API key is missing. Add it in extension options.");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model || "llama-3.1-8b-instant",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    throw new Error(`Groq failed: HTTP ${response.status}: ${await readErrorMessage(response)}`);
  }

  const json = await response.json();
  return { ok: true, text: json.choices?.[0]?.message?.content || "", provider: "groq" };
}

async function callOpenRouter(prompt, settings) {
  if (!settings.apiKey) throw new Error("OpenRouter API key is missing. Add it in extension options.");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${settings.apiKey}`,
      "HTTP-Referer": "https://web.whatsapp.com",
      "X-Title": "WhatsApp LLM Explainer"
    },
    body: JSON.stringify({
      model: settings.model || "meta-llama/llama-3.1-8b-instruct:free",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    throw new Error(`OpenRouter failed: HTTP ${response.status}: ${await readErrorMessage(response)}`);
  }

  const json = await response.json();
  return { ok: true, text: json.choices?.[0]?.message?.content || "", provider: "openrouter" };
}

async function readErrorMessage(response) {
  const raw = await response.text();
  if (!raw) return "No error body returned.";

  try {
    const json = JSON.parse(raw);
    return json.error?.message || json.message || raw.slice(0, 500);
  } catch (_) {
    return raw.slice(0, 500);
  }
}

function unique(items) {
  return Array.from(new Set(items));
}
