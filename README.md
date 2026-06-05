# WhatsApp LLM Explainer

I’m part of a few GenAI/tech WhatsApp groups where people discuss papers, tools, benchmarks, agents, coding workflows, model behavior, and new AI terms.

Many times, the discussion is useful, but the topic itself is hard to understand. Someone may mention a new technique, a benchmark, a model behavior, or a link, and I just want to quickly ask: what does this mean?

Earlier, I was copying chunks of WhatsApp chat into an LLM. Those copied chunks often included phone numbers or contact details from the chat, so I had to clean them up manually before asking for an explanation.

WhatsApp LLM Explainer makes that easier. Select a WhatsApp Web message, click `Explain selected`, and ask an LLM about it from the side panel. Before sending text to the LLM, it redacts phone numbers and maps detected contact names to aliases like `Person 1`, `Person 2`, while preserving the actual message content.

## Install

1. Unzip the extension if you received it as a zip.
2. Open Chrome and go to `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select the `whatsapp-llm-explainer` folder.

## Set API Keys

Recommended LLM provider: `OpenRouter`. It has free model options, including `openrouter/free`, though free limits can change.

1. In `chrome://extensions`, find `WhatsApp LLM Explainer`.
2. Click `Details`.
3. Click `Extension options`.
4. Choose provider: `OpenRouter`.
5. Set model: `openrouter/free`.
6. Paste your OpenRouter API key.
7. Click `Save settings`.
8. Click `Test provider` to verify the key works.

Recommended for links: `Firecrawl`. If the selected WhatsApp text includes a URL, Firecrawl can fetch the page content so the LLM can explain the actual link instead of guessing from the URL alone. Firecrawl also has a free-tier option and requires its own API key.

To enable Firecrawl:

1. Turn on `Scrape selected links with Firecrawl`.
2. Paste your Firecrawl API key.
3. Set `Firecrawl max URLs`.
4. Click `Save settings`.

## Use

1. Open `https://web.whatsapp.com`.
2. Select the message text you want to understand.
3. Click `Explain selected`.
4. In the side panel, click `Explain message`.
5. Ask follow-up questions in the same panel.

The side panel keeps follow-up context internally, but only shows the latest answer to keep the UI easy to read.

## Optional Settings

- `Context messages`: how many nearby WhatsApp messages to include for context. Set `0` if you want to send only selected text.
- `Firecrawl`: optional link scraping. Requires a Firecrawl API key and has a free-tier option.
- `Groq`: optional alternative LLM provider.
- `Gemini`: available, but OpenRouter is the recommended tested setup.

## Privacy Notes

- The extension is user-triggered.
- It only reads WhatsApp text already rendered in your browser.
- Phone numbers, emails, and handles are redacted before sending to the LLM.
- Contact identity lines are converted to stable aliases when detected.
- Links are preserved because they are often important context.
- Avoid using it on private chats without consent from people involved.

This is an independent local extension and is not affiliated with WhatsApp, Meta, Google, OpenRouter, Groq, or Firecrawl.
