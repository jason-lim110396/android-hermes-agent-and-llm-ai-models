// Shared persistence for the File Search studio's locally ingested
// knowledge base. Previously this lived (as private copies) inside
// FileSearchStudio.tsx only; the CPU inference engine's knowledge-search
// path needs the same store, so the load/save contract moves here. The
// storage key is unchanged, so existing ingested documents survive.

export interface KnowledgeDoc {
  id: string;
  title: string;
  category: string;
  lastUpdated: string;
  content: string;
}

export const KB_STORAGE_KEY = 'hermes_vector_kb_docs_v1';

function isValidKnowledgeDoc(d: unknown): d is KnowledgeDoc {
  if (!d || typeof d !== 'object') return false;
  const doc = d as Partial<KnowledgeDoc>;
  return (
    typeof doc.id === 'string' &&
    typeof doc.title === 'string' &&
    typeof doc.category === 'string' &&
    typeof doc.lastUpdated === 'string' &&
    typeof doc.content === 'string'
  );
}

export const DEFAULT_KNOWLEDGE_DOCS: KnowledgeDoc[] = [
  {
    id: 'doc-hermes-arch',
    title: 'Hermes 3 Mobile System Architecture',
    category: 'Architecture',
    lastUpdated: 'Nov 19, 2026',
    content: `Hermes 3 3B is fine-tuned for structured JSON tool invocation and multi-turn autonomous reasoning.
On Android devices, inference runs via WebGPU shaders utilizing quantized 4-bit weights (q4f16) to conserve memory.
The KV-cache is allocated as a static ring buffer capped at 4,096 tokens, preventing system memory thrashing and keeping RAM usage strictly under 2.2 GB.
When interacting with hardware sensors, the agent invokes discrete tools through an XML-like functional envelope: <tool>{"name":"camera_snap"}</tool>.
The reasoning pipeline leverages dynamic prompt compression to maintain fast response times even during extended agent dialogues.`,
  },
  {
    id: 'doc-thermal-mem',
    title: 'Android On-Device ML Deployment Playbook',
    category: 'Engineering',
    lastUpdated: 'Nov 18, 2026',
    content: `Deploying large language models directly on mobile chipsets (Snapdragon 8 Gen 3, Dimensity 9300, Google Tensor G4) requires thermal governor awareness.
Continuous GPU utilization above 85% causes thermal throttling after 6 to 8 minutes, dropping compute throughput by 40%.
To counteract throttling, the execution loop inserts 15ms frame-budget yield points between autoregressive token generation passes.
Foreground services with FOREGROUND_SERVICE_TYPE_SPECIAL_USE must be acquired to prevent the Android Low Memory Killer (LMK) from purging worker threads during background generation.
Disk I/O caching uses SQLite IndexedDB backing for instant model weight memory-mapping.`,
  },
  {
    id: 'doc-crypto-sec',
    title: 'Edge Cryptography & Zero-Knowledge Verification',
    category: 'Security',
    lastUpdated: 'Nov 14, 2026',
    content: `All conversational contexts, agent scratchpads, and vector embeddings remain 100% on-device with zero telemetry egress.
Local database stores are encrypted with AES-256-GCM using hardware keys backed by Android Keystore and StrongBox Keymaster.
Vector similarity queries execute in-memory with SIMD-accelerated dot products, ensuring private documents never touch cloud proxies.
Biometric authentication (Fingerprint / Face Unlock via Android BiometricPrompt) gates access to the confidential knowledge vault.`,
  },
];

/** Restore the persisted knowledge base, or the demo defaults if none/invalid. */
export function loadKnowledgeDocs(): KnowledgeDoc[] {
  if (typeof window === 'undefined') return DEFAULT_KNOWLEDGE_DOCS;
  try {
    const raw = window.localStorage.getItem(KB_STORAGE_KEY);
    if (!raw) return DEFAULT_KNOWLEDGE_DOCS;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_KNOWLEDGE_DOCS;
    const docs = parsed.filter(isValidKnowledgeDoc);
    return docs.length > 0 ? docs : DEFAULT_KNOWLEDGE_DOCS;
  } catch {
    return DEFAULT_KNOWLEDGE_DOCS;
  }
}

/** Persist the knowledge base. Best-effort: never throws on quota/block. */
export function saveKnowledgeDocs(docs: KnowledgeDoc[]): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(KB_STORAGE_KEY, JSON.stringify(docs));
    return true;
  } catch {
    // Storage full or blocked: keep working in memory.
    return false;
  }
}
