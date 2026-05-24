
**BlnqAI — Chat Interface Prompt**

> Build a fully responsive, mobile-first AI chat interface called **BlnqAI** powered by DigitalOcean Serverless Inference using the GPT-OSS 120B model. Built on Next.js 15 App Router, Supabase, Cloudflare Workers. TypeScript throughout.
>
> ---
>
> ## Provider Setup
>
> DigitalOcean Serverless Inference is OpenAI API-compatible. Use the OpenAI SDK pointed at the DO endpoint:
>
> ```typescript
> import OpenAI from 'openai';
>
> const client = new OpenAI({
>   apiKey: process.env.DO_INFERENCE_API_KEY, // store in .env, never hardcoded
>   baseURL: 'https://inference.do-ai.run/v1',
> });
>
> const response = await client.chat.completions.create({
>   model: 'openai/gpt-4o', // swap for DO's GPT-OSS 120B model string
>   messages: conversationHistory,
>   stream: true,
>   max_tokens: 2048,
> });
> ```
>
> Store the API key exclusively in:
> - `.env.local` for local dev: `DO_INFERENCE_API_KEY=your_key_here`
> - Cloudflare Workers secret: `wrangler secret put DO_INFERENCE_API_KEY`
> - Never in source code, client-side bundles, or prompts
>
> ---
>
> ## Architecture
>
> ```
> User (mobile/desktop)
>      │
>      ▼
> Next.js frontend (streaming UI)
>      │
>      ▼
> Cloudflare Worker (/api/chat)
>   - Auth check (Supabase JWT)
>   - Rate limiting (KV)
>   - Conversation history management
>      │
>      ▼
> DigitalOcean Serverless Inference
>   GPT-OSS 120B
>      │
>      ▼
> Streamed response → client
> ```
>
> ---
>
> ## Database Schema
>
> ```sql
> create table conversations (
>   id uuid primary key default gen_random_uuid(),
>   user_id uuid references profiles,
>   title text,
>   model text default 'gpt-oss-120b',
>   created_at timestamptz default now(),
>   updated_at timestamptz default now()
> );
>
> create table messages (
>   id uuid primary key default gen_random_uuid(),
>   conversation_id uuid references conversations,
>   role text not null, -- system | user | assistant
>   content text not null,
>   tokens_used int,
>   created_at timestamptz default now()
> );
>
> create table agent_usage (
>   user_id uuid references profiles,
>   date date default current_date,
>   message_count int default 0,
>   tokens_used int default 0,
>   primary key (user_id, date)
> );
> ```
>
> RLS: users can only access their own conversations and messages.
>
> ---
>
> ## Rate Limiting
>
> ```typescript
> const CHAT_LIMITS = {
>   guest:    { messagesPerDay: 10,  messagesPerHour: 5  },
>   free:     { messagesPerDay: 20,  messagesPerHour: 10 },
>   pro:      { messagesPerDay: 200, messagesPerHour: 50 },
>   ultimate: { messagesPerDay: 500, messagesPerHour: 100 },
> };
> ```
>
> Track in Cloudflare KV:
> ```typescript
> const key = `chat:${userId}:${today}`;
> const count = parseInt(await kv.get(key) ?? '0');
> if (count >= CHAT_LIMITS[tier].messagesPerDay) {
>   return new Response(JSON.stringify({
>     error: 'Daily message limit reached. Upgrade for more.'
>   }), { status: 429 });
> }
> await kv.put(key, String(count + 1), { expirationTtl: 86400 });
> ```
>
> ---
>
> ## Streaming API Route
>
> `POST /api/chat`
>
> ```typescript
> // Cloudflare Worker
> export async function POST(request: Request, env: Env) {
>   const { message, conversationId, systemPrompt } = await request.json();
>
>   // Auth + rate limit checks
>   const user = await verifyAuth(request, env);
>   if (!user) return new Response('Unauthorized', { status: 401 });
>   await enforceRateLimit(user.id, user.tier, env);
>
>   // Load conversation history from Supabase (last 20 messages)
>   const history = await getConversationHistory(conversationId, 20);
>
>   // Build messages array
>   const messages = [
>     {
>       role: 'system',
>       content: systemPrompt ?? 'You are BlinqAI, a helpful, intelligent assistant.'
>     },
>     ...history,
>     { role: 'user', content: message }
>   ];
>
>   // Stream from DO Inference
>   const stream = await client.chat.completions.create({
>     model: 'gpt-oss-120b', // confirm exact model string in DO dashboard
>     messages,
>     stream: true,
>     max_tokens: 2048,
>     temperature: 0.7,
>   });
>
>   // Return as SSE stream
>   const encoder = new TextEncoder();
>   const readable = new ReadableStream({
>     async start(controller) {
>       let fullResponse = '';
>       for await (const chunk of stream) {
>         const delta = chunk.choices[0]?.delta?.content ?? '';
>         fullResponse += delta;
>         controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
>       }
>       // Save completed message to Supabase
>       await saveMessage(conversationId, 'user', message);
>       await saveMessage(conversationId, 'assistant', fullResponse);
>       await updateUsage(user.id, fullResponse);
>       controller.enqueue(encoder.encode('data: [DONE]\n\n'));
>       controller.close();
>     }
>   });
>
>   return new Response(readable, {
>     headers: {
>       'Content-Type': 'text/event-stream',
>       'Cache-Control': 'no-cache',
>       'Connection': 'keep-alive',
>     }
>   });
> }
> ```
>
> ---
>
> ## Frontend Interface
>
> Build the chat UI as a Next.js page at `/chat`. Design to GPT-style standards with your Midnight Gilt aesthetic (dark background `#0a0e1a`, cyan `#00d4ff`, violet `#7c3aed`).
>
> **Layout (desktop):**
> ```
> ┌─────────────────────────────────────────────┐
> │  Sidebar (260px)    │   Chat Area            │
> │  ─────────────────  │  ─────────────────     │
> │  + New Chat         │  [Message bubbles]     │
> │                     │                        │
> │  Today              │                        │
> │  > Conversation 1   │                        │
> │  > Conversation 2   │                        │
> │                     │                        │
> │  Yesterday          │  [Input bar]           │
> │  > Conversation 3   │                        │
> └─────────────────────────────────────────────┘
> ```
>
> **Layout (mobile):**
> - Sidebar hidden by default, opens via hamburger icon
> - Full-width chat area
> - Input bar pinned to bottom with `position: sticky`
> - Keyboard-aware: input bar shifts up when virtual keyboard opens (`visualViewport` API)
> - Tap outside sidebar to close
>
> ---
>
> ## UI Components
>
> **Sidebar**
> - "New Chat" button at top with `+` icon, cyan accent
> - Conversation list grouped by: Today, Yesterday, Last 7 Days, Older
> - Each item: truncated title (auto-generated from first message), hover reveals delete icon
> - Active conversation highlighted with violet left border
> - Bottom: user avatar, display name, tier badge, settings link
> - Collapsible on desktop via toggle button
>
> **Chat Area**
> - Empty state: BlinqAI logo centered, 4 suggested prompt chips
> - Messages: user messages right-aligned in cyan-tinted bubble, assistant messages left-aligned in dark card
> - Assistant responses render full Markdown: headers, bold, italic, code blocks with syntax highlighting (shiki), tables, lists
> - Code blocks: language label top-left, copy button top-right
> - Streaming: animated cursor `▌` at end of in-progress response
> - Smooth scroll to bottom on new message
> - Scroll-to-bottom FAB appears when user scrolls up
>
> **Input Bar**
> - Textarea (auto-resize, max 6 lines) with placeholder "Message BlinqAI..."
> - Send button (cyan, arrow icon) — disabled when empty or loading
> - `Enter` to send, `Shift+Enter` for new line
> - Attach file button (Pro+) — uploads to R2, appends as context
> - Stop generation button replaces send button during streaming
> - Character counter appears at 800+ chars
> - Below input: "BlinqAI can make mistakes. Verify important information."
>
> **Message Actions (on hover/long-press)**
> - Copy message
> - Regenerate response (assistant messages only)
> - Delete message
> - Thumbs up / thumbs down feedback
>
> ---
>
> ## Conversation Management
>
> - Auto-generate conversation title from first user message via a second DO Inference call:
> ```typescript
> const title = await client.chat.completions.create({
>   model: 'gpt-oss-120b',
>   messages: [{
>     role: 'user',
>     content: `Generate a 4-6 word title for a conversation that starts with: "${firstMessage}". Return only the title, no quotes.`
>   }],
>   max_tokens: 20
> });
> ```
> - Rename conversation: double-click title in sidebar to inline-edit
> - Delete conversation: confirm modal, removes all messages and the row
> - Search conversations: search bar in sidebar filters by title and message content via Supabase full-text search
>
> ---
>
> ## System Prompt Customization (Pro+)
>
> Add a "Customize BlinqAI" panel accessible from the input bar or settings:
> - Custom system prompt textarea (max 1000 chars)
> - Persona name override (replaces "BlinqAI" in responses)
> - Tone selector: Default / Professional / Casual / Technical / Creative
> - Stored per-user in Supabase `profiles.agent_settings jsonb`
>
> ---
>
> ## Additional Features
>
> **Suggested prompts**
> Four chips on the empty state, cycling randomly from a preset list of 20. Clicking auto-fills the input.
>
> **Message search**
> `Cmd/Ctrl+K` opens a search modal searching across all conversations via Supabase full-text search on the messages table.
>
> **Export conversation**
> Download current conversation as Markdown or plain text file.
>
> **Usage indicator**
> Subtle progress bar above input showing daily messages used vs limit. Clicking opens upgrade prompt for free users.
>
> **Regenerate**
> On any assistant message, regenerate re-sends the previous user message and streams a new response, replacing the old one.
>
> **Stop generation**
> Abort controller cancels the SSE stream. Partial response is saved as-is.
>
> ---
>
> ## Mobile-Specific Requirements
>
> - Minimum tap target 44x44px on all interactive elements
> - No hover-only interactions — all hover states also work on long-press
> - Virtual keyboard handling via `visualViewport` resize event — chat area shrinks, input stays visible
> - Swipe right on chat area to open sidebar
> - Pull-to-refresh loads latest conversations
> - Font size minimum 16px on inputs to prevent iOS auto-zoom
> - Safe area insets respected: `padding-bottom: env(safe-area-inset-bottom)`
>
> ---
>
> ## Environment Variables
>
> ```env
> DO_INFERENCE_API_KEY=        # DigitalOcean Inference key — rotate after use
> DO_INFERENCE_BASE_URL=https://inference.do-ai.run/v1
> DO_INFERENCE_MODEL=gpt-oss-120b
> ```
>
> Never expose `DO_INFERENCE_API_KEY` to the client bundle. All inference calls go through the Cloudflare Worker.
>
> ---
>
> Do not modify any existing platform logic. Add BlinqAI as a self-contained module at `/chat` alongside the existing file host and image generation features.

---

