# my-study-app

An AI-powered PDF study assistant. Upload your textbooks and lecture notes, ask questions, and get structured answers from Claude, Gemini, or OpenAI — right in your browser.

## Features

- **Study Library** — Create named, color-coded classes to organize your PDFs
- **PDF Upload** — Drag-and-drop or file-picker; multiple PDFs per class
- **Book Selection** — Check which PDFs to include in each analysis
- **AI Chat** — Multi-turn conversation about your selected documents
- **Model Switcher** — Switch between Claude, Gemini, and OpenAI mid-conversation
- **Markdown Responses** — AI answers rendered with headers, bold, code, and lists
- **Page Range Filter** — Focus analysis on specific pages (e.g. `1-20`)
- **Persistent Storage** — Classes, chat history, API keys, and model preferences saved in `localStorage`

## How It Works

This is a **fully client-side** app — no backend, no server, no accounts. It runs entirely in your browser.

When you ask a question:
1. Selected PDFs are encoded as base64 and sent directly to the AI provider's API
2. The AI reads the actual PDF content and responds in the chat
3. Conversation history is maintained across messages and persisted in `localStorage`

**AI provider differences:**
- **Claude (Anthropic)** — Full native PDF support via the Messages API
- **Gemini (Google)** — Full native PDF support via the Generative Language API
- **OpenAI** — Does not support raw PDF uploads; the app includes file names and prompts you to paste text excerpts

## Setup

```bash
npm install
```

No `.env` file needed. API keys are entered through the Settings modal in the app.

## Running Locally

### Development (with hot reload)
```bash
npm run dev
# Opens at http://localhost:5173
```

### Production preview
```bash
npm run build
npm run preview
# Opens at http://localhost:4173
```

## Deploying Online

The app builds to a static `dist/` folder — no server required. Deploy anywhere that hosts static files.

### Vercel (recommended)
1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import your repo
3. Framework is auto-detected as Vite
4. Click **Deploy**

### Netlify
1. Push this repo to GitHub
2. Go to [netlify.com](https://netlify.com) → Add new site → Import from Git
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Click **Deploy site**

### GitHub Pages
1. Add `base: '/your-repo-name/'` to `vite.config.js`
2. Run `npm run build`
3. Push the `dist/` folder to the `gh-pages` branch (or use the `gh-pages` npm package)

## Getting API Keys

| Provider | Where to get the key | Key format |
|----------|---------------------|------------|
| **Claude** | [console.anthropic.com](https://console.anthropic.com) | `sk-ant-...` |
| **Gemini** | [aistudio.google.com](https://aistudio.google.com) | `AIza...` |
| **OpenAI** | [platform.openai.com](https://platform.openai.com) | `sk-...` |

Enter keys via the **Settings** button (gear icon) in the app — they are stored only in your browser's `localStorage`.

## Available Models

| Provider | Models |
|----------|--------|
| Claude | Opus 4.5, Sonnet 4.5, Haiku 4.5 |
| Gemini | 2.0 Flash, 1.5 Pro, 1.5 Flash |
| OpenAI | GPT-4o, GPT-4o mini, o1 mini |

## Known Limitations

- **OpenAI**: Does not support raw PDF binary uploads — paste text excerpts for best results
- **Storage**: All data lives in `localStorage`; clearing browser data removes everything
- **No export**: Chat history cannot be downloaded (localStorage only)
- **No auth**: API keys are stored unencrypted in the browser

## Tech Stack

- [React 19](https://react.dev) + [Vite 8](https://vite.dev)
- No TypeScript, no backend, no database
- Direct browser-to-API calls (CORS enabled by all three providers)
