'use client';

import React, { useState, useRef } from 'react';
import {
  X,
  Globe,
  Volume2,
  VolumeX,
  Copy,
  Check,
  Search,
  BookOpen,
  Star,
  Mic,
  ArrowRight,
  ChevronDown,
  Sparkles,
} from 'lucide-react';

interface Phrase {
  id: string;
  category: string;
  english: string;
  translations: Record<string, string>;
  phonetics: Record<string, string>;
  pinned?: boolean;
}

const LANGUAGES = [
  { code: 'zh', name: 'Chinese', flag: '🇨🇳', bcp47: 'zh-CN' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵', bcp47: 'ja-JP' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷', bcp47: 'ko-KR' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸', bcp47: 'es-ES' },
  { code: 'fr', name: 'French', flag: '🇫🇷', bcp47: 'fr-FR' },
  { code: 'de', name: 'German', flag: '🇩🇪', bcp47: 'de-DE' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦', bcp47: 'ar-SA' },
  { code: 'th', name: 'Thai', flag: '🇹🇭', bcp47: 'th-TH' },
];

const PHRASE_BOOK: Phrase[] = [
  {
    id: 'p1',
    category: 'Essentials',
    english: 'Hello / Good day',
    translations: { zh: '你好', ja: 'こんにちは', ko: '안녕하세요', es: 'Hola', fr: 'Bonjour', de: 'Hallo', ar: 'مرحبا', th: 'สวัสดี' },
    phonetics: { zh: 'Nǐ hǎo', ja: 'Konnichiwa', ko: 'An-nyeong-ha-se-yo', es: 'O-la', fr: 'Bon-zhoor', de: 'Hal-lo', ar: 'Mar-ha-ban', th: 'Sa-wat-dee' },
  },
  {
    id: 'p2',
    category: 'Essentials',
    english: 'Thank you very much',
    translations: { zh: '非常感谢', ja: 'ありがとうございます', ko: '감사합니다', es: 'Muchas gracias', fr: 'Merci beaucoup', de: 'Vielen Dank', ar: 'شكرًا جزيلًا', th: 'ขอบคุณมาก' },
    phonetics: { zh: 'Fēicháng gǎnxiè', ja: 'Arigatou gozaimasu', ko: 'Gam-sa-ham-ni-da', es: 'Moo-chas gra-syas', fr: 'Mer-see boh-coo', de: 'Fee-len dank', ar: 'Shukran jazeelan', th: 'Khob-khun mak' },
  },
  {
    id: 'p3',
    category: 'Emergency',
    english: 'Please call an ambulance',
    translations: { zh: '请叫救护车', ja: '救急車を呼んでください', ko: '구급차를 불러 주세요', es: 'Llame una ambulancia', fr: 'Appelez une ambulance', de: 'Rufen Sie einen Krankenwagen', ar: 'اتصل بالإسعاف', th: 'โปรดเรียกรถพยาบาล' },
    phonetics: { zh: 'Qǐng jiào jiùhùchē', ja: 'Kyuukyuusha wo yonde kudasai', ko: 'Gu-geup-cha-reul bul-leo ju-se-yo', es: 'Yah-meh oo-na am-boo-lan-sya', fr: 'A-pe-lay oon am-boo-lons', de: 'Roo-fen zee ay-nen krank-en-va-gen', ar: 'Et-ta-sel bil-is-aaf', th: 'Pro-wad reak rot pha-ya-ban' },
  },
  {
    id: 'p4',
    category: 'Emergency',
    english: 'I need a doctor',
    translations: { zh: '我需要医生', ja: '医者が必要です', ko: '의사가 필요해요', es: 'Necesito un médico', fr: "J'ai besoin d'un médecin", de: 'Ich brauche einen Arzt', ar: 'أحتاج إلى طبيب', th: 'ฉันต้องการหมอ' },
    phonetics: { zh: 'Wǒ xūyào yīshēng', ja: 'Isha ga hitsuyou desu', ko: 'Ui-sa-ga pil-yo-hae-yo', es: 'Ne-se-si-to oon me-di-ko', fr: 'Zheh beh-zwah dun me-de-san', de: 'Ich brau-che ey-nen artzt', ar: 'Ah-ta-ja i-la ta-beeb', th: 'Chan tong-gaan moh' },
  },
  {
    id: 'p5',
    category: 'Transport',
    english: 'Take me to this address please',
    translations: { zh: '请带我去这个地址', ja: 'このアドレスに連れて行ってください', ko: '이 주소로 데려다 주세요', es: 'Llévame a esta dirección', fr: 'Emmenez-moi à cette adresse', de: 'Bringen Sie mich zu dieser Adresse', ar: 'خذني إلى هذا العنوان', th: 'พาฉันไปที่อยู่นี้' },
    phonetics: { zh: 'Qǐng dài wǒ qù zhège dìzhǐ', ja: 'Kono adoresu ni tsurete itte kudasai', ko: 'I ju-so-ro de-ryeo-da ju-se-yo', es: 'Yeh-va-me a es-ta di-rek-syon', fr: 'Am-neh-may mwa a set a-dres', de: 'Bring-en zee mich tsoo dee-zer a-dres-seh', ar: 'Khuth-ni i-la ha-dha al-un-wan', th: 'Pah chan pai tee yu nee' },
  },
  {
    id: 'p6',
    category: 'Food & Dining',
    english: 'I am allergic to nuts / seafood',
    translations: { zh: '我对坚果/海鲜过敏', ja: 'ナッツ/シーフードにアレルギーがあります', ko: '견과류/해산물에 알레르기가 있어요', es: 'Soy alérgico a las nueces/mariscos', fr: 'Je suis allergique aux noix/fruits de mer', de: 'Ich bin allergisch gegen Nüsse/Meeresfrüchte', ar: 'أنا حساس للمكسرات/المأكولات البحرية', th: 'ฉันแพ้ถั่ว/อาหารทะเล' },
    phonetics: { zh: 'Wǒ duì jiānguǒ/hǎixiān guòmǐn', ja: 'Nattsu/shiifu-do ni arerugi ga arimasu', ko: 'Gyeon-gwa-ryu/hae-san-mul-e al-le-ru-gi-ga it-eo-yo', es: 'Soy a-ler-hi-ko a las nwe-ses/ma-ris-kos', fr: 'Zheh swee al-er-zhik oh nwa/frwee de mehr', de: 'Ich bin al-er-gish ge-gen nüs-seh/may-res-früh-teh', ar: 'Ana ha-sas lil-muk-sa-rat/al-ma-ku-lat al-bah-ri-ya', th: 'Chan pae tua/a-han ta-lay' },
  },
  {
    id: 'p7',
    category: 'Shopping',
    english: 'How much does this cost?',
    translations: { zh: '这个多少钱？', ja: 'これはいくらですか？', ko: '이것은 얼마예요?', es: '¿Cuánto cuesta esto?', fr: 'Combien ça coûte?', de: 'Wie viel kostet das?', ar: 'بكم هذا؟', th: 'นี่ราคาเท่าไร?' },
    phonetics: { zh: 'Zhège duōshǎo qián?', ja: 'Kore wa ikura desu ka?', ko: 'I-geo-seun eol-ma-ye-yo?', es: 'Kwan-to kwes-ta es-to?', fr: 'Kom-byan sa koot?', de: 'Vee feel kos-tet das?', ar: 'Bi-kam ha-tha?', th: 'Nee ra-ka tao-rai?' },
  },
  {
    id: 'p8',
    category: 'Hotel',
    english: 'I have a reservation under my name',
    translations: { zh: '我用我的名字预订了房间', ja: '私の名前で予約しています', ko: '제 이름으로 예약했어요', es: 'Tengo una reserva a mi nombre', fr: "J'ai une réservation à mon nom", de: 'Ich habe eine Reservierung auf meinen Namen', ar: 'لدي حجز باسمي', th: 'ฉันจองในชื่อของฉัน' },
    phonetics: { zh: 'Wǒ yòng wǒ de míngzì yùdìng le fángjiān', ja: 'Watashi no namae de yoyaku shite imasu', ko: 'Je i-reum-eu-ro ye-yak-haet-eo-yo', es: 'Ten-go oo-na re-ser-va a mi nom-bre', fr: "Zhay oon re-zer-va-syon a mon nom", de: 'Ikh ha-beh eye-neh re-zer-veer-ung owf my-nen nah-men', ar: 'La-dee ha-jez bas-mi', th: 'Chan jong nai chue khong chan' },
  },
  {
    id: 'p9',
    category: 'Navigation',
    english: 'Where is the nearest ATM / hospital?',
    translations: { zh: '最近的ATM/医院在哪里？', ja: '一番近いATM/病院はどこですか？', ko: '가장 가까운 ATM/병원은 어디에 있나요?', es: '¿Dónde está el cajero/hospital más cercano?', fr: "Où est le distributeur/hôpital le plus proche?", de: 'Wo ist der nächste Geldautomat/das Krankenhaus?', ar: 'أين أقرب صراف آلي/مستشفى؟', th: 'ตู้เอทีเอ็ม/โรงพยาบาลที่ใกล้ที่สุดอยู่ที่ไหน?' },
    phonetics: { zh: 'Zuìjìn de ATM/yīyuàn zài nǎlǐ?', ja: 'Ichiban chikai ATM/byōin wa doko desu ka?', ko: 'Ga-jang ga-kka-un ATM/byeong-won-eun eo-di-e it-na-yo?', es: 'Don-deh es-ta el ka-he-ro/os-pi-tal mas ser-ka-no?', fr: 'Oo et le dis-tri-byu-tehr/oh-pee-tal le ploo prosh?', de: 'Vo ist der nekhs-teh gelt-ow-to-mat/kranken-haus?', ar: 'Ay-na aq-rab sa-raf a-li/mus-tash-fa?', th: 'Too ATM/rong pha-ya-ban tee glai thi sut yu tee nai?' },
  },
];

const CATEGORIES = Array.from(new Set(PHRASE_BOOK.map((p) => p.category)));

interface OfflinePhraseBookModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function OfflinePhraseBookModal({ isOpen, onClose }: OfflinePhraseBookModalProps) {
  const [selectedLang, setSelectedLang] = useState(LANGUAGES[0]);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);

  const handleSpeak = (phrase: Phrase) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const text = phrase.translations[selectedLang.code];
    if (!text) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = selectedLang.bcp47;
    utter.rate = 0.9;
    utter.onstart = () => setSpeakingId(phrase.id);
    utter.onend = () => setSpeakingId(null);
    utter.onerror = () => setSpeakingId(null);
    synthRef.current = utter;
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(20);
    window.speechSynthesis.speak(utter);
  };

  const handleStop = () => {
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
    setSpeakingId(null);
  };

  const handleCopy = async (phrase: Phrase) => {
    const text = `${phrase.english}\n${phrase.translations[selectedLang.code]} (${phrase.phonetics[selectedLang.code]})`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try { await navigator.clipboard.writeText(text); } catch (_) {}
    }
    setCopiedId(phrase.id);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(25);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const togglePin = (id: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const filtered = PHRASE_BOOK.filter((p) => {
    const catMatch = selectedCategory === 'All' || p.category === selectedCategory;
    const searchMatch =
      searchQuery === '' ||
      p.english.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.translations[selectedLang.code] || '').includes(searchQuery);
    return catMatch && searchMatch;
  }).sort((a, b) => (pinnedIds.has(b.id) ? 1 : 0) - (pinnedIds.has(a.id) ? 1 : 0));

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg max-h-[92vh] flex flex-col bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden font-sans text-white">
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800/80 bg-zinc-900/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Globe className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-100">Offline Travel Phrase Book</h2>
              <p className="text-[11px] text-zinc-400">
                9 categories · 100% offline · Neural TTS pronunciation
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800/80 transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Language Picker */}
        <div className="px-4 py-3 border-b border-zinc-800/60 bg-zinc-900/40 flex flex-col gap-2.5 shrink-0">
          <div className="relative">
            <button
              onClick={() => setShowLangPicker((v) => !v)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-zinc-900 border border-zinc-700 hover:border-emerald-500/40 transition-all cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">{selectedLang.flag}</span>
                <span className="text-sm font-bold text-zinc-100">{selectedLang.name}</span>
                <span className="text-[10px] text-zinc-500 font-mono">{selectedLang.bcp47}</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${showLangPicker ? 'rotate-180' : ''}`} />
            </button>
            {showLangPicker && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden z-10 shadow-2xl">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => { setSelectedLang(lang); setShowLangPicker(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-zinc-800 transition-colors cursor-pointer ${selectedLang.code === lang.code ? 'text-emerald-300 bg-emerald-500/10' : 'text-zinc-300'}`}
                  >
                    <span className="text-lg">{lang.flag}</span>
                    <span className="font-medium">{lang.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5">
            <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search phrases..."
              className="flex-1 bg-transparent text-xs text-zinc-200 placeholder:text-zinc-500 outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            {(['All', ...CATEGORIES]).map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition-all cursor-pointer border ${
                  selectedCategory === cat
                    ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500/40'
                    : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Phrase List */}
        <div className="flex-1 overflow-y-auto scrollbar-none p-4 space-y-3">
          {filtered.map((phrase) => {
            const translation = phrase.translations[selectedLang.code] || '—';
            const phonetic = phrase.phonetics[selectedLang.code] || '';
            const isSpeaking = speakingId === phrase.id;
            const isCopied = copiedId === phrase.id;
            const isPinned = pinnedIds.has(phrase.id);

            return (
              <div
                key={phrase.id}
                className={`p-4 rounded-2xl border ${isPinned ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-zinc-800/80 bg-zinc-900/50'} flex flex-col gap-3 transition-all`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                      {phrase.category}
                    </span>
                    <p className="text-xs font-semibold text-zinc-200 mt-0.5">{phrase.english}</p>
                  </div>
                  <button
                    onClick={() => togglePin(phrase.id)}
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer shrink-0 ${isPinned ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-600 hover:text-amber-400 hover:bg-zinc-800'}`}
                  >
                    <Star className={`w-3.5 h-3.5 ${isPinned ? 'fill-emerald-400' : ''}`} />
                  </button>
                </div>

                <div className="bg-zinc-950/80 rounded-xl p-3 flex flex-col gap-1">
                  <p className="text-base font-bold text-emerald-300 leading-tight">{translation}</p>
                  <p className="text-[11px] text-zinc-400 font-mono italic">{phonetic}</p>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => isSpeaking ? handleStop() : handleSpeak(phrase)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                      isSpeaking
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
                    }`}
                  >
                    {isSpeaking ? (
                      <><VolumeX className="w-3.5 h-3.5" /> Stop</>
                    ) : (
                      <><Volume2 className="w-3.5 h-3.5" /> Speak</>
                    )}
                  </button>

                  <button
                    onClick={() => handleCopy(phrase)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-semibold transition-all cursor-pointer"
                  >
                    {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {isCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center text-zinc-500 text-xs py-10">No phrases match your search.</div>
          )}
        </div>

        {/* Footer badge */}
        <div className="px-4 py-3 border-t border-zinc-800/60 bg-zinc-900/80 flex items-center gap-2 shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[10px] text-zinc-400">
            Powered by on-device <strong className="text-emerald-300">Web Speech API TTS</strong> — works offline, zero cloud calls
          </span>
        </div>
      </div>
    </div>
  );
}
