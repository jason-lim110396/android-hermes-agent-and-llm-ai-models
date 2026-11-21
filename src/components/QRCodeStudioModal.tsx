'use client';

import React, { useState, useMemo, useRef } from 'react';
import {
  X,
  QrCode,
  Wifi,
  Globe,
  FileText,
  User,
  Coins,
  Copy,
  Check,
  Download,
  Share2,
  Sparkles,
  Send,
  Sliders,
  Palette,
  Eye,
  AlertTriangle,
} from 'lucide-react';
import { generateQRCode } from '@/utils/qrEncoder';
import { useBackButtonClose } from '@/utils/backButton';

type PayloadMode = 'wifi' | 'url' | 'text' | 'contact' | 'crypto';

interface ColorTheme {
  name: string;
  fg: string;
  bg: string;
  previewBg: string;
}

const COLOR_THEMES: ColorTheme[] = [
  { name: 'Emerald Cyber', fg: '#10b981', bg: '#09090b', previewBg: 'bg-zinc-950' },
  { name: 'Cyan Neon', fg: '#06b6d4', bg: '#09090b', previewBg: 'bg-zinc-950' },
  { name: 'Classic Mono', fg: '#ffffff', bg: '#000000', previewBg: 'bg-black' },
  { name: 'Amber Gold', fg: '#f59e0b', bg: '#09090b', previewBg: 'bg-zinc-950' },
  { name: 'Violet Pulse', fg: '#a855f7', bg: '#09090b', previewBg: 'bg-zinc-950' },
  { name: 'High Contrast Light', fg: '#000000', bg: '#ffffff', previewBg: 'bg-white' },
];

export default function QRCodeStudioModal({
  isOpen,
  onClose,
  onInsertIntoChat,
  onAuditWithAgent,
}: {
  isOpen: boolean;
  onClose: () => void;
  onInsertIntoChat?: (text: string) => void;
  onAuditWithAgent?: (prompt: string) => void;
}) {
  useBackButtonClose(isOpen, onClose);

  const [mode, setMode] = useState<PayloadMode>('wifi');
  const [selectedTheme, setSelectedTheme] = useState<ColorTheme>(COLOR_THEMES[0]);
  const [roundedDots, setRoundedDots] = useState(false);
  const [copied, setCopied] = useState(false);
  const [inserted, setInserted] = useState(false);

  // Form Fields
  // Wi-Fi
  const [wifiSsid, setWifiSsid] = useState('Hermes_Edge_5G');
  const [wifiPass, setWifiPass] = useState('Hermes2026!');
  const [wifiAuth, setWifiAuth] = useState<'WPA' | 'WEP' | 'nopass'>('WPA');
  const [wifiHidden, setWifiHidden] = useState(false);

  // URL
  const [urlVal, setUrlVal] = useState('https://github.com/jason-lim110396/android-hermes-agent-and-llm-ai-models');

  // Text
  const [textVal, setTextVal] = useState('Hermes Autonomous Edge Agent — Local LLM Studio v1.0');

  // Contact vCard. ORG defaults to empty: with the demo org filled in, the
  // payload is 124 bytes and exceeds what QR versions 1-6 can encode - the
  // studio would greet the user with the too-long error on first open.
  const [contactName, setContactName] = useState('Jason Lim');
  const [contactPhone, setContactPhone] = useState('+1-555-019-8234');
  const [contactEmail, setContactEmail] = useState('jason@hermes-ai.org');
  const [contactOrg, setContactOrg] = useState('');

  // Crypto
  const [cryptoCoin, setCryptoCoin] = useState<'BTC' | 'ETH' | 'SOL'>('ETH');
  const [cryptoAddress, setCryptoAddress] = useState('0x71C...49e3B');

  // Compute Raw String Payload
  // vCard 3.0 escapes backslash, comma and semicolon; the Wi-Fi config
  // format escapes backslash, semicolon, colon and double quote. Unescaped
  // values (a name typed as "Lim, Jason", an SSID containing ":") shift
  // every field boundary after them when scanned.
  const escapeVCardValue = (v: string) => v.replace(/([\\;,])/g, '\\$1');
  const escapeWifiValue = (v: string) => v.replace(/([\\;:"])/g, '\\$1');

  const payloadString = useMemo(() => {
    switch (mode) {
      case 'wifi':
        return `WIFI:T:${wifiAuth};S:${escapeWifiValue(wifiSsid)};P:${wifiAuth === 'nopass' ? '' : escapeWifiValue(wifiPass)};H:${wifiHidden ? 'true' : 'false'};;`;
      case 'url':
        return urlVal.trim();
      case 'text':
        return textVal.trim();
      case 'contact': {
        // Omit blank fields: every included line costs symbol capacity, and
        // empty vCard properties are invalid anyway.
        const lines = [
          'BEGIN:VCARD',
          'VERSION:3.0',
          `N:${escapeVCardValue(contactName)}`,
          `FN:${escapeVCardValue(contactName)}`,
          contactOrg.trim() ? `ORG:${escapeVCardValue(contactOrg.trim())}` : '',
          contactPhone.trim() ? `TEL:${escapeVCardValue(contactPhone.trim())}` : '',
          contactEmail.trim() ? `EMAIL:${escapeVCardValue(contactEmail.trim())}` : '',
          'END:VCARD',
        ].filter(Boolean);
        return lines.join('\n');
      }
      case 'crypto':
        return `${cryptoCoin.toLowerCase()}:${cryptoAddress.trim()}`;
      default:
        return textVal;
    }
  }, [
    mode,
    wifiSsid,
    wifiPass,
    wifiAuth,
    wifiHidden,
    urlVal,
    textVal,
    contactName,
    contactPhone,
    contactEmail,
    contactOrg,
    cryptoCoin,
    cryptoAddress,
  ]);

  // Generate QR Matrix. A payload longer than the supported versions can
  // hold is an error state the user must see - the encoder used to swallow
  // it and render a corrupt, unscannable matrix as if everything was fine.
  const qr = useMemo(() => {
    if (!payloadString) return { data: null as null, error: null as null };
    try {
      return { data: generateQRCode(payloadString), error: null as null };
    } catch (err) {
      return {
        data: null as null,
        error: err instanceof Error ? err.message : 'QR generation failed',
      };
    }
  }, [payloadString]);
  const qrData = qr.data;
  const qrError = qr.error;

  // Copy SVG or payload to clipboard
  const handleCopyPayload = () => {
    // Only report "Copied" when the clipboard write actually resolved.
    navigator.clipboard
      .writeText(payloadString)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setCopied(false));
  };

  // Download SVG
  const handleDownloadSVG = () => {
    if (!qrData) return;
    const svgEl = document.getElementById('hermes-qr-svg');
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hermes_qr_${mode}_${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Insert to active chat
  const handleInsertChat = () => {
    if (!onInsertIntoChat) return;
    onInsertIntoChat(
      `📱 **Hermes QR Code Payload (${mode.toUpperCase()})**:\n\`\`\`text\n${payloadString}\n\`\`\``
    );
    setInserted(true);
    setTimeout(() => setInserted(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
      >
        {/* Modal Header */}
        <div className="px-4 py-3 bg-zinc-900/90 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                QR Code & Barcode Studio
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  Zero-Cloud
                </span>
              </h2>
              <p className="text-[11px] text-zinc-400">
                Vector QR generator for Wi-Fi, contacts, URLs & crypto
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close QR code studio"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2.5 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col md:flex-row gap-5">
          {/* Left Column: Configuration Controls */}
          <div className="flex-1 space-y-4">
            {/* Mode Selector Tabs */}
            <div className="grid grid-cols-5 gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-semibold text-zinc-400">
              {[
                { id: 'wifi', label: 'Wi-Fi', icon: Wifi },
                { id: 'url', label: 'URL', icon: Globe },
                { id: 'text', label: 'Text', icon: FileText },
                { id: 'contact', label: 'vCard', icon: User },
                { id: 'crypto', label: 'Crypto', icon: Coins },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = mode === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setMode(tab.id as PayloadMode)}
                    className={`flex flex-col items-center gap-1 py-1.5 rounded-lg transition-all ${
                      isActive
                        ? 'bg-zinc-800 text-cyan-300 shadow font-bold'
                        : 'hover:text-zinc-200'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span className="text-[10px]">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Input Form Fields based on Mode */}
            <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3.5 space-y-3">
              {mode === 'wifi' && (
                <div className="space-y-2.5">
                  <div>
                    <label className="text-[11px] font-medium text-zinc-400 mb-1 block">
                      Network Name (SSID)
                    </label>
                    <input
                      type="text"
                      value={wifiSsid}
                      onChange={(e) => setWifiSsid(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500/50"
                      placeholder="MyHome_Wi-Fi"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-zinc-400 mb-1 block">
                      Wi-Fi Password
                    </label>
                    <input
                      type="text"
                      value={wifiPass}
                      onChange={(e) => setWifiPass(e.target.value)}
                      disabled={wifiAuth === 'nopass'}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500/50 disabled:opacity-40"
                      placeholder="Network Password"
                    />
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] text-zinc-400">Security:</label>
                      <select
                        value={wifiAuth}
                        onChange={(e) => setWifiAuth(e.target.value as 'WPA' | 'WEP' | 'nopass')}
                        className="bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-300 focus:outline-none"
                      >
                        <option value="WPA">WPA / WPA2 / WPA3</option>
                        <option value="WEP">WEP</option>
                        <option value="nopass">None (Open)</option>
                      </select>
                    </div>
                    <label className="flex items-center gap-1.5 text-[11px] text-zinc-400 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={wifiHidden}
                        onChange={(e) => setWifiHidden(e.target.checked)}
                        className="rounded border-zinc-700 bg-zinc-900 text-cyan-500 focus:ring-0"
                      />
                      <span>Hidden SSID</span>
                    </label>
                  </div>
                </div>
              )}

              {mode === 'url' && (
                <div>
                  <label className="text-[11px] font-medium text-zinc-400 mb-1 block">
                    Website URL
                  </label>
                  <input
                    type="url"
                    value={urlVal}
                    onChange={(e) => setUrlVal(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500/50"
                    placeholder="https://example.com"
                  />
                </div>
              )}

              {mode === 'text' && (
                <div>
                  <label className="text-[11px] font-medium text-zinc-400 mb-1 block">
                    Plain Text / Memo Payload
                  </label>
                  <textarea
                    rows={4}
                    value={textVal}
                    onChange={(e) => setTextVal(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500/50 resize-none"
                    placeholder="Enter message or memo to encode..."
                  />
                </div>
              )}

              {mode === 'contact' && (
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="col-span-2">
                    <label className="text-[11px] font-medium text-zinc-400 mb-1 block">Full Name</label>
                    <input
                      type="text"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-200"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-zinc-400 mb-1 block">Phone</label>
                    <input
                      type="tel"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-200"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-zinc-400 mb-1 block">Email</label>
                    <input
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-200"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[11px] font-medium text-zinc-400 mb-1 block">Organization</label>
                    <input
                      type="text"
                      value={contactOrg}
                      onChange={(e) => setContactOrg(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-200"
                    />
                  </div>
                </div>
              )}

              {mode === 'crypto' && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-zinc-400">Currency:</label>
                    <div className="flex gap-1">
                      {(['BTC', 'ETH', 'SOL'] as const).map((coin) => (
                        <button
                          key={coin}
                          onClick={() => setCryptoCoin(coin)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                            cryptoCoin === coin
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : 'bg-zinc-900 border border-zinc-800 text-zinc-400'
                          }`}
                        >
                          {coin}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-zinc-400 mb-1 block">Wallet Address</label>
                    <input
                      type="text"
                      value={cryptoAddress}
                      onChange={(e) => setCryptoAddress(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs font-mono text-zinc-200"
                      placeholder="Enter public address..."
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Styling Controls */}
            <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-cyan-400" />
                  Color Palettes
                </span>
                <label className="flex items-center gap-1.5 text-[11px] text-zinc-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={roundedDots}
                    onChange={(e) => setRoundedDots(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-900 text-cyan-500"
                  />
                  <span>Soft Dots</span>
                </label>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                {COLOR_THEMES.map((theme) => (
                  <button
                    key={theme.name}
                    onClick={() => setSelectedTheme(theme)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium shrink-0 transition-all ${
                      selectedTheme.name === theme.name
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300 shadow'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-full border border-white/20"
                      style={{ backgroundColor: theme.fg }}
                    />
                    <span>{theme.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Live QR Preview & Actions */}
          <div className="w-full md:w-72 flex flex-col items-center justify-between bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-4 shrink-0">
            {/* Visual Preview Box */}
            <div className="w-full flex flex-col items-center">
              <span className="text-[11px] font-mono text-zinc-400 mb-3 flex items-center gap-1">
                <Eye className="w-3 h-3 text-cyan-400" />
                Live Matrix Preview
              </span>

              <div
                className={`p-4 rounded-2xl border border-zinc-800 shadow-xl flex items-center justify-center transition-all ${selectedTheme.previewBg}`}
              >
                {qrData ? (
                  <svg
                    id="hermes-qr-svg"
                    viewBox={`0 0 ${qrData.size + 4} ${qrData.size + 4}`}
                    className="w-48 h-48 max-w-full"
                    style={{ shapeRendering: roundedDots ? 'geometricPrecision' : 'crispEdges' }}
                  >
                    {/* Background Rect */}
                    <rect
                      x="0"
                      y="0"
                      width={qrData.size + 4}
                      height={qrData.size + 4}
                      fill={selectedTheme.bg}
                    />
                    {/* Matrix Dots */}
                    {qrData.modules.map((row, r) =>
                      row.map((isDark, c) => {
                        if (!isDark) return null;
                        return (
                          <rect
                            key={`${r}-${c}`}
                            x={c + 2}
                            y={r + 2}
                            width="1"
                            height="1"
                            rx={roundedDots ? '0.35' : '0'}
                            fill={selectedTheme.fg}
                          />
                        );
                      })
                    )}
                  </svg>
                ) : qrError ? (
                  <div className="w-48 h-48 flex flex-col items-center justify-center text-center px-3">
                    <AlertTriangle className="w-6 h-6 text-rose-400 mb-2" />
                    <span className="text-[11px] text-rose-300 font-bold">Cannot encode payload</span>
                    <span className="text-[10px] text-zinc-500 mt-1.5 leading-snug">{qrError}</span>
                  </div>
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center text-xs text-zinc-500">
                    Generating...
                  </div>
                )}
              </div>

              {/* Payload length info */}
              <div className="mt-2 text-[10px] text-zinc-500 font-mono text-center">
                <span>{payloadString.length} chars</span>
                {qrData && <span> • Version {qrData.version}</span>}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="w-full space-y-2 mt-4">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={handleCopyPayload}
                  className="flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 text-xs font-semibold transition-all"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-zinc-400" />
                  )}
                  <span>{copied ? 'Copied' : 'Copy Text'}</span>
                </button>

                <button
                  onClick={handleDownloadSVG}
                  className="flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-300 text-xs font-semibold transition-all"
                >
                  <Download className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Save SVG</span>
                </button>
              </div>

              {onInsertIntoChat && (
                <button
                  onClick={handleInsertChat}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-cyan-500/40 text-cyan-300 text-xs font-semibold transition-all"
                >
                  {inserted ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>Send Payload to Chat</span>
                </button>
              )}

              {onAuditWithAgent && (
                <button
                  onClick={() => {
                    onAuditWithAgent(
                      `Please audit and explain this QR code payload:\n\nType: ${mode.toUpperCase()}\nPayload:\n${payloadString}`
                    );
                    onClose();
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-emerald-600/20 border border-emerald-500/30 hover:bg-emerald-600/30 text-emerald-300 text-xs font-semibold transition-all"
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Audit Payload with Agent</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
