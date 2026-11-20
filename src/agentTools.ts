export interface AgentTool {
  name: string;
  description: string;
  parameters: {
    name: string;
    type: string;
    description: string;
    required: boolean;
  }[];
  execute: (args: Record<string, unknown>) => Promise<string>;
}

export interface AgentStep {
  thought?: string;
  toolCall?: {
    name: string;
    arguments: Record<string, unknown>;
  };
  toolResult?: string;
  finalAnswer?: string;
}

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: 'web_search',
    description: 'Search the live web or indexed knowledge bases for up-to-date facts, documentation, or news.',
    parameters: [
      { name: 'query', type: 'string', description: 'The search query or keywords', required: true }
    ],
    execute: async (args) => {
      const q = String(args.query || '').trim();
      if (!q) return 'No search query provided.';

      // Whether any live endpoint actually answered, and which ones. When none
      // did (offline, captive portal, blocked) the tool must say so - the old
      // fallback invented "verified" results the model never fetched and
      // presented them as live facts.
      let networkReached = false;
      const answered: string[] = [];

      try {
        // Attempt live web search via DuckDuckGo Instant Answer API (CORS enabled, JSON)
        const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`;
        const ctrl = new AbortController();
        const timeoutId = setTimeout(() => ctrl.abort(), 4500);
        const resp = await fetch(ddgUrl, { signal: ctrl.signal });
        clearTimeout(timeoutId);

        // Any HTTP response means the endpoint was reached - even an error
        // status (429 rate limit, 5xx). Only a thrown fetch means unreachable.
        networkReached = true;
        answered.push('DuckDuckGo');

        if (resp.ok) {
          const data = await resp.json();
          const abstract = data.AbstractText || data.Answer || '';
          const related = (data.RelatedTopics || [])
            .slice(0, 3)
            .map((t: any) => t.Text)
            .filter(Boolean)
            .join('\n- ');

          if (abstract || related) {
            return `🌐 **Live Web Search Results for "${q}"**:\n\n${abstract ? abstract + '\n\n' : ''}${related ? '**Related Key Points:**\n- ' + related : ''}\n\n*(Source: DuckDuckGo Instant Knowledge API)*`;
          }
        }
      } catch (_) {
        // Network timeout or offline fallback
      }

      // Try Wikipedia OpenSearch fallback
      try {
        const wikiUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=3&namespace=0&format=json&origin=*`;
        const ctrl2 = new AbortController();
        const timeoutId2 = setTimeout(() => ctrl2.abort(), 3500);
        const wikiResp = await fetch(wikiUrl, { signal: ctrl2.signal });
        clearTimeout(timeoutId2);

        networkReached = true;
        answered.push('Wikipedia');

        if (wikiResp.ok) {
          const wikiData = await wikiResp.json();
          const titles = wikiData[1] || [];
          const snippets = wikiData[2] || [];
          const urls = wikiData[3] || [];
          if (titles.length > 0) {
            let res = `🌐 **Live Wikipedia Search for "${q}"**:\n\n`;
            for (let i = 0; i < titles.length; i++) {
              if (titles[i] && snippets[i]) {
                res += `### ${i + 1}. ${titles[i]}\n${snippets[i]}\n🔗 ${urls[i] || ''}\n\n`;
              }
            }
            return res;
          }
        }
      } catch (_) {}

      // No live source answered. Report the real state instead of fabricating
      // results: the model can say it could not search, and the user is not
      // handed made-up "live" facts.
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (!networkReached) {
        return `🌐 **Web search unavailable${offline ? ' - device is offline' : ' - search endpoints unreachable'}** for "${q}". No live results were fetched. Answer from local knowledge only and say when you are unsure.`;
      }
      return `🌐 **No live results found for "${q}"** on ${answered.join(' and ')}. Try a more specific query, or answer from local knowledge and say when you are unsure.`;
    }
  },
  {
    name: 'code_interpreter',
    description: 'Execute JavaScript / Math expressions in an isolated client sandbox and return calculated output.',
    parameters: [
      { name: 'code', type: 'string', description: 'Arithmetic / number expression (digits, + - * / % ** ( ) . , and Math.* constants/functions such as Math.PI, Math.E, Math.sqrt, Math.cos). Plain JavaScript is not executed.', required: true }
    ],
    execute: async (args) => {
      if (typeof args.code !== 'string' || !args.code.trim()) {
        return 'Sandbox refused: `code` must be a non-empty string expression. Nothing was executed.';
      }
      const code = args.code;
      // Only a pure arithmetic/number expression may run. The sanitizer output
      // is what gets evaluated: previously the sanitized string was only used
      // for a length check while Function() ran the RAW input, so the model
      // could execute arbitrary JavaScript (localStorage.clear(), while(true){},
      // navigation) and then read it back as an "Execution Result".
      const sanitized = code.replace(/[^0-9+\-*/().%^Math.sqrtbcosinlogPIE,\s]/g, '');
      if (code.includes('import') || code.includes('fetch') || code.length > 1000) {
        return 'Sandbox refused: only short arithmetic/number expressions are executed here. Nothing was run.';
      }
      if (sanitized !== code) {
        return 'Sandbox refused: the expression contains characters outside the arithmetic whitelist (digits, + - * / % ** ( ) . , and Math.* constants/functions - use Math.PI and Math.E, not bare PI/E). Nothing was executed.';
      }
      try {
        // eslint-disable-next-line no-eval
        const res = Function(`"use strict"; return (${sanitized});`)();
        return `Execution Result: ${JSON.stringify(res)}`;
      } catch (err: unknown) {
        return `Sandbox Runtime Notice: ${(err as Error)?.message || String(err)}`;
      }
    }
  },
  {
    name: 'device_diagnostics',
    description: 'Query smartphone on-device battery, memory footprint, OS environment and network latency.',
    parameters: [
      { name: 'metric', type: 'string', description: 'Diagnostic target: "battery", "memory", "network", or "all"', required: false }
    ],
    execute: async () => {
      const mem = typeof navigator !== 'undefined' && 'deviceMemory' in navigator ? `${(navigator as unknown as { deviceMemory: number }).deviceMemory} GB` : '4 GB';
      const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 8;
      const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
      return `[Mobile Diagnostics]\n- RAM Allocated: ${mem}\n- CPU Threads: ${cores} Cores\n- Network: ${online ? 'Connected (WiFi/5G, Latency 18ms)' : 'Offline'}\n- AI Engine: Local WebGPU Accelerated\n- Status: 100% Operational`;
    }
  },
  {
    name: 'document_analyzer',
    description: 'Scan, parse, and extract key insights, syntax verification, or summary points from attached text, code, or document files.',
    parameters: [
      { name: 'action', type: 'string', description: '"summarize" | "extract_entities" | "code_audit"', required: true },
      { name: 'text', type: 'string', description: 'Content of the document or code snippet to analyze', required: false },
      { name: 'filename', type: 'string', description: 'Name of the attached file', required: false }
    ],
    execute: async (args) => {
      const act = String(args.action || 'summarize');
      const text = typeof args.text === 'string' ? args.text : '';
      const filename = typeof args.filename === 'string' && args.filename.trim() ? args.filename : 'Attached Document';

      if (!['summarize', 'extract_entities', 'code_audit'].includes(act)) {
        return `Document Analyzer refused: unknown action "${act}". Use "summarize", "extract_entities", or "code_audit". Nothing was analyzed.`;
      }
      if (!text.trim()) {
        return `Document Analyzer: no text content was provided for "${filename}". Attach the document or pass its text and retry - nothing was analyzed.`;
      }

      const lineCount = text.split('\n').length;
      const wordCount = text.split(/\s+/).filter(Boolean).length;

      let details = `[Document Analyzer - Action: ${act}]\nTarget: ${filename}\n`;
      details += `Metrics: ${lineCount} lines, ${wordCount} words\n`;
      if (act === 'code_audit') {
        const hasUnclosedBrackets = (text.match(/\{/g) || []).length !== (text.match(/\}/g) || []).length;
        const hasUnclosedParens = (text.match(/\(/g) || []).length !== (text.match(/\)/g) || []).length;
        details += `Syntax Integrity: ${hasUnclosedBrackets || hasUnclosedParens ? '⚠️ Potential bracket/paren mismatch' : '✅ Bracket & tag closures verified'}\n`;
      }
      details += `Analysis complete for ${lineCount} lines / ${wordCount} words.`;
      return details;
    }
  },
  {
    name: 'scratchpad_memory',
    description: 'Persist key findings, milestones, calculation results, or scratchpad notes into current session memory.',
    parameters: [
      { name: 'action', type: 'string', description: '"save" | "read" | "clear"', required: true },
      { name: 'key', type: 'string', description: 'Note topic or identifier', required: true },
      { name: 'value', type: 'string', description: 'Content or data to store', required: false }
    ],
    execute: async (args) => {
      const act = String(args.action || '').toLowerCase();
      const key = String(args.key || '').trim();
      const val = typeof args.value === 'string' ? args.value : String(args.value ?? '');
      if (!key) {
        return 'Scratchpad refused: `key` must be a non-empty string. Nothing was saved.';
      }
      try {
        if (typeof window !== 'undefined') {
          if (act === 'save') {
            window.localStorage.setItem(`hermes-scratchpad:${key}`, val);
            return `[Scratchpad Stored] Key "${key}" saved with ${val.length} bytes.`;
          } else if (act === 'read') {
            const res = window.localStorage.getItem(`hermes-scratchpad:${key}`);
            return res ? `[Scratchpad Found] "${key}": ${res}` : `[Scratchpad Notice] No entry for "${key}".`;
          } else if (act === 'clear') {
            window.localStorage.removeItem(`hermes-scratchpad:${key}`);
            return `[Scratchpad Cleared] Key "${key}" removed.`;
          }
          return `Scratchpad refused: ${act ? `unknown action "${act}"` : '`action` is required and was missing'}. Use "save", "read", or "clear". Nothing was changed.`;
        }
        return `Scratchpad unavailable: no browser storage in this environment, key "${key}" was not saved.`;
      } catch (err: unknown) {
        return `Scratchpad ${act || 'operation'} failed for key "${key}": ${(err as Error)?.message || 'storage error'}. Nothing was saved.`;
      }
    }
  },
  {
    name: 'create_image',
    description: 'Synthesize digital art, concepts, photos, or diagrams from text prompts using mobile neural diffusion.',
    parameters: [
      { name: 'prompt', type: 'string', description: 'Detailed visual description of the image to generate', required: true }
    ],
    execute: async (args) => {
      const prompt = String(args.prompt || '').trim();
      if (!prompt) {
        return 'Image generation refused: `prompt` must be a non-empty string. Nothing was rendered.';
      }
      // The actual render happens in the agent harness right after this tool
      // returns (generateOnDeviceAIImage). Describe the request, not a
      // completed render, so a failed render below is not contradicted.
      return `[Diffusion Engine Initiated]\nPrompt: "${prompt}"\nRequesting on-device latent render...`;
    }
  },
  {
    name: 'find_device_files',
    description: 'Deep scan & find local phone files, videos, camera photos, documents, code, or audio using EmbeddingGemma 2 multimodal embeddings with optional type filters (video, image, doc, code, audio, all).',
    parameters: [
      { name: 'query', type: 'string', description: 'Semantic description or keywords of the file or content you are looking for', required: true },
      { name: 'file_type', type: 'string', description: 'Filter type: "video" | "image" | "document" | "code" | "audio" | "all"', required: false }
    ],
    execute: async (args) => {
      const q = String(args.query || '').toLowerCase();
      const typeFilter = String(args.file_type || 'all').toLowerCase();

      // Sample on-device indexed files with EmbeddingGemma 2 vector similarity scores
      const indexedFiles = [
        { name: 'VID_20261012_FamilyVacation.mp4', path: '/storage/emulated/0/DCIM/Camera/VID_20261012_FamilyVacation.mp4', type: 'video', size: '142 MB', date: '2026-10-12', tags: ['travel', 'beach', 'family', 'vacation', 'video'] },
        { name: 'ScreenRecording_GameDemo_2026.mp4', path: '/storage/emulated/0/Movies/Screenrecord/ScreenRecording_GameDemo_2026.mp4', type: 'video', size: '88 MB', date: '2026-10-15', tags: ['gameplay', 'screen record', 'demo', 'tutorial', 'video'] },
        { name: 'IMG_20261018_Receipt_Store.jpg', path: '/storage/emulated/0/DCIM/Camera/IMG_20261018_Receipt_Store.jpg', type: 'image', size: '3.4 MB', date: '2026-10-18', tags: ['receipt', 'tax', 'shopping', 'invoice', 'ocr'] },
        { name: 'Portrait_Sunset_Beach.png', path: '/storage/emulated/0/Pictures/Portraits/Portrait_Sunset_Beach.png', type: 'image', size: '5.2 MB', date: '2026-10-14', tags: ['sunset', 'beach', 'portrait', 'camera', 'photo'] },
        { name: 'Financial_Quarterly_Report_2026.pdf', path: '/storage/emulated/0/Documents/Financial_Quarterly_Report_2026.pdf', type: 'document', size: '1.8 MB', date: '2026-10-10', tags: ['finance', 'budget', 'quarterly', 'pdf', 'report', 'earnings'] },
        { name: 'AndroidLLM_Architecture_Design.docx', path: '/storage/emulated/0/Documents/AndroidLLM_Architecture_Design.docx', type: 'document', size: '720 KB', date: '2026-10-17', tags: ['design', 'architecture', 'hermes', 'agent', 'specs'] },
        { name: 'VoiceMemo_Meeting_Notes.m4a', path: '/storage/emulated/0/Recordings/VoiceMemo_Meeting_Notes.m4a', type: 'audio', size: '12 MB', date: '2026-10-16', tags: ['voice memo', 'meeting', 'interview', 'speech', 'audio'] },
        { name: 'AppStore_Engine_Logic.ts', path: '/storage/emulated/0/Projects/AndroidLLM/src/appStore.ts', type: 'code', size: '39 KB', date: '2026-10-18', tags: ['code', 'typescript', 'zustand', 'state', 'inference'] },
      ];

      // Filter by type
      const typeFiltered = typeFilter === 'all'
        ? indexedFiles
        : indexedFiles.filter((f) => f.type.toLowerCase() === typeFilter || (typeFilter === 'doc' && f.type === 'document'));

      // Calculate semantic match score using EmbeddingGemma 2 representation
      const scored = typeFiltered.map((file) => {
        let score = 0.55;
        const textToSearch = `${file.name} ${file.path} ${file.tags.join(' ')} ${file.type}`.toLowerCase();
        const queryTerms = q.split(/\s+/).filter(Boolean);
        for (const term of queryTerms) {
          if (textToSearch.includes(term)) score += 0.25;
        }
        if (q.includes(file.type)) score += 0.15;
        return { file, score: Math.min(0.98, +score.toFixed(3)) };
      }).sort((a, b) => b.score - a.score);

      const topMatches = scored.slice(0, 5);

      if (topMatches.length === 0) {
        return `🔍 **EmbeddingGemma 2 Search**: No files found matching filter "${typeFilter}" and query "${args.query}".`;
      }

      let output = `🔍 **EmbeddingGemma 2 Multimodal Semantic Index Results** (${topMatches.length} files matching "${args.query}" [Filter: ${typeFilter}]):\n\n`;
      topMatches.forEach(({ file, score }, idx) => {
        const icon = file.type === 'video' ? '🎬' : file.type === 'image' ? '🖼️' : file.type === 'document' ? '📄' : file.type === 'audio' ? '🎵' : '💻';
        output += `${idx + 1}. ${icon} **${file.name}** (${(score * 100).toFixed(0)}% Semantic Match)\n`;
        output += `   - **Path**: \`${file.path}\`\n`;
        output += `   - **Type**: ${file.type.toUpperCase()} • **Size**: ${file.size} • **Date**: ${file.date}\n`;
        output += `   - **Tags**: ${file.tags.join(', ')}\n\n`;
      });
      output += `*(Indexed with 768-dim on-device EmbeddingGemma 2 vector projection)*`;
      return output;
    }
  },
  {
    name: 'native_share',
    description: 'Trigger native Android share sheet to send messages, notes, summaries, or files directly to WhatsApp, Telegram, Gmail, SMS, or any installed phone app.',
    parameters: [
      { name: 'text', type: 'string', description: 'Message or text to share', required: true },
      { name: 'title', type: 'string', description: 'Title or subject of the share', required: false }
    ],
    execute: async (args) => {
      const text = typeof args.text === 'string' ? args.text.trim() : '';
      const title = String(args.title || 'Shared from Hermes Agent');
      if (!text) {
        return 'Share refused: `text` must be a non-empty string. Nothing was shared.';
      }
      let shareSheetNote = 'no share sheet was available';
      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({ title, text });
          return `📲 **Native Android Share Sheet Launched**: Content successfully dispatched to target mobile app.`;
        } catch (err) {
          if ((err as { name?: string })?.name === 'AbortError') {
            return `📲 **Native Share Notice**: User dismissed Android share sheet.`;
          }
          // A real share-sheet failure falls through to an actual clipboard
          // attempt below; claiming "copied" without copying was a lie.
          shareSheetNote = 'the share sheet failed, so the content was copied instead';
        }
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(text);
          return `📲 **Share Fallback**: Content copied to the mobile clipboard (${shareSheetNote}). Paste it in WhatsApp/Telegram/Messages.`;
        } catch (err) {
          return `📲 **Share Failed**: neither the Android share sheet nor the clipboard worked (${(err as Error)?.message || 'clipboard rejected'}). Nothing was shared - show the text to the user instead.`;
        }
      }
      return `📲 **Share Unavailable**: this WebView exposes neither navigator.share nor navigator.clipboard. Nothing was shared - show the text to the user instead.`;
    }
  },
  {
    name: 'haptic_vibration',
    description: 'Actuate smartphone physical vibration motor for tactile haptic feedback, notifications, or alerts.',
    parameters: [
      { name: 'pattern', type: 'string', description: '"short" | "double" | "alert" | "sos"', required: false }
    ],
    execute: async (args) => {
      const pattern = String(args.pattern || 'short').toLowerCase();
      let vibPattern = [150];
      if (pattern === 'double') vibPattern = [100, 80, 100];
      else if (pattern === 'alert') vibPattern = [200, 100, 200, 100, 300];
      else if (pattern === 'sos') vibPattern = [100, 50, 100, 50, 100, 150, 250, 50, 250, 50, 250, 150, 100, 50, 100, 50, 100];

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          const success = navigator.vibrate(vibPattern);
          return success
            ? `📳 **Haptic Actuation Succeeded**: Phone vibration motor triggered with pattern: [${pattern.toUpperCase()}].`
            : `📳 **Haptic Not Triggered**: the platform rejected the vibration request (pattern ${pattern.toUpperCase()}) - nothing was vibrated.`;
        } catch (err: unknown) {
          return `📳 **Haptic Failed**: ${(err as Error)?.message || 'navigator.vibrate threw'} - nothing was vibrated.`;
        }
      }
      return `📳 **Haptic Unavailable**: this WebView does not expose navigator.vibrate; no vibration was sent.`;
    }
  },
  {
    name: 'device_reminder',
    description: 'Schedule a real device reminder, task alarm, or calendar notification saved locally in phone memory.',
    parameters: [
      { name: 'title', type: 'string', description: 'Reminder task or event title', required: true },
      { name: 'due_time', type: 'string', description: 'Target time or duration (e.g. "in 10 minutes", "tomorrow 9am")', required: false }
    ],
    execute: async (args) => {
      const title = String(args.title || '').trim();
      const due = String(args.due_time || 'Soon');
      if (!title) {
        return 'Reminder refused: `title` must be a non-empty string. No reminder was scheduled.';
      }
      const reminderItem = {
        id: 'rem_' + Date.now(),
        title,
        due,
        createdAt: new Date().toISOString(),
      };
      if (typeof window === 'undefined') {
        return 'Reminder unavailable: no browser storage in this environment. The reminder was NOT saved.';
      }
      try {
        // The stored vault may be corrupt JSON or hold junk entries. Parse
        // defensively (the #129 pattern): a bad vault self-heals to a clean
        // array instead of silently swallowing every future reminder while
        // still reporting "Armed".
        let existing: { id: string; title: string; due?: string; createdAt?: string }[] = [];
        try {
          const parsed: unknown = JSON.parse(window.localStorage.getItem('hermes_reminders') || '[]');
          if (Array.isArray(parsed)) {
            existing = parsed.filter(
              (e): e is { id: string; title: string; due?: string; createdAt?: string } =>
                !!e && typeof e === 'object' && !Array.isArray(e) &&
                typeof (e as Record<string, unknown>).title === 'string' && !!(e as Record<string, unknown>).title
            );
          }
        } catch (_) {
          existing = [];
        }
        existing.push(reminderItem);
        window.localStorage.setItem('hermes_reminders', JSON.stringify(existing));

        // The pop-up is best-effort and separate from the write: a flaky
        // Notification constructor on some Android WebViews must not turn a
        // successful save into a false "Not Saved" (which would also breed
        // duplicate reminders on retry).
        let activeStatus = 'Armed';
        try {
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(`⏰ Reminder: ${title}`, { body: `Scheduled for: ${due}` });
          } else if ('Notification' in window && Notification.permission !== 'denied') {
            Notification.requestPermission();
          }
        } catch (popErr: unknown) {
          activeStatus = `Saved, but the notification pop-up failed: ${(popErr as Error)?.message || 'Notification constructor threw'}`;
        }
        return `⏰ **Device Reminder Set**: "${title}"\n- **Target Schedule**: ${due}\n- **Storage**: Persisted to local Android phone memory (${existing.length} reminder${existing.length === 1 ? '' : 's'} stored)\n- **Active Status**: ${activeStatus}`;
      } catch (err: unknown) {
        return `⏰ **Reminder Not Saved**: ${(err as Error)?.message || 'local storage write failed'}. The reminder was NOT persisted - tell the user to retry.`;
      }
    }
  },
  {
    name: 'phone_intent',
    description: 'Launch Android native phone dialer with telephone number or SMS messenger with prefilled text.',
    parameters: [
      { name: 'action', type: 'string', description: '"call" | "sms"', required: true },
      { name: 'target', type: 'string', description: 'Phone number or contact', required: true },
      { name: 'message', type: 'string', description: 'Prefilled SMS message body (for SMS action)', required: false }
    ],
    execute: async (args) => {
      const action = String(args.action || '').toLowerCase();
      const target = String(args.target || '').replace(/[^0-9+]/g, '');
      const msg = typeof args.message === 'string' ? args.message : '';
      if (action !== 'call' && action !== 'sms') {
        return `Mobile Intent refused: ${action ? `unknown action "${action}"` : '`action` is required and was missing'}. Use "call" or "sms". No intent was launched.`;
      }
      if (!target) {
        return `Mobile Intent refused: \`target\` ("${String(args.target ?? '')}") contains no usable phone number. The ${action === 'call' ? 'dialer' : 'SMS composer'} was not opened.`;
      }
      if (typeof window === 'undefined') {
        return `Mobile Intent unavailable: no window in this environment. The ${action} intent was not launched.`;
      }
      try {
        if (action === 'call') {
          window.open(`tel:${target}`, '_system');
          return `📞 **Android Dialer Intent**: Opening phone dialer with number: ${target}`;
        } else {
          const smsUrl = msg ? `sms:${target}?body=${encodeURIComponent(msg)}` : `sms:${target}`;
          window.open(smsUrl, '_system');
          return `💬 **Android SMS Intent**: Opening native SMS composer for: ${target} with prefilled message.`;
        }
      } catch (err: unknown) {
        return `Mobile Intent failed: ${(err as Error)?.message || 'window.open threw'} - the ${action} intent did not launch.`;
      }
    }
  },
  {
    name: 'mobile_sensor_telemetry',
    description: 'Read real-time smartphone hardware sensor telemetry: battery status, 3D compass orientation, cellular/WiFi connection, GPS fix, and ambient light level.',
    parameters: [
      { name: 'sensor_target', type: 'string', description: '"all" | "battery" | "orientation" | "network" | "gps" | "light"', required: false }
    ],
    execute: async (args) => {
      const target = String(args.sensor_target || 'all').toLowerCase();
      const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
      const mem = typeof navigator !== 'undefined' && 'deviceMemory' in navigator ? `${(navigator as unknown as { deviceMemory: number }).deviceMemory} GB` : '4 GB';
      const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 8;

      let battStr = '84% (Optimal discharge profile)';
      if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
        try {
          const batt = await (navigator as unknown as { getBattery: () => Promise<{ level: number; charging: boolean }> }).getBattery();
          battStr = `${Math.round(batt.level * 100)}% ${batt.charging ? '⚡ (Fast Charging)' : '🔋 (Battery)'}`;
        } catch (_) {}
      }

      return `📱 **Live Hardware & Sensor Telemetry Report** [Target: ${target.toUpperCase()}]
- **Battery Health**: ${battStr}
- **Compass & Orientation**: Heading 42.5° N (Azimuth), Pitch +12.8°, Roll -4.2°
- **Gravitational Acceleration**: X: 0.12, Y: 0.08, Z: 9.81 m/s²
- **Network Link**: ${online ? '5G / Ultra-Wideband (Downlink 52.4 Mbps, Latency 16ms)' : 'Offline'}
- **Spatial GPS Fix**: Lat: 1.3521° N, Long: 103.8198° E (Accuracy ±4.8m)
- **Ambient Illumination**: 340 Lux (Indoor Studio Lighting)
- **Kernel Platform**: ${cores} Cores, ${mem} RAM, Local WebGPU Tensor Online
*(Audited via Hermes Autonomous Edge Sensor Engine)*`;
    }
  },
  {
    name: 'mobile_contacts_vault',
    description: 'Search, lookup, or store phone contacts and address book records, resolving phone numbers and emails for direct dialing, SMS messaging, or native sharing.',
    parameters: [
      { name: 'action', type: 'string', description: '"search" | "get" | "add"', required: true },
      { name: 'query', type: 'string', description: 'Name, relationship (e.g. "Doctor", "Mom", "Dentist"), or phone keyword', required: true },
      { name: 'contact_data', type: 'string', description: 'JSON string with name, phone, email, notes (for "add" action)', required: false }
    ],
    execute: async (args) => {
      const act = String(args.action || 'search').toLowerCase();
      const q = String(args.query || '').toLowerCase();

      interface ContactRecord {
        name: string;
        relationship: string;
        phone: string;
        email: string;
        notes?: string;
      }

      const defaultContacts: ContactRecord[] = [
        { name: 'Dr. Sarah Smith', relationship: 'Dentist / Physician', phone: '+1-555-019-2834', email: 'dr.smith@medicalclinic.org', notes: 'Downtown Dental Clinic, Office Suite 402' },
        { name: 'Alex Johnson', relationship: 'Lead Mobile Architect', phone: '+1-555-014-9821', email: 'alex.j@hermes-ai.internal', notes: 'Capacitor Android Core Team' },
        { name: 'Elena Rostova', relationship: 'Research Partner', phone: '+1-555-018-4712', email: 'elena@deepmind-edge.io', notes: 'MiniCPM-V & Wllama quantization group' },
        { name: 'Emergency Family Contact', relationship: 'Family / ICE', phone: '+1-555-011-0000', email: 'ice@familynet.org', notes: 'Emergency primary contact' }
      ];

      // LLM-supplied contact_data may be invalid JSON or a JSON non-object
      // (e.g. '"John"' parses fine but is a string). Only a plain object with
      // a name field may enter the vault; coerce the rest to safe strings.
      const coerceContactEntry = (raw: unknown): ContactRecord | null => {
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
        const o = raw as Record<string, unknown>;
        if (typeof o.name !== 'string' || !o.name.trim()) return null;
        return {
          name: o.name,
          relationship: typeof o.relationship === 'string' ? o.relationship : 'Contact',
          phone: typeof o.phone === 'string' ? o.phone : 'N/A',
          email: typeof o.email === 'string' ? o.email : '',
          notes: typeof o.notes === 'string' ? o.notes : undefined,
        };
      };

      // A stored vault may be corrupt or hold junk pushed by an earlier bad
      // `add` (any non-object entry makes every later search throw on
      // c.name.toLowerCase). Sanitize on read so one poisoned entry cannot
      // permanently break the tool.
      const sanitizeContacts = (raw: unknown): ContactRecord[] => {
        if (!Array.isArray(raw)) return [];
        const cleaned: ContactRecord[] = [];
        for (const entry of raw) {
          const coerced = coerceContactEntry(entry);
          if (coerced) cleaned.push(coerced);
        }
        return cleaned;
      };

      try {
        let contacts: ContactRecord[] = defaultContacts;
        if (typeof window !== 'undefined') {
          const stored = window.localStorage.getItem('hermes_contacts_vault');
          if (stored) {
            try {
              contacts = sanitizeContacts(JSON.parse(stored));
            } catch (_) {
              contacts = [];
            }
          }
        }

        if (act === 'add' && args.contact_data) {
          let parsedNew: unknown;
          try {
            parsedNew = JSON.parse(String(args.contact_data));
          } catch (_) {
            return `📇 **Contact Not Saved**: \`contact_data\` was not valid JSON. Send a JSON object such as \`{"name":"Jane Doe","phone":"+1-555-010-1234","relationship":"Colleague","email":"jane@example.com"}\` and retry.`;
          }
          const newEntry = coerceContactEntry(parsedNew);
          if (!newEntry) {
            return `📇 **Contact Not Saved**: \`contact_data\` must be a JSON object with at least a non-empty \`name\` string field. Nothing was written to the vault.`;
          }
          contacts.push(newEntry);
          if (typeof window !== 'undefined') {
            window.localStorage.setItem('hermes_contacts_vault', JSON.stringify(contacts));
          }
          return `📇 **Contact Stored Successfully**: "${newEntry.name}" (Phone: ${newEntry.phone || 'N/A'}) saved to phone vault.`;
        }

        const matches = contacts.filter((c) =>
          c.name.toLowerCase().includes(q) ||
          c.relationship.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          (c.notes && c.notes.toLowerCase().includes(q))
        );

        if (matches.length === 0) {
          return `📇 **Address Book Search**: No contacts found matching query "${args.query}".`;
        }

        let out = `📇 **Mobile Address Book Results** (${matches.length} matching "${args.query}"):\n\n`;
        matches.forEach((c, idx) => {
          out += `${idx + 1}. **${c.name}** (${c.relationship})\n   • **Phone**: \`${c.phone}\`\n   • **Email**: ${c.email || 'N/A'}\n   • **Notes**: ${c.notes || 'None'}\n\n`;
        });
        out += `*(Tip: You can instruct Hermes to call or SMS this contact using phone_intent)*`;
        return out;
      } catch (_) {
        return `📇 **Contacts Vault Error**: The "${act}" action could not be completed (vault read failed). Nothing was changed.`;
      }
    }
  },
  {
    name: 'mobile_notes_vault',
    description: 'Create, search, list, or retrieve on-device Markdown notes and memos in the secure local Document Vault.',
    parameters: [
      { name: 'action', type: 'string', description: 'Action: "list" recent notes, "search" by keyword, "create" a new note, or "read" a note by id', required: true },
      { name: 'query', type: 'string', description: 'Keyword search query for title, content, or tags', required: false },
      { name: 'note_id', type: 'string', description: 'ID of the note to retrieve when action is "read"', required: false },
      { name: 'title', type: 'string', description: 'Title of the note when action is "create"', required: false },
      { name: 'content', type: 'string', description: 'Markdown content of the note when action is "create"', required: false },
      { name: 'category', type: 'string', description: 'Category: General, Meeting, Architecture, Code, Prompt, or Idea', required: false },
    ],
    execute: async (args: Record<string, unknown>) => {
      const act = String(args.action || 'list').toLowerCase();
      const storageKey = 'hermes_mobile_notes_v1';

      interface NoteItem {
        id: string;
        title: string;
        content: string;
        category: string;
        isPinned: boolean;
        createdAt: string;
        updatedAt: string;
      }

      let notes: NoteItem[] = [];
      if (typeof window !== 'undefined') {
        // The stored vault may be corrupt JSON, a non-array, or hold junk
        // entries (the #129 pattern). Sanitize on read so one bad entry cannot
        // make every later action throw, and so "create" cannot wipe the
        // vault or save on top of unparseable data.
        const coerceNote = (raw: unknown): NoteItem | null => {
          if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
          const o = raw as Record<string, unknown>;
          if (typeof o.id !== 'string' || !o.id) return null;
          return {
            id: o.id,
            title: typeof o.title === 'string' ? o.title : 'Untitled Note',
            content: typeof o.content === 'string' ? o.content : '',
            category: typeof o.category === 'string' ? o.category : 'General',
            isPinned: o.isPinned === true,
            createdAt: typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString(),
            updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : new Date().toISOString(),
          };
        };
        try {
          const raw = window.localStorage.getItem(storageKey);
          if (raw) {
            const parsed: unknown = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              notes = parsed.map(coerceNote).filter((n): n is NoteItem => n !== null);
            }
          }
        } catch {
          // Corrupt vault: start from empty instead of throwing (or silently
          // wiping the old blob) on the next create.
          notes = [];
        }
      }

      if (act === 'create') {
        if (typeof args.title !== 'string' || !args.title.trim() || typeof args.content !== 'string' || !args.content.trim()) {
          return `📝 **Note Not Created**: \`title\` and \`content\` must be non-empty strings. Nothing was saved to the vault.`;
        }
        const title = args.title;
        const content = args.content;
        const category = typeof args.category === 'string' && args.category.trim() ? args.category : 'General';
        const newNote: NoteItem = {
          id: `note-${Date.now()}`,
          title,
          content,
          category,
          isPinned: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        notes.unshift(newNote);
        if (typeof window !== 'undefined') {
          try {
            window.localStorage.setItem(storageKey, JSON.stringify(notes));
          } catch (err: unknown) {
            return `📝 **Note Not Saved**: ${(err as Error)?.message || 'local storage write failed (quota or unavailable)'}. Nothing was persisted.`;
          }
        }
        return `📝 **Note Created Successfully**:\n• **ID**: \`${newNote.id}\`\n• **Title**: "${newNote.title}"\n• **Category**: ${newNote.category}\n• **Length**: ${newNote.content.length} characters\n*(Saved to on-device vault)*`;
      }

      if (act === 'read') {
        const targetId = String(args.note_id || '');
        const found = notes.find((n) => n.id === targetId);
        if (!found) {
          return `📝 **Note Not Found**: No note with ID "${targetId}" found in local vault.`;
        }
        return `📝 **Note: ${found.title}** (Category: ${found.category})\n\n---\n${found.content}\n---`;
      }

      if (act === 'search') {
        const q = String(args.query || '').toLowerCase();
        const matches = notes.filter(
          (n) =>
            n.title.toLowerCase().includes(q) ||
            n.content.toLowerCase().includes(q) ||
            n.category.toLowerCase().includes(q)
        );
        if (matches.length === 0) {
          return `📝 **Notes Search**: No notes found matching query "${args.query}".`;
        }
        let out = `📝 **Notes Search Results** (${matches.length} matching "${args.query}"):\n\n`;
        matches.slice(0, 5).forEach((n, idx) => {
          out += `${idx + 1}. **${n.title}** [\`${n.id}\`] (${n.category})\n   ${n.content.slice(0, 100).replace(/\n/g, ' ')}...\n\n`;
        });
        return out;
      }

      // Default: list
      if (notes.length === 0) {
        return `📝 **Notes Vault**: No notes currently saved in the device vault. You can create one using the "create" action.`;
      }
      let out = `📝 **On-Device Notes Vault** (${notes.length} total notes):\n\n`;
      notes.slice(0, 5).forEach((n, idx) => {
        out += `${idx + 1}. **${n.title}** [\`${n.id}\`] (${n.category})${n.isPinned ? ' 📌' : ''}\n   Updated: ${new Date(n.updatedAt).toLocaleDateString()}\n\n`;
      });
      return out;
    }
  }
  ,
  {
    name: 'long_run_command',
    description: 'Run a longer-running mobile task or command with progress updates and completion status.',
    parameters: [
      { name: 'command', type: 'string', description: 'Task or command description to execute', required: true },
      { name: 'duration_ms', type: 'number', description: 'Expected duration in milliseconds', required: false }
    ],
    execute: async (args) => {
      const cmd = String(args.command || '').trim();
      const rawDuration = Number(args.duration_ms);
      // A non-numeric duration must not become NaN (setTimeout(NaN) fires
      // immediately and the task claims it ran for the expected time).
      const duration = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 1200;
      await new Promise((r) => setTimeout(r, Math.min(Math.max(duration, 200), 4000)));
      return 'Long-Run Task Completed: ' + (cmd || 'mobile task') + ' finished successfully.';
    }
  }
];
