'use client';

import { triggerHaptic } from '@/utils/haptics';
import React, { useEffect, useState } from 'react';
import {
  Play,
  RotateCcw,
  CheckCircle2,
  FileSpreadsheet,
  Volume2,
  Bell,
  Share2,
  Sparkles,
  Layers,
  HardDrive,
  Download,
  Copy,
  Check,
  AlertCircle,
  Vibrate,
  Clock,
  Terminal,
  Activity,
  Zap,
  Calendar,
  BatteryCharging,
  Flame,
  ShieldCheck,
  Wrench,
  GitPullRequest,
  FileCode,
  EyeOff,
  ShieldAlert,
  Compass,
} from 'lucide-react';
import { useAppStore } from '@/appStore';
import { AGENT_TOOLS } from '@/agentTools';
import StructuredToolTesterModal from './StructuredToolTesterModal';

interface WorkflowTemplate {
  id: string;
  title: string;
  category: string;
  description: string;
  stepsCount: number;
  icon: any;
  color: string;
  defaultPrompt: string;
}

const PRESET_WORKFLOWS: WorkflowTemplate[] = [
  {
    id: 'expense-auditor',
    title: 'Automated Receipt & Expense Auditor',
    category: 'Finance & OCR',
    description: 'Searches app-local files for receipt and expense notes. No real receipts found? The CSV is clearly labeled as sample data - never presented as your own spending.',
    stepsCount: 4,
    icon: FileSpreadsheet,
    color: 'from-emerald-500 to-teal-600',
    defaultPrompt: 'Find recent store receipts on device, extract merchant and totals with OCR, calculate sum, and compile an expense CSV.',
  },
  {
    id: 'morning-briefing',
    title: 'Executive Voice & System Briefing',
    category: 'Audio & Intelligence',
    description: 'Audits phone battery and network health with measured values, gathers top tech headlines via a real web search, speaks the briefing via the Web Speech API (where the WebView supports it), and schedules a real reminder.',
    stepsCount: 4,
    icon: Volume2,
    color: 'from-amber-500 to-orange-600',
    defaultPrompt: 'Run full device health check, get latest tech news headlines, synthesize voice audio summary with Kokoro, and set morning alarm.',
  },
  {
    id: 'meeting-transcriber',
    title: 'Voice Memo & Meeting Notes Pipeline',
    category: 'Productivity',
    description: 'Runs the general on-device pipeline for this goal: real hardware diagnostics, an app-local file search, and a haptic alert. A WebView cannot read system voice recordings, so no transcription is claimed.',
    stepsCount: 3,
    icon: Clock,
    color: 'from-blue-500 to-indigo-600',
    defaultPrompt: 'Find recent voice memo recordings, transcribe speech notes, extract bulleted action items, and arm phone reminders.',
  },
  {
    id: 'storage-cache-cleaner',
    title: 'Phone Storage & Cache Optimizer',
    category: 'System Maintenance',
    description: 'Reports the real browser storage quota and usage via the Storage API, checks app-local files, and vibrates when done. No cache buffers are actually deleted in this scripted pipeline.',
    stepsCount: 3,
    icon: HardDrive,
    color: 'from-purple-500 to-pink-600',
    defaultPrompt: 'Audit on-device model storage usage, verify available IndexedDB quota, optimize cached buffers, and vibrate phone upon completion.',
  },
  {
    id: 'meeting-calendar-scheduler',
    title: 'Meeting Minutes & Calendar Action Items',
    category: 'Productivity & Calendar',
    description: 'Searches app-local files for meeting notes and generates an importable .ics example. The sample decisions and assignees are labeled as examples unless real notes are found.',
    stepsCount: 4,
    icon: Calendar,
    color: 'from-cyan-500 to-blue-600',
    defaultPrompt: 'Parse meeting discussion, extract action items and owners, arm phone reminder, and generate an importable .ics calendar file.',
  },
  {
    id: 'tax-expense-exporter',
    title: 'Year-End Tax & Deductible Expense Ledger',
    category: 'Finance & Tax',
    description: 'Demonstrates a tax-deductible CSV ledger format. The expense rows are clearly labeled sample data - a WebView cannot scan your real receipt photos.',
    stepsCount: 4,
    icon: FileSpreadsheet,
    color: 'from-amber-500 to-emerald-600',
    defaultPrompt: 'Audit all annual receipts, categorize business expenses under tax deduction rules, compute total deductible write-off, and generate a certified CSV ledger.',
  },
  {
    id: 'battery-thermal-audit',
    title: 'Battery & Power Reality Check',
    category: 'Hardware & Diagnostics',
    description: 'Reports genuinely measured values: Battery API level and charging state, storage quota, RAM ceiling. Anything a WebView cannot measure (SoC temperature, discharge curves) is reported as not measurable.',
    stepsCount: 4,
    icon: BatteryCharging,
    color: 'from-rose-500 to-amber-600',
    defaultPrompt: 'Audit mobile device battery discharge curve, check SoC thermal throttling status, identify background wake-locks, and suggest power profile tuning.',
  },
  {
    id: 'git-diff-auditor',
    title: 'Git Diff & Code Patch Review Automator',
    category: 'Developer & Code Audit',
    description: 'Paste a unified git diff into the goal box, then tap Execute on this card - or tap Run Task, which auto-detects pasted diffs. File count, +/- line metrics and a secret-pattern scan are computed from YOUR diff. No diff pasted means nothing is analyzed.',
    stepsCount: 4,
    icon: GitPullRequest,
    color: 'from-violet-500 to-indigo-600',
    defaultPrompt: 'Analyze incoming pull request git diff, audit for security risks and code smells, compute patch delta metrics, and generate an actionable review report.',
  },
  {
    id: 'memory-leak-gc-sweeper',
    title: 'App Memory & Heap Reality Check',
    category: 'Performance & Profiling',
    description: 'Reports the real JS heap size when the WebView exposes performance.memory, plus honest limits: a page cannot enumerate detached DOM nodes or force GC. No invented "reclaimed MB" numbers.',
    stepsCount: 4,
    icon: Activity,
    color: 'from-emerald-500 to-teal-600',
    defaultPrompt: 'Audit mobile app JS heap allocations, detect detached DOM nodes and unclosed audio contexts, execute generational GC sweep, and produce a certified memory report.',
  },
  {
    id: 'privacy-telemetry-audit',
    title: 'Local Storage & Privacy Design Audit',
    category: 'Privacy & Security',
    description: 'Reports measured storage usage and the app codebase design facts (no analytics SDKs, local-first storage). Design facts are stated as design facts - not "cryptographically verified" claims.',
    stepsCount: 4,
    icon: ShieldCheck,
    color: 'from-emerald-600 to-cyan-600',
    defaultPrompt: 'Audit on-device storage encryption status, verify zero external network socket telemetry, scan clipboard buffers, and produce a signed sovereign privacy audit certificate.',
  },
  {
    id: 'batch-content-redactor',
    title: 'Multi-File Batch Content Redactor & Anonymizer',
    category: 'Privacy & Security',
    description: 'Demonstrates a PII redaction report format with clearly labeled sample rows. No documents on your phone are read by this scripted pipeline.',
    stepsCount: 4,
    icon: EyeOff,
    color: 'from-purple-600 to-indigo-600',
    defaultPrompt: 'Scan on-device customer support logs and contract drafts, detect sensitive PII entities, replace with consistent synthetic pseudonyms, and produce an anonymized zip bundle.',
  },
  {
    id: 'dependency-compliance-audit',
    title: 'Code Dependency Vulnerability & License Compliance Checker',
    category: 'Development & DevOps',
    description: 'Formats an example SBOM report. A real CVE audit needs a live vulnerability database, which this offline pipeline does not query - the sample says so plainly.',
    stepsCount: 4,
    icon: ShieldAlert,
    color: 'from-amber-600 to-rose-600',
    defaultPrompt: 'Audit on-device project dependencies, scan for critical CVE advisories, verify MIT/Apache-2.0 license compliance, and generate a certified SBOM report.',
  },
  {
    id: 'spatial-sensor-telemetry',
    title: 'Spatial Sensor Goal Pipeline',
    category: 'Hardware & Spatial Sensing',
    description: 'Runs the general on-device pipeline: real hardware diagnostics, an app-local search for your goal, and a haptic alert. GPS/lux telemetry is not claimed - this scripted path does not read them.',
    stepsCount: 3,
    icon: Compass,
    color: 'from-teal-500 to-cyan-600',
    defaultPrompt: 'Audit mobile device spatial sensors, read orientation angles, check battery discharge telemetry, locate GPS accuracy, and produce a signed sensor certificate.',
  },
];

interface ExecutionLog {
  step: number;
  toolName: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  detail: string;
  result?: string;
}

/** True when the text looks like a unified git diff (header or +/- hunk
 * markers), so Run Task can route a pasted diff to the diff auditor. */
function looksLikeUnifiedDiff(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.startsWith('diff --git ')) return true;
  const lines = t.split(/\r?\n/);
  return lines.some((l) => l.startsWith('+++ ')) && lines.some((l) => l.startsWith('--- '));
}

export default function TaskWorkflowsStudio() {
  const speakText = useAppStore((s) => s.speakText);

  const [activeWorkflowId, setActiveWorkflowId] = useState<string>('expense-auditor');
  const [customGoal, setCustomGoal] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [finalOutput, setFinalOutput] = useState<string | null>(null);
  const [generatedFile, setGeneratedFile] = useState<{ name: string; url: string; size: string } | null>(null);
  const [copied, setCopied] = useState(false);
  // Transient copy/share failure: shown next to the output actions instead
  // of leaving a rejected write silent (or falsely "Copied").
  const [copyFailed, setCopyFailed] = useState(false);
  const showCopyFailure = () => {
    setCopyFailed(true);
    triggerHaptic([30, 30]);
    setTimeout(() => setCopyFailed(false), 3000);
  };
  const copyOutputToClipboard = () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      showCopyFailure();
      return;
    }
    navigator.clipboard
      .writeText(finalOutput || '')
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => showCopyFailure());
  };

  const handleExportWorkflowMarkdown = () => {
    if (!finalOutput) return;
    const blob = new Blob([
      `# Autonomous Workflow Output: ${currentTemplate.title}\n\n` +
      `**Category:** ${currentTemplate.category}\n` +
      `**Generated:** ${new Date().toLocaleString()}\n\n` +
      `## Result\n\n${finalOutput}\n\n` +
      `---\n*Hermes Agent Autonomous Mobile Pipeline*\n`
    ], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workflow-${activeWorkflowId}-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    if (typeof document !== 'undefined') document.body.removeChild(a);
    URL.revokeObjectURL(url);
    triggerHaptic(20);
  };
  const [isToolTesterOpen, setIsToolTesterOpen] = useState(false);

  // Every workflow run mints a fresh Blob URL for its export file. Revoke the
  // previous one whenever it is replaced (re-run, clear at run start) or the
  // studio unmounts, so repeated runs cannot accumulate leaked Blob objects in
  // the WebView until the next full page reload.
  useEffect(() => {
    const url = generatedFile?.url;
    return () => {
      if (url) {
        try { URL.revokeObjectURL(url); } catch (_) {}
      }
    };
  }, [generatedFile]);

  const currentTemplate = PRESET_WORKFLOWS.find((w) => w.id === activeWorkflowId) || PRESET_WORKFLOWS[0];

  const runWorkflow = async (workflowId: string, customPrompt?: string) => {
    setIsRunning(true);
    setFinalOutput(null);
    setGeneratedFile(null);
    setLogs([]);
    try {
      await runWorkflowSteps(workflowId, customPrompt);
    } catch (err: unknown) {
      // A crash mid-pipeline must not leave the studio stuck "running" with
      // a dead Run button: name the failure in the log and the output.
      const reason = (err as Error)?.message || String(err);
      setLogs((prev) => [
        ...prev,
        {
          step: prev.length + 1,
          toolName: 'pipeline',
          status: 'failed' as const,
          detail: `Workflow crashed: ${reason}`,
        },
      ]);
      setFinalOutput(`⚠️ **Workflow failed**: ${reason}. Steps after the crash did not run.`);
    } finally {
      setIsRunning(false);
    }
  };

  const runWorkflowSteps = async (workflowId: string, customPrompt?: string) => {
    // A pasted unified diff in the goal box routes to the diff auditor: Run
    // Task auto-detects diff-looking text, and the auditor card's Execute
    // passes the goal text, so the real diff parser is reachable from both
    // entry points instead of being dead code behind a "custom" pipeline.
    if (workflowId === 'custom' && looksLikeUnifiedDiff(customPrompt || '')) {
      workflowId = 'git-diff-auditor';
    }

    // Resolve the template from the workflowId argument, not from
    // currentTemplate: the Execute button can fire for a card whose
    // setActiveWorkflowId has not re-rendered yet, which previously ran the
    // goal under the previous workflow's default prompt.
    const template = PRESET_WORKFLOWS.find((w) => w.id === workflowId);
    const prompt = customPrompt || (template ? template.defaultPrompt : currentTemplate.defaultPrompt);

    if (workflowId === 'expense-auditor') {
      // Step 1: Find Receipts
      const step1: ExecutionLog = { step: 1, toolName: 'find_device_files', status: 'running', detail: 'Searching app-local files for receipt and invoice notes (a WebView cannot read /DCIM)...' };
      setLogs([step1]);
      setCurrentStepIndex(1);
      await new Promise((r) => setTimeout(r, 600));

      const findTool = AGENT_TOOLS.find((t) => t.name === 'find_device_files');
      const filesResult = findTool ? await findTool.execute({ query: 'store receipt invoice tax grocery', file_type: 'image' }) : 'App-local search unavailable.';
      step1.status = 'completed';
      step1.result = filesResult;

      // Step 2: No on-device OCR engine runs in this WebView: the rows below
      // are sample data, stated as sample data, never as the user's receipts.
      const step2: ExecutionLog = { step: 2, toolName: 'document_analyzer', status: 'running', detail: 'No on-device OCR engine is available in this WebView - preparing clearly-labeled sample expense rows...' };
      setLogs([step1, step2]);
      setCurrentStepIndex(2);
      await new Promise((r) => setTimeout(r, 700));

      const ocrResult = `[Sample Expense Rows - not read from any receipt on this phone]\n1. Supermarket Store #402: $48.50 (Tax: $4.20)\n2. Hardware Depot: $124.90 (Tax: $11.00)\n3. City Coffee & Bakery: $14.25 (Tax: $1.15)`;
      step2.status = 'completed';
      step2.result = ocrResult;

      // Step 3: Compute Math & Generate CSV
      const step3: ExecutionLog = { step: 3, toolName: 'code_interpreter', status: 'running', detail: 'Compiling the labeled sample rows into a CSV spreadsheet...' };
      setLogs([step1, step2, step3]);
      setCurrentStepIndex(3);
      await new Promise((r) => setTimeout(r, 600));

      const csvContent = `# SAMPLE DATA - not read from any receipt on this phone\nMerchant,Date,Category,Amount,Tax\nSupermarket Store #402,2026-10-18,Groceries,48.50,4.20\nHardware Depot,2026-10-16,Supplies,124.90,11.00\nCity Coffee & Bakery,2026-10-14,Meals,14.25,1.15\nTOTAL,,,$187.65,$16.35`;
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const csvUrl = URL.createObjectURL(blob);
      setGeneratedFile({ name: 'Hermes_Expense_Report_SAMPLE.csv', url: csvUrl, size: '260 bytes' });

      step3.status = 'completed';
      step3.result = `Sample-row total computed: $187.65 (Tax: $16.35). Generated "Hermes_Expense_Report_SAMPLE.csv" with a SAMPLE DATA header.`;

      // Step 4: Native Share & Haptic Alert
      const step4: ExecutionLog = { step: 4, toolName: 'haptic_vibration & native_share', status: 'running', detail: 'Triggering tactile haptic alert and preparing Android native share sheet...' };
      setLogs([step1, step2, step3, step4]);
      setCurrentStepIndex(4);
      await new Promise((r) => setTimeout(r, 500));

      triggerHaptic([150, 100, 150]);
      step4.status = 'completed';
      step4.result = `Tactile haptic pulse dispatched. Sample CSV armed for 1-tap Android Share.`;

      setFinalOutput(`✅ **Expense pipeline finished - the numbers below are SAMPLE data.**\n\n- **OCR**: not available in this WebView; no receipt on this phone was read\n- **Sample Total**: $187.65 (Tax: $16.35)\n- **Export**: \`Hermes_Expense_Report_SAMPLE.csv\` - the file itself carries a SAMPLE DATA header row`);
    } else if (workflowId === 'morning-briefing') {
      // Step 1: Device Diagnostics
      const step1: ExecutionLog = { step: 1, toolName: 'device_diagnostics', status: 'running', detail: 'Querying smartphone battery status, memory headroom, and WebGPU backend...' };
      setLogs([step1]);
      setCurrentStepIndex(1);
      await new Promise((r) => setTimeout(r, 500));

      const diagTool = AGENT_TOOLS.find((t) => t.name === 'device_diagnostics');
      const diagResult = diagTool ? await diagTool.execute({ metric: 'all' }) : 'Diagnostics healthy.';
      step1.status = 'completed';
      step1.result = diagResult;

      // Step 2: Web Search News
      const step2: ExecutionLog = { step: 2, toolName: 'web_search', status: 'running', detail: 'Retrieving live global tech & AI developments via DuckDuckGo and Wikipedia...' };
      setLogs([step1, step2]);
      setCurrentStepIndex(2);
      await new Promise((r) => setTimeout(r, 700));

      const searchTool = AGENT_TOOLS.find((t) => t.name === 'web_search');
      const searchResult = searchTool ? await searchTool.execute({ query: 'latest AI tech release updates' }) : 'Web search tool unavailable.';
      step2.status = 'completed';
      step2.result = searchResult;

      // Step 3: Voice briefing via the Web Speech API (what actually runs;
      // there is no Kokoro engine behind this button).
      const step3: ExecutionLog = { step: 3, toolName: 'voice_studio (Web Speech API)', status: 'running', detail: 'Handing the briefing text to the Web Speech API (it speaks only where this WebView provides speech synthesis)...' };
      setLogs([step1, step2, step3]);
      setCurrentStepIndex(3);
      await new Promise((r) => setTimeout(r, 600));

      const speechBrief = 'Good morning. Your device check has finished; measured battery, memory, storage and network values are listed in the briefing panel. Top tech headlines from the live web search are listed below as well.';
      speakText(speechBrief);
      step3.status = 'completed';
      step3.result = 'Briefing text handed to the Web Speech API. It plays aloud only if this WebView provides speech synthesis.';

      // Step 4: Schedule Reminder
      const step4: ExecutionLog = { step: 4, toolName: 'device_reminder', status: 'running', detail: 'Arming daily automated check reminder in local device storage...' };
      setLogs([step1, step2, step3, step4]);
      setCurrentStepIndex(4);
      await new Promise((r) => setTimeout(r, 400));

      const remTool = AGENT_TOOLS.find((t) => t.name === 'device_reminder');
      const remResult = remTool ? await remTool.execute({ title: 'Daily AI Briefing Check', due_time: 'Tomorrow 9:00 AM' }) : 'Reminder tool unavailable.';
      step4.status = 'completed';
      step4.result = remResult;

      setFinalOutput(`🎙️ **Morning Briefing Complete (measured values only)**\n\n- **Device State (measured)**: ${diagResult}\n- **Live Search**: ${searchResult}\n- **Daily Reminder**: ${remResult}`);
    } else if (workflowId === 'meeting-calendar-scheduler') {
      // Step 1: Ingest notes - a real app-local search. A WebView cannot read
      // system folders, and the result below is whatever was actually found.
      const step1: ExecutionLog = { step: 1, toolName: 'find_device_files', status: 'running', detail: 'Searching app-local files for meeting notes and agenda transcripts (a WebView cannot read system folders)...' };
      setLogs([step1]);
      setCurrentStepIndex(1);
      await new Promise((r) => setTimeout(r, 600));
      const findTool1 = AGENT_TOOLS.find((t) => t.name === 'find_device_files');
      const notesResult = findTool1 ? await findTool1.execute({ query: 'meeting notes minutes agenda sprint decisions action items' }) : 'App-local search unavailable.';
      step1.status = 'completed';
      step1.result = notesResult;

      // Step 2: Action Item Matrix - no reasoning model runs in this scripted
      // step, so the items below are labeled examples, never claimed extracts.
      const step2: ExecutionLog = { step: 2, toolName: 'deep_reasoning', status: 'running', detail: 'No reasoning model runs in this scripted step - preparing clearly-labeled example action items...' };
      setLogs([step1, step2]);
      setCurrentStepIndex(2);
      await new Promise((r) => setTimeout(r, 700));
      step2.status = 'completed';
      step2.result = 'Example action items (no notes were reasoned over): 1. Validate WebGPU benchmark 2. Deploy mobile studios 3. Review offline weights.';

      // Step 3: Arm Notification Reminder (real local alarm)
      const step3: ExecutionLog = { step: 3, toolName: 'device_reminder', status: 'running', detail: 'Arming a real local phone alarm for the milestone checkpoint...' };
      setLogs([step1, step2, step3]);
      setCurrentStepIndex(3);
      await new Promise((r) => setTimeout(r, 500));
      const remTool2 = AGENT_TOOLS.find((t) => t.name === 'device_reminder');
      const remResult2 = remTool2 ? await remTool2.execute({ title: 'Meeting action-item checkpoint', due_time: 'Today 2:00 PM' }) : 'Reminder tool unavailable.';
      step3.status = 'completed';
      step3.result = remResult2;

      // Step 4: Generate .ics iCalendar file from the labeled example items
      const step4: ExecutionLog = { step: 4, toolName: 'generate_calendar_ics', status: 'running', detail: 'Generating an example .ics calendar file for phone calendar import...' };
      setLogs([step1, step2, step3, step4]);
      setCurrentStepIndex(4);
      await new Promise((r) => setTimeout(r, 600));

      const icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Hermes AI//Android Meeting Scheduler (example)//EN',
        'BEGIN:VEVENT',
        'SUMMARY:Example: Sprint Review & Milestone Action Items',
        'DESCRIPTION:Hermes AI example action items (sample data):\\n1. Validate WebGPU benchmark\\n2. Deploy mobile studios\\n3. Review offline weights.',
        'DTSTART:20261120T140000Z',
        'DTEND:20261120T150000Z',
        'STATUS:TENTATIVE',
        'BEGIN:VALARM',
        'TRIGGER:-PT15M',
        'ACTION:DISPLAY',
        'DESCRIPTION:Meeting Action Item Reminder',
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const icsBlob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
      const icsUrl = URL.createObjectURL(icsBlob);
      setGeneratedFile({
        name: 'meeting_action_items_example.ics',
        url: icsUrl,
        size: '1.2 KB',
      });

      step4.status = 'completed';
      step4.result = 'meeting_action_items_example.ics generated (example items) and ready for 1-tap phone import.';

      setFinalOutput(
        `### 📅 Meeting Minutes & Action Plan - EXAMPLE DATA\n\n` +
        `**Notes search (real)**: ${notesResult}\n\n` +
        `#### 🎯 Example Decisions (not read from your notes):\n` +
        `- WebGPU hardware acceleration approved as primary inference pipeline.\n` +
        `- All data storage and vector searches stay 100% offline on device.\n\n` +
        `#### 📋 Example Action Items:\n` +
        `| Assignee | Action Item | Deadline | Priority |\n` +
        `| :--- | :--- | :--- | :--- |\n` +
        `| Alex | Benchmark Llama 3.2 1B & 3B WebGPU throughput | Today 4:00 PM | High |\n` +
        `| Jordan | Audit privacy EXIF scrubber on camera snaps | Tomorrow | High |\n` +
        `| Sam | Verify .ics calendar import on Samsung/Google Calendar | Friday | Medium |\n\n` +
        `**Reminder (real)**: ${remResult2}\n\n` +
        `> **Deliverable**: Tap **Download .ics** below to import the example tasks into your calendar.`
      );
    } else if (workflowId === 'tax-expense-exporter') {
      // Step 1: Scan Tax Folders - real app-local search, honestly reported.
      const step1: ExecutionLog = { step: 1, toolName: 'find_device_files', status: 'running', detail: 'Searching app-local files for receipt and expense notes (a WebView cannot read /Documents or /DCIM)...' };
      setLogs([step1]);
      setCurrentStepIndex(1);
      await new Promise((r) => setTimeout(r, 600));
      const taxFindTool = AGENT_TOOLS.find((t) => t.name === 'find_device_files');
      const taxFilesResult = taxFindTool ? await taxFindTool.execute({ query: 'receipt invoice tax expense deductible' }) : 'App-local search unavailable.';
      step1.status = 'completed';
      step1.result = taxFilesResult;

      // Step 2: Tax Classification - no OCR engine runs here; the rows below
      // are sample data, stated as sample data.
      const step2: ExecutionLog = { step: 2, toolName: 'document_analyzer (MiniCPM-V)', status: 'running', detail: 'No OCR engine runs in this WebView - preparing clearly-labeled sample expense classifications...' };
      setLogs([step1, step2]);
      setCurrentStepIndex(2);
      await new Promise((r) => setTimeout(r, 700));
      step2.status = 'completed';
      step2.result = 'Sample data: $2,026.00 total spend across 4 tax deduction categories (not read from any receipt on this phone).';

      // Step 3: Compile Sample Tax CSV
      const step3: ExecutionLog = { step: 3, toolName: 'code_interpreter', status: 'running', detail: 'Formatting the sample rows into a CSV ledger...' };
      setLogs([step1, step2, step3]);
      setCurrentStepIndex(3);
      await new Promise((r) => setTimeout(r, 600));

      const taxCsvContent = `# SAMPLE DATA - not read from any receipt on this phone\nDate,Merchant,Category,Deductible Rate,Gross Amount,Tax Write-Off\n2026-01-15,AWS Cloud Infrastructure,Software Hosting,100%,450.00,450.00\n2026-03-20,Apple Store (MacBook Charger),Office Equipment,100%,89.00,89.00\n2026-05-12,United Airlines,Business Travel,100%,620.00,620.00\n2026-07-04,Hilton Downtown Hotel,Lodging,100%,380.00,380.00\n2026-09-18,GitHub Enterprise,Software Tools,100%,210.00,210.00\n2026-11-02,Client Working Dinner,Meals (Business),50%,160.00,80.00\n2026-11-14,Google Workspace,Software Tools,100%,72.00,72.00\n2026-11-19,FedEx Office Shipping,Office Supplies,100%,45.00,45.00\nTOTAL,,,,$2,026.00,$1,946.00`;

      const taxBlob = new Blob([taxCsvContent], { type: 'text/csv;charset=utf-8;' });
      const taxUrl = URL.createObjectURL(taxBlob);
      setGeneratedFile({
        name: 'Hermes_Tax_Deductible_Ledger_SAMPLE.csv',
        url: taxUrl,
        size: '540 bytes',
      });
      step3.status = 'completed';
      step3.result = 'Generated SAMPLE tax ledger CSV ($1,946.00 in sample write-offs; a SAMPLE DATA header is included).';

      // Step 4: Haptic Dispatch & Ready to Share
      const step4: ExecutionLog = { step: 4, toolName: 'haptic_vibration & native_share', status: 'running', detail: 'Arming export sheet and physical haptic alert...' };
      setLogs([step1, step2, step3, step4]);
      setCurrentStepIndex(4);
      await new Promise((r) => setTimeout(r, 400));
      triggerHaptic([100, 50, 150]);
      step4.status = 'completed';
      step4.result = 'Ready for immediate dispatch to CPA accountant or cloud tax portal.';

      setFinalOutput(
        `### 💼 Tax-Deductible Expense Ledger - SAMPLE DATA (2026)\n\n` +
        `**App-local search (real)**: ${taxFilesResult}\n\n` +
        `**Sample Totals**: Gross $2,026.00 - sample write-offs $1,946.00. No receipt on this phone was scanned; every row is labeled sample data.\n\n` +
        `#### 📊 Sample Expense Category Breakdown:\n` +
        `- **Software & Cloud Infrastructure**: $732.00 (100% deductible)\n` +
        `- **Business Travel & Lodging**: $1,000.00 (100% deductible)\n` +
        `- **Office Supplies & Equipment**: $134.00 (100% deductible)\n` +
        `- **Client Business Meals**: $160.00 (50% statutory rate: $80.00)\n\n` +
        `> **Ready to Export**: Download \`Hermes_Tax_Deductible_Ledger_SAMPLE.csv\` below or tap Share to send via email or WhatsApp.`
      );
    } else if (workflowId === 'battery-thermal-audit') {
      // Only genuinely measured values are reported. A WebView cannot read
      // SoC thermistors, voltage, or discharge curves: those are reported as
      // "not measurable", never invented.
      const step1: ExecutionLog = { step: 1, toolName: 'device_diagnostics', status: 'running', detail: 'Reading the real Battery API level and charging state...' };
      setLogs([step1]);
      setCurrentStepIndex(1);
      await new Promise((r) => setTimeout(r, 600));
      const diagBatteryTool = AGENT_TOOLS.find((t) => t.name === 'device_diagnostics');
      const batteryResult = diagBatteryTool ? await diagBatteryTool.execute({ metric: 'battery' }) : 'Diagnostics unavailable.';
      step1.status = 'completed';
      step1.result = batteryResult;

      // Step 2: Thermal - honestly not measurable from a WebView.
      const step2: ExecutionLog = { step: 2, toolName: 'thermal_governor', status: 'running', detail: 'Checking what thermal data this WebView can actually expose...' };
      setLogs([step1, step2]);
      setCurrentStepIndex(2);
      await new Promise((r) => setTimeout(r, 700));
      step2.status = 'completed';
      step2.result = 'Not measurable: a WebView cannot read SoC or battery thermistors. No temperature is invented.';

      // Step 3: Memory & storage (real measured values)
      const step3: ExecutionLog = { step: 3, toolName: 'device_diagnostics', status: 'running', detail: 'Reading the real RAM ceiling, CPU cores, and storage quota...' };
      setLogs([step1, step2, step3]);
      setCurrentStepIndex(3);
      await new Promise((r) => setTimeout(r, 600));
      const memLines = diagBatteryTool ? await diagBatteryTool.execute({ metric: 'memory' }) : 'Diagnostics unavailable.';
      const storeLines = diagBatteryTool ? await diagBatteryTool.execute({ metric: 'storage' }) : '';
      step3.status = 'completed';
      step3.result = `${memLines}\n${storeLines}`.trim();

      // Step 4: Generate Audit Report & Haptic Confirmation
      const step4: ExecutionLog = { step: 4, toolName: 'export_audit_json', status: 'running', detail: 'Generating the measured-values-only battery & power report...' };
      setLogs([step1, step2, step3, step4]);
      setCurrentStepIndex(4);
      await new Promise((r) => setTimeout(r, 500));

      // Structured re-read of the same APIs for the JSON report, so the
      // export carries real numbers instead of the step log's prose.
      const batteryJson: Record<string, unknown> = { source: 'Battery API not exposed by this WebView' };
      const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean }> }) : undefined;
      if (nav && typeof nav.getBattery === 'function') {
        try {
          const b = await nav.getBattery();
          batteryJson.levelPercent = Math.round(b.level * 100);
          batteryJson.charging = !!b.charging;
          batteryJson.source = 'navigator.getBattery (measured)';
        } catch (_) {
          batteryJson.source = 'Battery API refused the request';
        }
      }
      const storageJson: Record<string, unknown> = { source: 'storage.estimate not exposed by this WebView' };
      if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
        try {
          const { quota = 0, usage = 0 } = await navigator.storage.estimate();
          const mb = (v: number) => Math.max(0, Math.round(v / (1024 * 1024)));
          storageJson.usedMB = mb(usage);
          storageJson.quotaMB = mb(quota);
          storageJson.source = 'navigator.storage.estimate (measured)';
        } catch (_) {
          storageJson.source = 'storage estimate request failed';
        }
      }
      const auditData = {
        timestamp: new Date().toISOString(),
        measured: {
          battery: batteryJson,
          storage: storageJson,
        },
        notMeasurableInWebView: [
          'SoC temperature',
          'battery temperature',
          'voltage',
          'discharge rate (%/hr)',
          'thermal throttling state',
          'wake-lock inventory',
        ],
        note: 'Only genuinely measured values appear in this report. Everything a WebView cannot expose is listed as not measurable - no value is invented.',
      };

      const auditBlob = new Blob([JSON.stringify(auditData, null, 2)], { type: 'application/json' });
      const auditUrl = URL.createObjectURL(auditBlob);
      setGeneratedFile({
        name: 'Hermes_Battery_Power_Report.json',
        url: auditUrl,
        size: '1.1 KB',
      });

      triggerHaptic([60, 40, 60]);
      step4.status = 'completed';
      step4.result = 'Hermes_Battery_Power_Report.json generated from measured values only.';

      setFinalOutput(
        `### 🔋 Battery & Power Reality Check (measured values only)\n\n` +
        `#### ⚡ Battery (measured):\n` +
        `- ${batteryResult}\n\n` +
        `#### 🧠 Memory & Storage (measured):\n` +
        `- ${step3.result}\n\n` +
        `#### 🌡️ Thermal:\n` +
        `- Not measurable in a WebView: SoC/battery temperature, voltage, discharge rate, throttling state. No number is invented for them.\n\n` +
        `#### 💡 Power Tips (advice, not measurements):\n` +
        `1. Keep **AMOLED Pure Black Mode** active when chatting in low-light environments.\n` +
        `2. Enable **Wi-Fi Only Mode** in Model Hub to avoid cellular modem drain during model downloads.\n` +
        `3. Tap **Download Report** below for the measured-values-only JSON report.`
      );
    } else if (workflowId === 'git-diff-auditor') {
      // The pasted goal text IS the diff: file counts, +/- metrics, and a
      // secret-pattern scan are computed from the user's own input. With no
      // diff pasted, nothing is analyzed and the run says so.
      const diffText = (customPrompt || '').trim();
      const step1: ExecutionLog = {
        step: 1,
        toolName: 'parse_git_diff',
        status: 'running',
        detail: diffText
          ? 'Parsing the pasted unified diff: headers, hunks, and modified file paths...'
          : 'No diff was pasted into the goal box - nothing will be analyzed or claimed.',
      };
      setLogs([step1]);
      setCurrentStepIndex(1);
      await new Promise((r) => setTimeout(r, 650));

      const diffLines = diffText ? diffText.split(/\r?\n/) : [];
      const filesChanged = new Set<string>();
      let additions = 0;
      let deletions = 0;
      for (const line of diffLines) {
        if (line.startsWith('+++ ') && !line.startsWith('+++ /dev/null')) {
          filesChanged.add(line.slice(4).split('\t')[0].replace(/^b\//, ''));
        } else if (line.startsWith('+') && !line.startsWith('+++')) {
          additions++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          deletions++;
        }
      }
      const hasDiff = filesChanged.size > 0 || additions > 0 || deletions > 0;
      step1.status = 'completed';
      step1.result = hasDiff
        ? `Parsed your diff: ${filesChanged.size} modified file(s): +${additions} / -${deletions} lines.`
        : 'Nothing parsed: no diff was provided (or it contained no +/- hunks).';

      // Step 2: Secret-pattern scan over the added lines of the user's diff.
      const step2: ExecutionLog = {
        step: 2,
        toolName: 'security_leak_scanner',
        status: 'running',
        detail: hasDiff
          ? 'Pattern-scanning the added lines for API keys, tokens, passwords, and private keys...'
          : 'Skipped: no diff provided to scan.',
      };
      setLogs([step1, step2]);
      setCurrentStepIndex(2);
      await new Promise((r) => setTimeout(r, 700));

      const secretPatterns: Array<{ name: string; re: RegExp }> = [
        { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
        { name: 'private key header', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
        { name: 'api key/secret/token/password assignment', re: /\b(api[_-]?key|secret|token|password|passwd|auth)\b\s*[:=]\s*['"][^'"]{8,}['"]/i },
        { name: 'bearer credential', re: /bearer\s+[A-Za-z0-9._~+/-]{16,}/i },
      ];
      const secretFindings: Array<{ pattern: string; line: number }> = [];
      if (hasDiff) {
        let addedLineNo = 0;
        for (const line of diffLines) {
          if (line.startsWith('+') && !line.startsWith('+++')) {
            addedLineNo++;
            for (const p of secretPatterns) {
              // Only the pattern name and line number are reported; the
              // matched secret itself is never echoed into the log or file.
              if (p.re.test(line)) {
                secretFindings.push({ pattern: p.name, line: addedLineNo });
                break;
              }
            }
          }
        }
      }
      step2.status = 'completed';
      step2.result = hasDiff
        ? secretFindings.length === 0
          ? 'Pattern scan of the added lines found no hardcoded credentials. (Static pattern scan only - not a full security audit.)'
          : `Pattern scan flagged ${secretFindings.length} added line(s): ${secretFindings.map((f) => `${f.pattern} (added line ${f.line})`).join('; ')}. The secret values themselves are not echoed.`
        : 'Skipped: no diff provided.';

      // Step 3: honest capability note - no semantic model runs here.
      const step3: ExecutionLog = {
        step: 3,
        toolName: 'hermes_code_analyzer',
        status: 'running',
        detail: hasDiff ? 'Noting analysis limits: this step runs no semantic code model...' : 'Skipped: no diff provided.',
      };
      setLogs([step1, step2, step3]);
      setCurrentStepIndex(3);
      await new Promise((r) => setTimeout(r, 750));
      step3.status = 'completed';
      step3.result = hasDiff
        ? 'Capability note: no semantic code analysis model runs in this scripted step. The report covers static metrics and pattern findings only - no typing or architecture claims are made.'
        : 'Skipped: no diff provided.';

      // Step 4: report built from the real metrics.
      const step4: ExecutionLog = {
        step: 4,
        toolName: 'generate_review_report',
        status: 'running',
        detail: hasDiff ? 'Exporting the markdown report built from your diff metrics...' : 'Nothing to export: no diff was provided.',
      };
      setLogs([step1, step2, step3, step4]);
      setCurrentStepIndex(4);
      await new Promise((r) => setTimeout(r, 600));

      if (!hasDiff) {
        step4.status = 'completed';
        step4.result = 'No report generated: there was no diff to review.';
        setFinalOutput(
          `### 🔍 Git Diff Review - nothing analyzed\n\n` +
          `No diff was pasted into the goal box, so no metrics, scan results, or review claims are shown.\n\n` +
          `Paste a unified git diff and run again for real file/line metrics and a secret-pattern scan.`
        );
      } else {
        const reviewMarkdown = [
          '# 🔍 Hermes AI Patch Metrics Report',
          `**Generated**: ${new Date().toISOString()}`,
          '**Scope**: static metrics + pattern scan of the pasted diff (no semantic model ran)',
          '',
          '## 📊 Patch Metrics (computed from your diff)',
          `- **Files Changed**: ${filesChanged.size} file(s)`,
          `- **Lines Added**: +${additions}`,
          `- **Lines Removed**: -${deletions}`,
          `- **Net Delta**: ${additions - deletions >= 0 ? '+' : ''}${additions - deletions} lines`,
          '',
          '## 🛡️ Secret-Pattern Scan (added lines)',
          secretFindings.length === 0
            ? '- No hardcoded credential patterns detected. (Static pattern scan only - not a full security audit.)'
            : secretFindings.map((f) => `- ⚠️ ${f.pattern} on added line ${f.line} (value not echoed)`).join('\n'),
          '',
          '---',
          '*Static metrics computed on-device from the pasted diff. No LGTM/approval verdict is issued by a scripted report.*',
        ].join('\n');

        const reviewBlob = new Blob([reviewMarkdown], { type: 'text/markdown;charset=utf-8' });
        const reviewUrl = URL.createObjectURL(reviewBlob);
        setGeneratedFile({
          name: 'Hermes_Patch_Metrics_Report.md',
          url: reviewUrl,
          size: `${Math.max(1, Math.round(reviewMarkdown.length / 1024))} KB`,
        });

        triggerHaptic([60, 40, 60]);
        step4.status = 'completed';
        step4.result = 'Hermes_Patch_Metrics_Report.md generated from your diff.';

        setFinalOutput(
          `### 🔍 Git Diff Metrics - computed from YOUR diff\n\n` +
          `#### 📊 Patch Metrics:\n` +
          `- **Files Changed**: ${filesChanged.size} (${[...filesChanged].slice(0, 5).map((f) => `\`${f.split('/').pop()}\``).join(', ')}${filesChanged.size > 5 ? ', ...' : ''})\n` +
          `- **Line Delta**: **+${additions}** additions / **-${deletions}** deletions (Net: ${additions - deletions >= 0 ? '+' : ''}${additions - deletions})\n` +
          `- **Secret-Pattern Scan**: ${secretFindings.length === 0 ? 'no credential patterns matched (static scan only)' : `${secretFindings.length} finding(s) - see the report; values are not echoed`}\n\n` +
          `#### ⚠️ Honest limits:\n` +
          `- No semantic code model ran: this report contains static metrics and pattern findings only, and issues no LGTM verdict.\n\n` +
          `Tap **Download Report** below for the full markdown export.`
        );
      }
    } else if (workflowId === 'memory-leak-gc-sweeper') {
      // Real heap numbers when the WebView exposes performance.memory, and
      // honest "not measurable" statements for what a page cannot do (force
      // GC, enumerate detached nodes). No invented reclaimed-MB figures.
      const step1: ExecutionLog = {
        step: 1,
        toolName: 'heap_snapshot_audit',
        status: 'running',
        detail: 'Reading the real JS heap size via performance.memory (when this WebView exposes it)...',
      };
      setLogs([step1]);
      setCurrentStepIndex(1);
      await new Promise((r) => setTimeout(r, 650));

      interface PerfMemory { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number }
      const perf = (typeof performance !== 'undefined' ? (performance as Performance & { memory?: PerfMemory }) : undefined)?.memory;
      const mb = (v: number) => Math.round((v / (1024 * 1024)) * 10) / 10;
      const heapSummary = perf
        ? `JS heap (measured): ${mb(perf.usedJSHeapSize)} MB in use of a ${mb(perf.jsHeapSizeLimit)} MB reported limit (performance.memory).`
        : 'JS heap: unknown - this WebView does not expose performance.memory. No heap number is invented.';
      step1.status = 'completed';
      step1.result = heapSummary;

      const step2: ExecutionLog = {
        step: 2,
        toolName: 'orphaned_reference_detector',
        status: 'running',
        detail: 'Checking what orphan detection a web page can actually perform...',
      };
      setLogs([step1, step2]);
      setCurrentStepIndex(2);
      await new Promise((r) => setTimeout(r, 700));
      step2.status = 'completed';
      step2.result = 'Not measurable: JavaScript in a WebView cannot enumerate detached DOM nodes, other pages audio contexts, or unrevoked Blob URLs. No orphan count is claimed.';

      const step3: ExecutionLog = {
        step: 3,
        toolName: 'generational_gc_sweep',
        status: 'running',
        detail: 'Checking whether this WebView allows an explicit GC trigger...',
      };
      setLogs([step1, step2, step3]);
      setCurrentStepIndex(3);
      await new Promise((r) => setTimeout(r, 750));
      const gcAvailable = typeof window !== 'undefined' && typeof (window as unknown as { gc?: unknown }).gc === 'function';
      if (gcAvailable) {
        try {
          (window as unknown as { gc: () => void }).gc();
          step3.status = 'completed';
          step3.result = 'An explicit GC pass ran (window.gc is exposed with dev tooling). Heap sizes after the pass are in the report.';
        } catch (_) {
          step3.status = 'completed';
          step3.result = 'window.gc exists but refused the request. Nothing was reclaimed.';
        }
      } else {
        step3.status = 'completed';
        step3.result = 'No GC was forced: this WebView does not expose window.gc. Nothing was reclaimed; no reclaimed-MB figure is invented.';
      }

      const step4: ExecutionLog = {
        step: 4,
        toolName: 'export_memory_report',
        status: 'running',
        detail: 'Compiling the measured-values-only memory report...',
      };
      setLogs([step1, step2, step3, step4]);
      setCurrentStepIndex(4);
      await new Promise((r) => setTimeout(r, 550));

      const reportData = {
        timestamp: new Date().toISOString(),
        measured: perf
          ? {
              usedJSHeapMB: mb(perf.usedJSHeapSize),
              totalJSHeapMB: mb(perf.totalJSHeapSize),
              jsHeapSizeLimitMB: mb(perf.jsHeapSizeLimit),
              source: 'performance.memory (measured)',
            }
          : { source: 'performance.memory not exposed by this WebView' },
        forcedGcRan: gcAvailable,
        notMeasurableFromPage: [
          'detached DOM node inventory',
          'other documents audio contexts',
          'unrevoked Blob URL inventory',
        ],
        note: 'Only genuinely measured values appear. A web page cannot force GC (without dev tooling) or enumerate detached nodes, so no leak verdict or reclaimed-memory figure is claimed.',
      };

      const reportBlob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
      const reportUrl = URL.createObjectURL(reportBlob);
      setGeneratedFile({
        name: 'Hermes_Memory_Report.json',
        url: reportUrl,
        size: '1.2 KB',
      });

      triggerHaptic([60, 40, 60]);
      step4.status = 'completed';
      step4.result = 'Hermes_Memory_Report.json generated from measured values only.';

      setFinalOutput(
        `### 🧹 App Memory Reality Check (measured values only)\n\n` +
        `#### 📊 Heap (measured):\n` +
        `- ${heapSummary}\n\n` +
        `#### 🔍 Orphan detection:\n` +
        `- Not measurable from inside a page: detached DOM nodes, other pages audio contexts, Blob URL inventories. No counts are claimed.\n\n` +
        `#### ♻️ GC:\n` +
        `- ${step3.result}\n\n` +
        `#### 💡 What this means:\n` +
        `1. No "healthy/no-leak" verdict is issued - a page cannot measure that honestly.\n` +
        `2. Tap **Download Report** below for the measured-values-only JSON report.`
      );
    } else if (workflowId === 'privacy-telemetry-audit') {
      // Measured where possible; the app's design facts are stated as design
      // facts - never dressed up as a "cryptographically verified" audit. A
      // page cannot prove zero egress, so no such claim is made.
      const step1: ExecutionLog = {
        step: 1,
        toolName: 'storage_auditor',
        status: 'running',
        detail: 'Counting the real localStorage keys and measuring browser storage usage...',
      };
      setLogs([step1]);
      setCurrentStepIndex(1);
      await new Promise((r) => setTimeout(r, 650));

      let localKeys = 0;
      let localBytes = 0;
      try {
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          localKeys++;
          if (k) localBytes += k.length + (window.localStorage.getItem(k)?.length || 0);
        }
      } catch (_) {
        // Access blocked: report unknown instead of guessing.
      }
      let quotaText = 'unknown (storage.estimate not exposed or refused)';
      if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
        try {
          const { quota = 0, usage = 0 } = await navigator.storage.estimate();
          quotaText = `${Math.max(0, Math.round(usage / (1024 * 1024)))} MB used of a ${Math.max(0, Math.round(quota / (1024 * 1024)))} MB quota (measured)`;
        } catch (_) {}
      }
      const storageAccessible = localKeys > 0 || localBytes > 0;
      step1.status = 'completed';
      step1.result = storageAccessible
        ? `Measured: ${localKeys} localStorage keys holding roughly ${Math.max(1, Math.round(localBytes / 1024))} KB; browser storage: ${quotaText}.`
        : `Measured: browser storage: ${quotaText}. localStorage access was blocked or empty, so key counts are unknown.`;

      const step2: ExecutionLog = {
        step: 2,
        toolName: 'design_facts_review',
        status: 'running',
        detail: 'Stating the app design facts that are checkable from the codebase (not runtime measurements)...',
      };
      setLogs([step1, step2]);
      setCurrentStepIndex(2);
      await new Promise((r) => setTimeout(r, 700));
      step2.status = 'completed';
      step2.result = 'Design facts (from the app source, not a runtime audit): no analytics or crash-reporting SDK is embedded; chats, notes, alarms and settings are stored locally; network requests are made only to model endpoints the user configures.';

      const step3: ExecutionLog = {
        step: 3,
        toolName: 'capability_limits',
        status: 'running',
        detail: 'Checking what a web page cannot observe...',
      };
      setLogs([step1, step2, step3]);
      setCurrentStepIndex(3);
      await new Promise((r) => setTimeout(r, 700));
      step3.status = 'completed';
      step3.result = 'Not observable from inside a page: OS-level network traffic, other apps sockets, clipboard contents outside this app. No claims are made about them.';

      const step4: ExecutionLog = {
        step: 4,
        toolName: 'export_privacy_report',
        status: 'running',
        detail: 'Compiling the measured-storage plus design-facts report...',
      };
      setLogs([step1, step2, step3, step4]);
      setCurrentStepIndex(4);
      await new Promise((r) => setTimeout(r, 600));

      const privacyReport = {
        reportId: `PRIV-${Date.now().toString(36).toUpperCase()}`,
        timestamp: new Date().toISOString(),
        measured: {
          localStorageKeys: localKeys,
          approxLocalStorageKB: Math.max(1, Math.round(localBytes / 1024)),
          browserStorage: quotaText,
        },
        designFacts: [
          'No analytics or crash-reporting SDK is embedded in the app source.',
          'Chats, notes, alarms and settings are stored locally (localStorage / IndexedDB).',
          'Network requests go only to model endpoints the user configures.',
        ],
        notObservableFromPage: ['OS-level network traffic', 'other apps sockets', 'system clipboard outside this app'],
        note: 'This report contains measured values and stated design facts only. A web page cannot cryptographically prove data-egress behavior, so no verification or integrity seal is claimed.',
      };

      const certBlob = new Blob([JSON.stringify(privacyReport, null, 2)], { type: 'application/json' });
      const certUrl = URL.createObjectURL(certBlob);
      setGeneratedFile({
        name: 'Hermes_Local_Storage_Privacy_Report.json',
        url: certUrl,
        size: '1.2 KB',
      });

      triggerHaptic([60, 40, 60]);
      step4.status = 'completed';
      step4.result = 'Hermes_Local_Storage_Privacy_Report.json generated (measured values + design facts).';

      setFinalOutput(
        `### 🛡️ Local Storage & Privacy Report\n\n` +
        `#### 🔒 Measured Storage:\n` +
        `- ${step1.result}\n\n` +
        `#### 🧱 Design Facts (from the app source, not a runtime audit):\n` +
        `- No analytics or crash-reporting SDK is embedded\n` +
        `- Chats, notes, alarms and settings stay in local storage\n` +
        `- Network requests go only to the model endpoints you configure\n\n` +
        `#### ⚠️ Honest limits:\n` +
        `- A page cannot observe OS-level traffic or other apps, and cannot cryptographically prove "zero egress". This report makes no such claim.\n\n` +
        `- **Report ID**: \`${privacyReport.reportId}\`\n` +
        `- Tap **Download Report** below to export the JSON report.`
      );
    } else if (workflowId === 'batch-content-redactor') {
      const step1: ExecutionLog = {
        step: 1,
        toolName: 'discover_batch_files',
        status: 'running',
        detail: 'Preparing clearly-labeled example documents (no files on this phone are read)...',
      };
      setLogs([step1]);
      setCurrentStepIndex(1);
      await new Promise((r) => setTimeout(r, 650));
      step1.status = 'completed';
      step1.result = 'Example documents (sample data - nothing on this phone was read): support_chat_q4.txt, vendor_agreement.md, crash_trace.log, customer_feedback.csv.';

      const step2: ExecutionLog = {
        step: 2,
        toolName: 'ner_pii_entity_detector',
        status: 'running',
        detail: 'No NER model runs in this scripted step - counting entities in the labeled example set...',
      };
      setLogs([step1, step2]);
      setCurrentStepIndex(2);
      await new Promise((r) => setTimeout(r, 700));
      step2.status = 'completed';
      step2.result = 'Sample data: 28 entities in the example set (8 emails, 5 phone numbers, 3 credit cards, 12 full names).';

      const step3: ExecutionLog = {
        step: 3,
        toolName: 'pseudonymization_engine',
        status: 'running',
        detail: 'Showing how the example entities would map to masked pseudo-tokens...',
      };
      setLogs([step1, step2, step3]);
      setCurrentStepIndex(3);
      await new Promise((r) => setTimeout(r, 700));
      step3.status = 'completed';
      step3.result = 'Sample mapping: the 28 example entities map to masked pseudonyms (e.g. [EMAIL_USER_1], [PHONE_SAFE_A], [PERSON_SIGMA]). No real document was changed.';

      const step4: ExecutionLog = {
        step: 4,
        toolName: 'export_redacted_bundle',
        status: 'running',
        detail: 'Packaging the example rows into an exportable JSON report...',
      };
      setLogs([step1, step2, step3, step4]);
      setCurrentStepIndex(4);
      await new Promise((r) => setTimeout(r, 600));

      const redactionReport = {
        redactionId: `RED-${Date.now().toString(36).toUpperCase()}`,
        timestamp: new Date().toISOString(),
        sampleData: true,
        note: 'All rows below are example data. No document on this phone was read, scanned, or modified by this scripted pipeline.',
        summary: {
          filesProcessed: 4,
          totalPiiEntitiesScrubbed: 28,
          entityBreakdown: {
            emails: 8,
            phoneNumbers: 5,
            creditCards: 3,
            fullNames: 12,
          },
        },
        processedFiles: [
          { filename: 'support_chat_q4.sanitized.txt (example)', piiCount: 11, status: 'Example row' },
          { filename: 'vendor_agreement.sanitized.md (example)', piiCount: 7, status: 'Example row' },
          { filename: 'crash_trace.sanitized.log (example)', piiCount: 4, status: 'Example row' },
          { filename: 'customer_feedback.sanitized.csv (example)', piiCount: 6, status: 'Example row' },
        ],
      };

      const redactionBlob = new Blob([JSON.stringify(redactionReport, null, 2)], { type: 'application/json' });
      const redactionUrl = URL.createObjectURL(redactionBlob);
      setGeneratedFile({
        name: 'Hermes_Redaction_Example_Report.json',
        url: redactionUrl,
        size: '1.4 KB',
      });

      triggerHaptic([60, 40, 60]);
      step4.status = 'completed';
      step4.result = 'Hermes_Redaction_Example_Report.json generated (labeled example data).';

      setFinalOutput(
        `### 🔒 Batch Content Redactor - EXAMPLE RUN\n\n` +
        `**No document on this phone was read or modified.** The rows below demonstrate the report format with labeled sample data.\n\n` +
        `#### 📊 Example Redaction Metrics:\n` +
        `- **Example Documents**: 4 (sample rows)\n` +
        `- **Example PII Entities**: 28\n` +
        `  - 📧 **Emails**: 8 mapped to pseudonyms\n` +
        `  - 📱 **Phone Numbers**: 5 mapped to pseudo-formats\n` +
        `  - 💳 **Credit Card Numbers**: 3 mapped to tokens\n` +
        `  - 👤 **Full Names**: 12 mapped to synthetic tokens\n\n` +
        `- **Redaction Example ID**: \`${redactionReport.redactionId}\`\n` +
        `- Tap **Download Report** below to export the labeled example JSON.`
      );
    } else if (workflowId === 'dependency-compliance-audit') {
      const step1: ExecutionLog = {
        step: 1,
        toolName: 'parse_dependency_manifests',
        status: 'running',
        detail: 'No lockfile runs on the phone - preparing clearly-labeled example dependency counts...',
      };
      setLogs([step1]);
      setCurrentStepIndex(1);
      await new Promise((r) => setTimeout(r, 650));
      step1.status = 'completed';
      step1.result = 'Example data: 42 direct production dependencies, 18 dev dependencies, 386 transitive packages. These counts are not read from this phone.';

      const step2: ExecutionLog = {
        step: 2,
        toolName: 'cve_vulnerability_scanner',
        status: 'running',
        detail: 'Noting that a real CVE audit requires a live vulnerability database, which this offline pipeline does not query...',
      };
      setLogs([step1, step2]);
      setCurrentStepIndex(2);
      await new Promise((r) => setTimeout(r, 700));
      step2.status = 'completed';
      step2.result = 'No CVE scan ran: this scripted pipeline has no offline vulnerability database. The example below shows the report format only.';

      const step3: ExecutionLog = {
        step: 3,
        toolName: 'license_compliance_engine',
        status: 'running',
        detail: 'Preparing labeled example license distribution numbers...',
      };
      setLogs([step1, step2, step3]);
      setCurrentStepIndex(3);
      await new Promise((r) => setTimeout(r, 700));
      step3.status = 'completed';
      step3.result = 'Example data: MIT 88.4%, Apache-2.0 9.5%, BSD-3-Clause 2.1%. These are sample rows, not a scan of any dependency tree.';

      const step4: ExecutionLog = {
        step: 4,
        toolName: 'export_sbom_certificate',
        status: 'running',
        detail: 'Generating the example SBOM report JSON...',
      };
      setLogs([step1, step2, step3, step4]);
      setCurrentStepIndex(4);
      await new Promise((r) => setTimeout(r, 600));

      const sbomReport = {
        auditId: `SBOM-${Date.now().toString(36).toUpperCase()}`,
        timestamp: new Date().toISOString(),
        sampleData: true,
        note: 'Example SBOM format. No dependency tree on this phone was parsed and no vulnerability database was queried; all counts below are sample rows.',
        packageManager: 'npm (example)',
        framework: 'Next.js 16 + Capacitor Android (this app)',
        summary: {
          totalPackagesScanned: 446,
          vulnerabilities: {
            critical: 0,
            high: 0,
            moderate: 0,
            low: 1,
          },
          licenseCompliance: {
            mitCount: 394,
            apacheCount: 42,
            bsdCount: 10,
            copyleftViolations: 0,
          },
        },
        spdxVersion: 'SPDX-2.3 (example report)',
      };

      const sbomBlob = new Blob([JSON.stringify(sbomReport, null, 2)], { type: 'application/json' });
      const sbomUrl = URL.createObjectURL(sbomBlob);
      setGeneratedFile({
        name: 'Hermes_SBOM_Example_Report.json',
        url: sbomUrl,
        size: '1.5 KB',
      });

      triggerHaptic([60, 40, 60]);
      step4.status = 'completed';
      step4.result = 'Hermes_SBOM_Example_Report.json generated (labeled sample data).';

      setFinalOutput(
        `### 🛡️ Dependency Compliance - EXAMPLE SBOM\n\n` +
        `**No dependency tree on this phone was parsed, and no vulnerability database was queried.** The numbers below are labeled sample rows that demonstrate the report format.\n\n` +
        `#### 📊 Example Dependency Counts:\n` +
        `- **Packages**: 446 (sample rows: 42 direct, 18 dev, 386 transitive)\n` +
        `- **CVE scan**: not performed (requires a live vulnerability database)\n\n` +
        `#### 📜 Example License Distribution:\n` +
        `- **MIT**: 88.4% | **Apache 2.0**: 9.5% | **BSD-3-Clause**: 2.1% (sample rows)\n\n` +
        `#### 📦 Report:\n` +
        `- **Example Audit ID**: \`${sbomReport.auditId}\`\n` +
        `- Tap **Download Report** below to export the labeled example JSON SBOM.`
      );
    } else {
      // General pipeline: real diagnostics, a real app-local search, and a
      // real haptic alert. It never claims the user's goal itself was
      // executed - that would be fabrication.
      const step1: ExecutionLog = { step: 1, toolName: 'device_diagnostics', status: 'running', detail: 'Reading real hardware values via device_diagnostics...' };
      setLogs([step1]);
      setCurrentStepIndex(1);
      await new Promise((r) => setTimeout(r, 500));
      const genDiagTool = AGENT_TOOLS.find((t) => t.name === 'device_diagnostics');
      const genDiagResult = genDiagTool ? await genDiagTool.execute({ metric: 'all' }) : 'Diagnostics tool unavailable.';
      step1.status = 'completed';
      step1.result = genDiagResult;

      const step2: ExecutionLog = { step: 2, toolName: 'find_device_files', status: 'running', detail: `Searching app-local files matching: "${prompt}"...` };
      setLogs([step1, step2]);
      setCurrentStepIndex(2);
      await new Promise((r) => setTimeout(r, 600));
      const genFindTool = AGENT_TOOLS.find((t) => t.name === 'find_device_files');
      const genFindResult = genFindTool ? await genFindTool.execute({ query: prompt }) : 'App-local search unavailable.';
      step2.status = 'completed';
      step2.result = genFindResult;

      const step3: ExecutionLog = { step: 3, toolName: 'haptic_vibration', status: 'running', detail: 'Dispatching physical haptic motor feedback alert...' };
      setLogs([step1, step2, step3]);
      setCurrentStepIndex(3);
      await new Promise((r) => setTimeout(r, 400));
      triggerHaptic([100, 50, 100]);
      step3.status = 'completed';
      step3.result = 'Haptic vibration dispatched.';

      setFinalOutput(
        `✅ **Pipeline finished - what actually ran:**\n\n` +
        `- **Real diagnostics**: ${genDiagResult}\n` +
        `- **Real app-local search for your goal**: ${genFindResult}\n` +
        `- **Haptic alert**: dispatched\n\n` +
        `Your goal ("${prompt}") itself was not executed by an autonomous engine - this scripted pipeline runs the three real steps above and nothing more.`
      );
    }

    // The finally in runWorkflow always clears the running state.
  };

  const handleShareResult = async () => {
    if (!finalOutput) return;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'Hermes AI Task Result',
          text: finalOutput,
        });
        return;
      } catch (err) {
        // Dismissal is not a failure; anything else falls through to the
        // honest clipboard attempt below.
        if ((err as { name?: string })?.name === 'AbortError') return;
      }
    }
    copyOutputToClipboard();
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-zinc-950 px-3 py-3 max-w-4xl mx-auto w-full pb-20">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-950/40 via-zinc-900 to-rose-950/30 border border-amber-500/20 p-4 mb-4 shadow-xl">
        <div className="flex items-center gap-2 mb-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-bold uppercase tracking-wider">
            <Zap className="w-3 h-3" />
            <span>Mobile Task Pipelines & Execution</span>
          </div>
        </div>
        <h1 className="text-xl font-black text-white tracking-tight">Mobile Task Pipelines</h1>
        <p className="text-xs text-zinc-400 max-w-lg mt-1 leading-relaxed">
          Real app-local file search, measured device diagnostics and on-device voice run for real; outputs that a scripted step cannot honestly produce are clearly labeled sample data.
        </p>

        <button
          onClick={() => setIsToolTesterOpen(true)}
          className="mt-3 px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all w-fit shadow-md"
        >
          <Wrench className="w-3.5 h-3.5" />
          <span>Structured Tool & JSON Schema Playground</span>
        </button>
      </div>

      {/* Preset Workflow Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-4">
        {PRESET_WORKFLOWS.map((wf) => {
          const isSelected = activeWorkflowId === wf.id;
          const Icon = wf.icon;
          return (
            <div
              key={wf.id}
              onClick={() => {
                if (!isRunning) setActiveWorkflowId(wf.id);
              }}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'bg-zinc-900 border-amber-500/60 shadow-lg shadow-amber-500/10 ring-1 ring-amber-500/30'
                  : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-2 rounded-xl bg-gradient-to-br ${wf.color} text-white shadow-md`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-mono font-bold text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded-full border border-zinc-800">
                    {wf.stepsCount} Steps
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white mb-1">{wf.title}</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">{wf.description}</p>
              </div>

              <div className="mt-3 pt-2.5 border-t border-zinc-800/80 flex items-center justify-between">
                <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">{wf.category}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveWorkflowId(wf.id);
                    // The diff auditor parses the goal-box content: pass it
                    // when it actually looks like a diff, so prose goals fall
                    // through to the honest "no diff pasted" path instead of
                    // being counted as hunks.
                    runWorkflow(wf.id, wf.id === 'git-diff-auditor' && looksLikeUnifiedDiff(customGoal) ? customGoal.trim() : undefined);
                  }}
                  disabled={isRunning}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-black font-extrabold text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Execute</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Custom Task Input */}
      <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-3.5 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">Custom Autonomous Phone Goal</h3>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={customGoal}
            onChange={(e) => setCustomGoal(e.target.value)}
            placeholder="e.g. Find all photos taken last week, summarize with Vision OCR, and share to WhatsApp..."
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
          />
          <button
            onClick={() => {
              if (customGoal.trim()) {
                runWorkflow('custom', customGoal.trim());
              }
            }}
            disabled={isRunning || !customGoal.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition-all cursor-pointer disabled:opacity-50 shrink-0"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Run Task</span>
          </button>
        </div>
      </div>

      {/* Real-Time Execution Console & Progress */}
      {(isRunning || logs.length > 0) && (
        <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-4 mb-4 shadow-xl">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Live Autonomous Execution Pipeline</h3>
            </div>
            {isRunning && (
              <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-mono font-bold animate-pulse">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                Step {currentStepIndex} in progress...
              </span>
            )}
          </div>

          {/* Stepper Logs */}
          <div className="space-y-2 font-mono text-xs">
            {logs.map((log) => (
              <div
                key={log.step}
                className={`p-3 rounded-xl border transition-all ${
                  log.status === 'completed'
                    ? 'bg-zinc-950/80 border-emerald-500/30 text-emerald-300'
                    : log.status === 'running'
                    ? 'bg-zinc-950/90 border-amber-500/50 text-amber-300 animate-pulse'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-500'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold">
                    Step {log.step}: [{log.toolName}]
                  </span>
                  <span className="text-[10px] uppercase font-bold">
                    {log.status === 'completed' ? '✅ Completed' : log.status === 'running' ? '⚡ Executing' : 'Pending'}
                  </span>
                </div>
                <div className="text-[11px] text-zinc-300 font-sans">{log.detail}</div>
                {log.result && (
                  <div className="mt-2 pt-2 border-t border-zinc-800/80 text-[10px] text-zinc-400 font-mono whitespace-pre-wrap leading-relaxed">
                    {log.result}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Generated Real Output File Card */}
          {generatedFile && (
            <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-emerald-950/40 via-zinc-950 to-teal-950/40 border border-emerald-500/40 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
                <div>
                  <div className="text-xs font-bold text-white">{generatedFile.name}</div>
                  <div className="text-[10px] text-zinc-400">Generated Spreadsheet • {generatedFile.size}</div>
                </div>
              </div>
              <a
                href={generatedFile.url}
                download={generatedFile.name}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs shadow-md transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save to Phone</span>
              </a>
            </div>
          )}

          {/* Final Output Summary & Share Sheet */}
          {finalOutput && (
            <div className="mt-3 p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 font-sans">
              <div className="text-xs text-zinc-200 whitespace-pre-wrap leading-relaxed mb-3">
                {finalOutput}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleShareResult}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Share to Apps</span>
                </button>
                <button
                  onClick={copyOutputToClipboard}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-bold text-xs transition-all cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  onClick={handleExportWorkflowMarkdown}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/40 border border-indigo-500/40 text-indigo-200 hover:text-white font-bold text-xs transition-all cursor-pointer"
                  title="Export results to a Markdown (.md) document"
                >
                  <Download className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Export .md</span>
                </button>
                {copyFailed && (
                  <span className="text-[10px] text-rose-300 font-semibold leading-snug">
                    Copy failed - clipboard blocked. Nothing was copied.
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {/* Structured Tool Calling & JSON Schema Modal */}
      <StructuredToolTesterModal
        isOpen={isToolTesterOpen}
        onClose={() => setIsToolTesterOpen(false)}
      />
    </div>
  );
}
