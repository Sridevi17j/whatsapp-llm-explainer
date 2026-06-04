# WhatsApp LLM Explainer

WhatsApp group chats can move fast, include unfamiliar references, and be hard to understand out of context. Usually, you have to copy the chat, manually remove phone numbers/names, paste it into an LLM, and then ask what it means.

This Chrome extension removes that friction. Select a WhatsApp Web message, click `Explain selected`, and ask an LLM about it from the side panel.

Before sending text to the LLM, the extension redacts phone numbers and maps detected contact names to aliases like `Person 1`, `Person 2`. The actual message content is preserved.

## Install

1. Unzip the extension if you received it as a zip.
2. Open Chrome and go to `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select the `whatsapp-llm-explainer` folder.

## Set API Key

1. In `chrome://extensions`, find `WhatsApp LLM Explainer`.
2. Click `Details`.
3. Click `Extension options`.
4. Choose provider: `OpenRouter`.
5. Set model: `openrouter/free`.
6. Paste your OpenRouter API key.
7. Click `Save settings`.
8. Click `Test provider` to verify the key works.

## Use

1. Open `https://web.whatsapp.com`.
2. Select the message text you want to understand.
3. Click `Explain selected`.
4. In the side panel, click `Explain message`.
5. Ask follow-up questions in the same panel.

The side panel keeps follow-up context internally, but only shows the latest answer to keep the UI easy to read.

## Optional Settings

- `Context messages`: how many nearby WhatsApp messages to include for context. Set `0` if you want to send only selected text.
- `Firecrawl`: optional link scraping. Requires a Firecrawl API key.
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
