# WhatsApp LLM Explainer

A local Chrome extension that explains selected WhatsApp Web messages from Chrome's side panel.

## Privacy model

- The extension is user-triggered. It captures text only when you select WhatsApp text and click `Explain selected`, or when you use the extension icon with text already selected.
- Phone numbers, emails, and handles are redacted before the text is sent to the LLM. Links are preserved because they can be useful context.
- The extension also reads link `href`s from the selected WhatsApp message DOM, because browser text selection can miss URLs rendered as link previews.
- Sender/contact identity lines are replaced with stable aliases like `Person 1` and `Person 2` when the extension can detect them from WhatsApp metadata or contact blocks.
- Normal message body text is not name-scanned or globally rewritten, so content words are preserved.
- Plain `Name: message` lines are treated as message body unless WhatsApp provides timestamp metadata, because arbitrary colon text is too risky to classify as a sender.
- The default provider is Gemini, which requires your own API key and has an official free tier.
- For additional options, configure Groq or OpenRouter in the extension options.

## Local install

1. Unzip the extension if you received it as a zip.
2. Open Chrome and go to `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select the `whatsapp-llm-explainer` folder.
6. Open `https://web.whatsapp.com` and sign in.
7. Select message text in WhatsApp Web.
8. Click the blue `Explain selected` button that appears above the selection.
9. Chrome's side panel opens. Click `Explain message`.
10. Ask follow-up questions in the same side panel without reselecting the WhatsApp message.

If the selection button does not appear, keep the text selected and click the extension icon. The side panel should still use the selected text.

Follow-up context is maintained internally, but the UI shows only the latest answer to avoid scrolling through old responses. Follow-up chat resets automatically when you select a new WhatsApp message/block. `Clear chat` clears only the side-panel Q/A, not the selected WhatsApp context.

## Settings

Right-click the extension icon and choose `Options`, or click `S` in the side panel.
Use `Test provider` after saving a provider/model/API key to verify the API call before testing on WhatsApp text.

Firecrawl link scraping is optional and requires a Firecrawl API key. When enabled, the extension scrapes selected `https://` links with Firecrawl's `/v2/scrape` endpoint and adds a short markdown excerpt to the LLM prompt.

Recommended:

- Provider: `Gemini, free tier key`
- Model: `gemini-2.5-flash-lite`
- API key: create one in Google AI Studio

Optional:

- Provider: `Groq`
- Model: `llama-3.1-8b-instant`
- API key: your Groq key

Optional:

- Provider: `OpenRouter`
- Model: `meta-llama/llama-3.1-8b-instruct:free`
- API key: your OpenRouter key

## Known limitations

- WhatsApp Web changes its internal HTML often. If selection capture stops working, the content script selectors may need an update.
- The extension does not read encrypted WhatsApp messages directly. It only reads message text already rendered in your browser after you sign in.
- Avoid using it on private chats without consent from people involved.
- This is an independent local extension and is not affiliated with WhatsApp, Meta, Google, OpenRouter, Groq, or Firecrawl.
