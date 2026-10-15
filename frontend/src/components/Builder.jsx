import { useState, useRef, useEffect, useMemo } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Cpu, Layers, Database, HardDrive, Monitor, Zap, Fan, Box, 
  Tv, MousePointer2, Keyboard, BatteryCharging, FileDown, 
  Trash2, Send, Loader2, Sparkles, AlertCircle, AlertTriangle, ExternalLink, Key, X, Menu, RefreshCw,
  Copy, ShieldCheck, ShieldAlert, CircleHelp, CheckCircle2, Flame, Gamepad2, Rocket, Clapperboard, Briefcase
} from 'lucide-react';

const CATEGORY_ICONS = {
  "Processor": Cpu,
  "Motherboard": Layers,
  "RAM": Database,
  "Storage": HardDrive,
  "Graphics Card": Monitor,
  "PSU": Zap,
  "CPU Cooler": Fan,
  "Casing": Box,
  "Monitor": Tv,
  "Mouse": MousePointer2,
  "Keyboard": Keyboard,
  "UPS": BatteryCharging
};

const ANCHOR_CATEGORIES = [
  "Processor", "Graphics Card"
];

const PLATFORM_CATEGORIES = [
  "Motherboard", "RAM", "Storage", "PSU", "CPU Cooler", "Casing"
];

const PERIPHERAL_CATEGORIES = [
  "Monitor", "Mouse", "Keyboard", "UPS"
];

const PRESET_WORKLOADS = [
  { label: "1080p Gaming", prompt: "I need a budget 1080p gaming PC under 60,000 BDT with dedicated GPU", tag: "60k BDT", icon: Gamepad2 },
  { label: "1440p AAA Gaming", prompt: "I need a high-end 1440p gaming PC under 120,000 BDT with fast GPU and 32GB RAM", tag: "120k BDT", icon: Rocket },
  { label: "4K Video Editing", prompt: "I need a video editing and rendering PC under 90,000 BDT with fast multi-core CPU and 32GB RAM", tag: "90k BDT", icon: Clapperboard },
  { label: "Productivity & Office", prompt: "I need a fast office productivity PC under 35,000 BDT with fast SSD, no dedicated GPU", tag: "35k BDT", icon: Briefcase },
  { label: "High-End Workstation", prompt: "I need an extreme workstation PC under 180,000 BDT for 3D modeling and heavy multitasking", tag: "180k BDT", icon: Zap },
];

const PROMPT_MODIFIERS = [
  { label: "+ AMD Ryzen", append: ", prefer AMD Ryzen CPU" },
  { label: "+ Intel Core", append: ", prefer Intel Core CPU" },
  { label: "+ No GPU (iGPU)", append: ", exclude dedicated GPU (use integrated graphics)" },
  { label: "+ Include Monitor", append: ", include a 1080p IPS monitor in the budget" },
  { label: "+ 32GB RAM", append: ", must have 32GB RAM" },
];

const INITIAL_BUILD = {
  "Processor": null,
  "Motherboard": null,
  "RAM": null,
  "Storage": null,
  "Graphics Card": null,
  "PSU": null,
  "CPU Cooler": null,
  "Casing": null,
  "Monitor": null,
  "Mouse": null,
  "Keyboard": null,
  "UPS": null
};

const SESSION_KEY = 'buildmypc.session.v1';

function loadSavedSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object' || !saved.build) return null;
    return saved;
  } catch {
    return null;
  }
}

function sumBuild(build) {
  return Object.values(build).reduce((sum, item) => sum + (item?.price || 0), 0);
}

const formatPrice = (price) =>
  `৳${new Intl.NumberFormat('en-BD', { maximumFractionDigits: 0 }).format(price || 0)}`;

// Spec inference for hardware telemetry
function parseComponentTelemetry(category, name) {
  if (!name) return {};
  const upper = name.toUpperCase();
  const specs = {};

  if (category === "Processor") {
    if (upper.includes("AM5") || /RYZEN\s*[579]\s*(7|8|9)\d{3}/i.test(name)) specs.socket = "AM5";
    else if (upper.includes("AM4") || /RYZEN\s*[3579]\s*[12345]\d{3}/i.test(name)) specs.socket = "AM4";
    else if (/1[234]\d{2}[0-9]K?F?/i.test(name) || upper.includes("LGA1700") || upper.includes("1700")) specs.socket = "LGA1700";
    else if (/CORE\s*ULTRA/i.test(name) || upper.includes("1851")) specs.socket = "LGA1851";

    if (/RYZEN\s*9/i.test(name) || /I9/i.test(name)) specs.tdp = 125;
    else if (/RYZEN\s*7/i.test(name) || /I7/i.test(name)) specs.tdp = 105;
    else specs.tdp = 65;
  }

  if (category === "Graphics Card") {
    const vramMatch = name.match(/(\d{1,2})\s*GB/i);
    if (vramMatch) specs.vram = `${vramMatch[1]}GB VRAM`;
    
    if (/4090|5090|7900\s*XTX/i.test(name)) specs.tdp = 450;
    else if (/4080|5080|7900\s*XT/i.test(name)) specs.tdp = 320;
    else if (/4070|5070|7800\s*XT|6800/i.test(name)) specs.tdp = 220;
    else if (/4060|5060|7600|6600|6700/i.test(name)) specs.tdp = 160;
    else if (/3050|6500|1650/i.test(name)) specs.tdp = 130;
    else specs.tdp = 160;
  }

  if (category === "PSU") {
    const wattMatch = name.match(/(\d{3,4})\s*W/i);
    if (wattMatch) specs.wattage = parseInt(wattMatch[1], 10);
    else specs.wattage = 550;
  }

  if (category === "Motherboard") {
    if (/B650|X670|A620|X870/i.test(name)) specs.chipset = "AMD AM5";
    else if (/B550|X570|B450|A520/i.test(name)) specs.chipset = "AMD AM4";
    else if (/B760|Z790|H610|B660|Z690/i.test(name)) specs.chipset = "Intel LGA1700";
    else if (/Z890|B860/i.test(name)) specs.chipset = "Intel LGA1851";
  }

  if (category === "RAM") {
    if (upper.includes("DDR5")) specs.gen = "DDR5";
    else if (upper.includes("DDR4")) specs.gen = "DDR4";

    const capMatch = name.match(/(\d{1,3})\s*GB/i);
    if (capMatch) specs.capacity = `${capMatch[1]}GB`;

    const mhzMatch = name.match(/(\d{4})\s*MHZ/i);
    if (mhzMatch) specs.speed = `${mhzMatch[1]}MHz`;
  }

  return specs;
}

const SkeletonRow = ({ isHero = false }) => (
  <div className={`bezel-shell mb-3 animate-pulse ${isHero ? 'p-2 sm:p-2.5' : ''}`}>
    <div className={`bezel-inner p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${isHero ? 'min-h-24' : ''}`}>
      <div className="flex items-center gap-4 flex-1">
        <div className="w-12 h-12 bg-white/5 rounded-xl shrink-0"></div>
        <div className="flex flex-col gap-2 w-full">
          <div className="w-28 h-4 bg-white/10 rounded"></div>
          <div className="w-3/4 sm:w-64 h-4 bg-white/5 rounded"></div>
        </div>
      </div>
      <div className="w-24 h-6 bg-white/10 rounded"></div>
    </div>
  </div>
);

function Builder() {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "";
  const [savedSession] = useState(loadSavedSession);
  const [build, setBuild] = useState(() => ({ ...INITIAL_BUILD, ...(savedSession?.build || {}) }));
  const [explanation, setExplanation] = useState(savedSession?.explanation || "");
  const [chatInput, setChatInput] = useState("");
  const [selectedSite, setSelectedSite] = useState("startech");
  const [customSiteUrl, setCustomSiteUrl] = useState("");
  const [loadingState, setLoadingState] = useState("idle"); // idle, analyzing, selecting, checking, success, error
  const [hideUnconfigured, setHideUnconfigured] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [buildWarnings, setBuildWarnings] = useState(savedSession?.buildWarnings || []);
  const [customGroqKey, setCustomGroqKey] = useState(localStorage.getItem('customGroqKey') || "");
  const [customOllamaKey, setCustomOllamaKey] = useState(localStorage.getItem('customOllamaKey') || "");
  const [selectedProvider, setSelectedProvider] = useState(localStorage.getItem('aiProvider') || "ollama");
  const [showSettings, setShowSettings] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [queuePosition, setQueuePosition] = useState(0);
  const [showTrafficWarning, setShowTrafficWarning] = useState(false);
  const [previousIntent, setPreviousIntent] = useState(savedSession?.previousIntent || null);
  const [previousBuild, setPreviousBuild] = useState(savedSession?.previousBuild || null);
  const [toast, setToast] = useState(null); // { message, action?: { label, onClick } }
  const pollRef = useRef(null);

  const builderRef = useRef();
  const textareaRef = useRef(null);
  const loadingTimersRef = useRef([]);
  const abortControllerRef = useRef(null);
  const requestIdRef = useRef(0);
  const toastTimerRef = useRef(null);
  const settingsDialogRef = useRef(null);
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const onChange = (e) => setIsNarrow(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Total is always the sum of selected parts, so removals/undos can never drift.
  const total = useMemo(() => sumBuild(build), [build]);

  const dismissToast = () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(null);
  };

  const showToast = (message, action = null) => {
    setToast({ message, action });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
    }, action ? 6000 : 2800);
  };

  // Persist the working build so a refresh doesn't lose it.
  useEffect(() => {
    try {
      const hasParts = Object.values(build).some(Boolean);
      if (!hasParts) {
        localStorage.removeItem(SESSION_KEY);
        return;
      }
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        build, explanation, buildWarnings, previousIntent, previousBuild,
      }));
    } catch {
      // storage unavailable (private mode / quota) — session just won't persist
    }
  }, [build, explanation, buildWarnings, previousIntent, previousBuild]);

  // Settings dialog: Esc closes, Tab stays inside, focus returns to the opener.
  useEffect(() => {
    if (!showSettings) return undefined;
    const opener = document.activeElement;
    const dialog = settingsDialogRef.current;
    dialog?.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSettings(false);
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;
      const focusable = dialog.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (opener && typeof opener.focus === 'function') opener.focus();
    };
  }, [showSettings]);

  useEffect(() => {
    if (chatInput === "" && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [chatInput]);

  const getMaxChatboxHeight = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 640) return 120;
    return 180;
  };

  useEffect(() => {
    localStorage.setItem('customGroqKey', customGroqKey);
    localStorage.setItem('customOllamaKey', customOllamaKey);
    localStorage.setItem('aiProvider', selectedProvider);
  }, [customGroqKey, customOllamaKey, selectedProvider]);

  const handleDownloadPDF = () => {
    window.print();
  };

  const handleClear = () => {
    // Cancel any in-flight job so a late result can't repopulate a cleared build.
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    requestIdRef.current += 1;
    clearLoadingTimers();
    setBuild(INITIAL_BUILD);
    setExplanation("");
    setErrorMsg("");
    setBuildWarnings([]);
    setLoadingState("idle");
    setQueuePosition(0);
    setShowTrafficWarning(false);
    setPreviousIntent(null);
    setPreviousBuild(null);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    showToast("Build cleared");
  };

  const handleRemoveComponent = (category) => {
    const removed = build[category];
    if (!removed) return;
    setBuild((prev) => ({ ...prev, [category]: null }));
    showToast(`Removed ${category}`, {
      label: 'Undo',
      onClick: () => {
        setBuild((prev) => (prev[category] ? prev : { ...prev, [category]: removed }));
        dismissToast();
      },
    });
  };

  const clearLoadingTimers = () => {
    loadingTimersRef.current.forEach((timerId) => clearTimeout(timerId));
    loadingTimersRef.current = [];
  };

  const handleStop = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    requestIdRef.current += 1;
    setLoadingState("idle");
    setErrorMsg("");
    setQueuePosition(0);
    setShowTrafficWarning(false);
    clearLoadingTimers();
    showToast("Build generation stopped");
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || loadingState === "analyzing" || loadingState === "selecting" || loadingState === "checking") return;
    clearLoadingTimers();
    setLoadingState("analyzing");
    setErrorMsg("");
    setQueuePosition(0);
    setShowTrafficWarning(false);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }

    try {
      const currentRequestId = requestIdRef.current + 1;
      requestIdRef.current = currentRequestId;
      const requestPayload = {
        message: chatInput,
        site: selectedSite === 'custom' ? customSiteUrl : selectedSite,
        customKeys: { 
          groq: customGroqKey,
          ollama: customOllamaKey,
          provider: selectedProvider
        },
        ...(previousIntent && { previousIntent }),
        ...(previousBuild && { previousBuild }),
      };
      abortControllerRef.current = new AbortController();

      const submitRes = await axios.post(`${apiBaseUrl}/api/build`, requestPayload, {
        signal: abortControllerRef.current.signal,
      });

      if (currentRequestId !== requestIdRef.current) return;

      if (submitRes.data.error) {
        setErrorMsg(submitRes.data.error);
        setLoadingState("error");
        return;
      }

      const { jobId, position } = submitRes.data;
      setQueuePosition(position);
      if (position > 3) setShowTrafficWarning(true);

      const selectTimer = setTimeout(() => {
        setLoadingState((prev) => (prev === 'idle' || prev === 'error' || prev === 'success') ? prev : "selecting");
      }, 1500);
      const checkTimer = setTimeout(() => {
        setLoadingState((prev) => (prev === 'idle' || prev === 'error' || prev === 'success') ? prev : "checking");
      }, 3000);
      loadingTimersRef.current = [selectTimer, checkTimer];

      pollRef.current = setInterval(async () => {
        if (currentRequestId !== requestIdRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          return;
        }
        try {
          const pollRes = await axios.get(`${apiBaseUrl}/api/build/${jobId}`);
          const data = pollRes.data;

          if (data.status === 'queued') {
            setQueuePosition(data.position || 1);
            if (data.position > 3) setShowTrafficWarning(true);
          }

          if (data.status === 'processing') {
            setQueuePosition(0);
          }

          if (data.status === 'completed' && data.result) {
            clearInterval(pollRef.current);
            pollRef.current = null;
            clearLoadingTimers();
            setBuild({ ...INITIAL_BUILD, ...data.result.build });
            setExplanation(data.result.explanation);
            setBuildWarnings(data.result.warnings || []);
            setPreviousIntent(data.result.intent || null);
            setPreviousBuild(data.result.build || null);
            setLoadingState("success");
            setQueuePosition(0);
            setShowTrafficWarning(false);
            setChatInput("");
            showToast("Build ready");
          }

          if (data.status === 'failed') {
            clearInterval(pollRef.current);
            pollRef.current = null;
            clearLoadingTimers();
            setErrorMsg(data.error || "Build failed unexpectedly.");
            setLoadingState("error");
            setQueuePosition(0);
          }
        } catch (pollErr) {
          if (axios.isCancel(pollErr)) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      }, 3000);

    } catch (err) {
      if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED' || axios.isCancel(err)) {
        setLoadingState("idle");
        clearLoadingTimers();
        return;
      }
      if (err.response?.status === 429) {
        setErrorMsg("You've reached the free tier limit. Wait 15 minutes, or paste your own free Groq API key in Settings to continue immediately.");
      } else {
        setErrorMsg(err.response?.data?.error || "Failed to connect to the AI builder engine.");
      }
      setLoadingState("error");
      clearLoadingTimers();
    }
  };

  // Hardware telemetry calculations
  const telemetry = useMemo(() => {
    const cpuItem = build["Processor"];
    const gpuItem = build["Graphics Card"];
    const psuItem = build["PSU"];
    const moboItem = build["Motherboard"];
    const ramItem = build["RAM"];

    const cpuSpecs = parseComponentTelemetry("Processor", cpuItem?.name);
    const gpuSpecs = parseComponentTelemetry("Graphics Card", gpuItem?.name);
    const psuSpecs = parseComponentTelemetry("PSU", psuItem?.name);
    const moboSpecs = parseComponentTelemetry("Motherboard", moboItem?.name);
    const ramSpecs = parseComponentTelemetry("RAM", ramItem?.name);

    const cpuTdp = cpuSpecs.tdp || 65;
    const gpuTdp = gpuSpecs.tdp || (gpuItem ? 160 : 25);
    const baseSystemTdp = 45; // Motherboard, fans, storage, RAM
    const estimatedDraw = (cpuItem ? cpuTdp : 0) + (gpuItem ? gpuTdp : 25) + (moboItem ? baseSystemTdp : 0);
    const recommendedPsu = Math.round(estimatedDraw * 1.45);
    const installedPsu = psuSpecs.wattage || 0;

    let psuStatus = "idle";
    let psuRatio = 0;
    if (installedPsu > 0) {
      psuRatio = Math.round((estimatedDraw / installedPsu) * 100);
      if (psuRatio < 75) psuStatus = "optimal";
      else if (psuRatio <= 90) psuStatus = "headroom";
      else psuStatus = "warning";
    }

    const incompatibleCount = buildWarnings.filter((w) => String(w).includes('INCOMPATIBLE')).length;
    const noteCount = buildWarnings.length - incompatibleCount;

    // Budget distribution
    const configuredCount = Object.values(build).filter(Boolean).length;
    const gpuCost = gpuItem?.price || 0;
    const cpuCost = cpuItem?.price || 0;

    const gpuPct = total > 0 ? Math.round((gpuCost / total) * 100) : 0;
    const cpuPct = total > 0 ? Math.round((cpuCost / total) * 100) : 0;
    const otherPct = total > 0 ? Math.max(0, 100 - gpuPct - cpuPct) : 0;

    return {
      cpuSpecs,
      gpuSpecs,
      psuSpecs,
      moboSpecs,
      ramSpecs,
      estimatedDraw,
      recommendedPsu,
      installedPsu,
      psuStatus,
      psuRatio,
      configuredCount,
      gpuPct,
      cpuPct,
      otherPct,
      incompatibleCount,
      noteCount,
    };
  }, [build, total, buildWarnings]);

  // Budget the user asked for (from the engine's parsed intent), for the "% of budget" readout.
  const budget = Number(previousIntent?.budget_bdt) || 0;
  const budgetPct = budget > 0 ? Math.round((total / budget) * 100) : 0;
  const isOverBudget = budget > 0 && total > budget;

  const scrollToSummary = () => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('summary-rail')?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  // Copy build spec to clipboard
  const handleCopySpecSheet = () => {
    const configuredItems = Object.entries(build).filter(([, item]) => Boolean(item));
    if (configuredItems.length === 0) {
      showToast("No components configured to copy");
      return;
    }

    let text = `BuildMyPC Configuration — ${formatPrice(total)}\n`;
    text += `Source: ${selectedSite.toUpperCase()} (Bangladesh)\n`;
    text += `═══════════════════════════════════════\n`;
    configuredItems.forEach(([category, item]) => {
      text += `• ${category}: ${item.name} — ${formatPrice(item.price)}\n`;
      if (item.url) text += `  ${item.url}\n`;
    });
    text += `═══════════════════════════════════════\n`;
    text += `Estimated power draw: ~${telemetry.estimatedDraw}W (recommended PSU: ${telemetry.recommendedPsu}W+)\n`;
    if (buildWarnings.length > 0) {
      text += `\nWarnings:\n${buildWarnings.map((w) => `- ${w}`).join('\n')}\n`;
    }
    if (explanation) text += `\nAI notes: ${explanation}\n`;
    text += `\nBuilt with BuildMyPC AI Configurator`;

    navigator.clipboard.writeText(text).then(() => {
      showToast("Spec sheet copied");
    }).catch(() => {
      showToast("Unable to copy to clipboard");
    });
  };

  const getLoadingMessage = () => {
    if (queuePosition > 0) return `Queue position #${queuePosition} — estimated ~${queuePosition * 12}s`;
    switch (loadingState) {
      case 'analyzing': return "Reading your requirements...";
      case 'selecting': return "Finding parts in stock...";
      case 'checking': return "Checking compatibility...";
      default: return "Building your PC...";
    }
  };

  // Render Component Card (Double-Bezel Architecture)
  const renderComponentRow = (category, isRequired, dependencyStr, isHero = false) => {
    const item = build[category];
    if (hideUnconfigured && !item) return null;

    const Icon = CATEGORY_ICONS[category] || Box;
    const specs = parseComponentTelemetry(category, item?.name);

    return (
      <motion.div 
        key={category} 
        layout
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, x: -16, scale: 0.96 }}
        transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
        className={`bezel-shell mb-3 group ${isHero ? 'border-white/15' : ''}`}
      >
        <div className={`bezel-inner p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all ${
          item ? 'bg-[#0E1117]/95' : 'bg-[#0B0D12]/70'
        }`}>
          <div className="flex items-start sm:items-center gap-4 sm:gap-5 flex-1 min-w-0">
            {/* Category Icon Badge */}
            <div className={`p-3 rounded-xl shrink-0 transition-colors ${
              item 
                ? isHero 
                  ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.15)]'
                  : 'bg-white/10 text-zinc-200 border border-white/10'
                : 'bg-white/5 text-zinc-500 border border-white/5'
            }`}>
              <Icon size={isHero ? 24 : 20} strokeWidth={1.5} />
            </div>
            
            <div className="flex flex-col min-w-0 flex-1">
              {/* Category Title & Status Badges */}
              <div className="flex flex-wrap items-center gap-2">
                <span className={`font-semibold tracking-tight ${isHero ? 'text-lg sm:text-xl text-white' : 'text-base sm:text-lg text-zinc-200'}`}>
                  {category}
                </span>
                
                {isRequired && (
                  <span className="text-xs font-medium bg-red-500/10 text-red-400 px-2 py-0.5 rounded border border-red-500/20">
                    Required
                  </span>
                )}

                {dependencyStr && (
                  <span className="text-xs text-zinc-400">
                    Must match {dependencyStr}
                  </span>
                )}
              </div>
              
              {/* Item Information or Empty Prompt */}
              {item ? (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 mt-2 min-w-0">
                  {item.image && (
                    <img 
                      src={item.image} 
                      alt={item.name} 
                      className="w-11 h-11 sm:w-12 sm:h-12 object-contain rounded-lg bg-white/95 p-1 shrink-0 border border-white/20 shadow-sm" 
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-zinc-100 font-medium text-sm sm:text-base leading-snug line-clamp-2">
                      {item.name}
                    </div>
                    {/* Hardware Telemetry Spec Tags */}
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {specs.socket && <span className="spec-tag text-emerald-400 border-emerald-500/20 bg-emerald-500/10">Socket {specs.socket}</span>}
                      {specs.chipset && <span className="spec-tag text-blue-400 border-blue-500/20 bg-blue-500/10">{specs.chipset}</span>}
                      {specs.vram && <span className="spec-tag text-purple-400 border-purple-500/20 bg-purple-500/10">{specs.vram}</span>}
                      {specs.gen && <span className="spec-tag text-amber-400 border-amber-500/20 bg-amber-500/10">{specs.gen}</span>}
                      {specs.capacity && <span className="spec-tag text-zinc-300">{specs.capacity}</span>}
                      {specs.speed && <span className="spec-tag text-zinc-400">{specs.speed}</span>}
                      {specs.wattage && <span className="spec-tag text-emerald-400 border-emerald-500/20 bg-emerald-500/10">{specs.wattage}W Output</span>}
                      {specs.tdp && <span className="spec-tag text-zinc-400">TDP ~{specs.tdp}W</span>}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-zinc-400 text-xs sm:text-sm mt-1.5 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-zinc-600"></span>
                  Not selected
                </div>
              )}
            </div>
          </div>

          {/* Price & Action Group */}
          {item ? (
            <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 w-full sm:w-auto mt-2 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/5">
              <div className="font-mono-num font-semibold text-lg sm:text-xl text-white tracking-tight whitespace-nowrap">
                {formatPrice(item.price)}
              </div>
              <div className="flex items-center gap-1.5">
                {item.url && (
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tactile-btn w-11 h-11 flex items-center justify-center text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors"
                    title="View on store retailer"
                    aria-label={`View ${category} on retailer site`}
                  >
                    <ExternalLink size={16} strokeWidth={1.75} />
                  </a>
                )}
                <button
                  type="button"
                  className="tactile-btn w-11 h-11 flex items-center justify-center text-zinc-400 hover:text-red-400 bg-white/5 hover:bg-red-500/10 rounded-xl border border-white/10 hover:border-red-500/30 transition-colors"
                  title="Remove component"
                  aria-label={`Remove ${category}`}
                  onClick={() => handleRemoveComponent(category)}
                >
                  <Trash2 size={16} strokeWidth={1.75} />
                </button>
              </div>
            </div>
          ) : (
            <div className="hidden sm:block text-zinc-500 text-sm" aria-hidden="true">—</div>
          )}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen pb-44 sm:pb-36 bg-[#08090C] text-zinc-100 selection:bg-blue-500/30 selection:text-white">
      
      {/* Floating Island Navigation */}
      <div className="sticky top-0 z-40 pt-2 pb-2 sm:pt-4 sm:pb-0 px-3 sm:px-6 bg-[#08090C]/95 backdrop-blur-xl lg:bg-transparent lg:backdrop-blur-none print:hidden">
        <header className="max-w-7xl mx-auto titanium-card rounded-2xl px-4 sm:px-6 py-2 sm:py-3 flex items-center justify-between border border-white/10">
          <div className="flex items-center gap-3 shrink-0">
            <div className="bg-gradient-to-br from-blue-500 to-blue-700 p-2 rounded-xl text-white shadow-[0_0_15px_rgba(59,130,246,0.4)]">
              <Sparkles size={18} strokeWidth={2.2} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white flex items-center gap-1.5">
                  BuildMyPC <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-normal">BD</span>
                </h1>
              </div>
              <p className="text-xs text-zinc-400 hidden sm:block">AI PC builder for Bangladesh</p>
            </div>
          </div>
          
          {/* Desktop Control Strip */}
          <div className="hidden lg:flex items-center gap-2.5">
            {/* Store Source Selector */}
            <div className="flex items-center gap-2 bg-[#0c0e14] px-3 py-1.5 rounded-xl border border-white/10 shadow-inner">
              <label htmlFor="store-select-desktop" className="text-xs text-zinc-400">Store</label>
              <select
                id="store-select-desktop"
                value={selectedSite}
                onChange={(e) => setSelectedSite(e.target.value)}
                className="bg-transparent text-xs font-semibold text-zinc-200 cursor-pointer"
                disabled={loadingState !== 'idle' && loadingState !== 'error' && loadingState !== 'success'}
              >
                <option className="bg-zinc-900 text-zinc-200" value="startech">StarTech BD</option>
                <option className="bg-zinc-900 text-zinc-200" value="techland">TechLand BD</option>
                <option className="bg-zinc-900 text-zinc-200" value="computermania">CompMania BD</option>
                <option className="bg-zinc-900 text-zinc-200" value="custom">Custom Site...</option>
              </select>
              {selectedSite === 'custom' && (
                <input 
                  type="text"
                  placeholder="https://retailer.com"
                  value={customSiteUrl}
                  onChange={(e) => setCustomSiteUrl(e.target.value)}
                  aria-label="Custom retailer URL"
                  className="bg-zinc-900/90 border border-white/10 rounded-lg px-2 py-0.5 text-xs text-zinc-200 w-32 font-mono"
                />
              )}
            </div>

            {/* Share / Copy Spec Sheet */}
            <button 
              onClick={handleCopySpecSheet}
              className="tactile-btn px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 flex items-center gap-2 text-zinc-300 hover:text-white text-xs font-medium"
              title="Copy formatted spec sheet"
            >
              <Copy size={14} strokeWidth={1.75} />
              <span>Copy Spec</span>
            </button>

            {/* Groq API Key Settings */}
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className={`tactile-btn px-3 py-1.5 rounded-xl border flex items-center gap-2 text-xs font-medium ${
                showTrafficWarning
                  ? 'text-yellow-400 border-yellow-400/40 bg-yellow-400/10 ring-1 ring-yellow-400/30'
                  : 'bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border-white/10'
              }`}
              aria-haspopup="dialog"
            >
              <Key size={14} strokeWidth={1.75} />
              <span>API Key</span>
            </button>

            {/* PDF Print Export */}
            <button 
              onClick={handleDownloadPDF} 
              className="tactile-btn px-3 py-1.5 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white rounded-xl border border-white/10 flex items-center gap-2 text-xs font-medium"
              title="Print or save as PDF"
            >
              <FileDown size={14} strokeWidth={1.75} />
              <span>Export</span>
            </button>

            {/* Clear All */}
            <button 
              onClick={handleClear} 
              className="tactile-btn px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl border border-red-500/20 flex items-center gap-2 text-xs font-medium"
              title="Clear current configuration"
            >
              <Trash2 size={14} strokeWidth={1.75} />
              <span>Clear</span>
            </button>
          </div>

          {/* Mobile Hamburger Toggle */}
          <button
            type="button"
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            aria-label={showMobileMenu ? 'Close menu' : 'Open menu'}
            aria-expanded={showMobileMenu}
            className="lg:hidden w-11 h-11 flex items-center justify-center text-zinc-300 hover:text-white bg-white/5 rounded-xl border border-white/10 transition-colors tactile-btn"
          >
            {showMobileMenu ? <X size={20} strokeWidth={1.75} /> : <Menu size={20} strokeWidth={1.75} />}
          </button>
        </header>

        {/* Mobile Flyout Menu */}
        <AnimatePresence>
          {showMobileMenu && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
              className="titanium-card mt-2.5 p-4 rounded-2xl lg:hidden flex flex-col gap-3.5 border border-white/15 shadow-2xl"
            >
              <div className="flex flex-col gap-1.5">
                <label htmlFor="store-select-mobile" className="text-xs text-zinc-400">Retailer</label>
                <select
                  id="store-select-mobile"
                  value={selectedSite}
                  onChange={(e) => setSelectedSite(e.target.value)}
                  className="w-full bg-[#0c0e14] border border-white/10 rounded-xl px-3.5 py-2.5 text-zinc-200 text-sm"
                >
                  <option className="bg-zinc-900 text-zinc-200" value="startech">StarTech BD</option>
                  <option className="bg-zinc-900 text-zinc-200" value="techland">TechLand BD</option>
                  <option className="bg-zinc-900 text-zinc-200" value="computermania">CompMania BD</option>
                  <option className="bg-zinc-900 text-zinc-200" value="custom">Custom Site...</option>
                </select>
                {selectedSite === 'custom' && (
                  <input 
                    type="text"
                    placeholder="https://retailer.com"
                    value={customSiteUrl}
                    onChange={(e) => setCustomSiteUrl(e.target.value)}
                    aria-label="Custom retailer URL"
                    className="w-full bg-[#0c0e14] border border-white/10 rounded-xl px-3.5 py-2 text-zinc-200 text-xs font-mono mt-1"
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => { handleCopySpecSheet(); setShowMobileMenu(false); }}
                  className="tactile-btn flex items-center justify-center gap-2 bg-white/5 border border-white/10 rounded-xl py-2.5 min-h-11 text-xs font-medium text-zinc-200"
                >
                  <Copy size={15} />
                  <span>Copy Spec</span>
                </button>
                <button 
                  onClick={() => { setShowSettings(true); setShowMobileMenu(false); }}
                  className="tactile-btn flex items-center justify-center gap-2 bg-white/5 border border-white/10 rounded-xl py-2.5 min-h-11 text-xs font-medium text-zinc-200"
                >
                  <Key size={15} />
                  <span>API Key</span>
                </button>
                <button 
                  onClick={() => { handleDownloadPDF(); setShowMobileMenu(false); }}
                  className="tactile-btn flex items-center justify-center gap-2 bg-white/5 border border-white/10 rounded-xl py-2.5 min-h-11 text-xs font-medium text-zinc-200"
                >
                  <FileDown size={15} />
                  <span>Export PDF</span>
                </button>
                <button 
                  onClick={() => { handleClear(); setShowMobileMenu(false); }}
                  className="tactile-btn flex items-center justify-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl py-2.5 min-h-11 text-xs font-medium"
                >
                  <Trash2 size={15} />
                  <span>Clear All</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile summary bar: keeps total, budget and compat status in view while scrolling */}
        {telemetry.configuredCount > 0 && (
          <button
            type="button"
            onClick={scrollToSummary}
            aria-label={`Build summary: ${formatPrice(total)}. Tap for details.`}
            className="lg:hidden tactile-btn w-full mt-2 titanium-card rounded-2xl px-4 py-2 min-h-14 flex items-center justify-between gap-3 text-left border border-white/10"
          >
            <span className="min-w-0">
              <span className="block font-mono-num font-bold text-lg text-white leading-tight">{formatPrice(total)}</span>
              <span className={`block text-xs truncate ${isOverBudget ? 'text-red-300' : 'text-zinc-400'}`}>
                {budget > 0
                  ? isOverBudget
                    ? `${formatPrice(total - budget)} over ${formatPrice(budget)} budget`
                    : `${budgetPct}% of ${formatPrice(budget)} budget`
                  : `${telemetry.configuredCount} of 12 parts`}
              </span>
            </span>
            {telemetry.incompatibleCount > 0 ? (
              <span className="shrink-0 flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-red-500/15 border border-red-500/30 text-red-300">
                <ShieldAlert size={14} aria-hidden="true" />
                {telemetry.incompatibleCount} incompatible
              </span>
            ) : telemetry.noteCount > 0 ? (
              <span className="shrink-0 flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-200">
                <AlertTriangle size={14} aria-hidden="true" />
                {telemetry.noteCount} {telemetry.noteCount === 1 ? 'note' : 'notes'}
              </span>
            ) : (
              <span className="shrink-0 flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                <CheckCircle2 size={14} aria-hidden="true" />
                No issues
              </span>
            )}
          </button>
        )}
      </div>

      {/* Main Cockpit Layout */}
      <main className="max-w-7xl mx-auto mt-6 px-3 sm:px-6" ref={builderRef}>

        {/* Global Toast Notification */}
        <div
          role="status"
          aria-live="polite"
          className="fixed top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-none print:hidden"
        >
          <AnimatePresence>
            {toast && (
              <motion.div
                key={toast.message}
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
              >
                <div className="bg-zinc-900/95 border border-white/20 text-zinc-100 pl-4 pr-1 py-1 rounded-full shadow-2xl backdrop-blur-xl flex items-center gap-2.5 text-sm pointer-events-auto">
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0" aria-hidden="true" />
                  <span>{toast.message}</span>
                  {toast.action && (
                    <button
                      type="button"
                      onClick={toast.action.onClick}
                      className="tactile-btn ml-1 px-4 min-h-11 rounded-full bg-white/10 hover:bg-white/20 text-blue-300 font-semibold text-sm"
                    >
                      {toast.action.label}
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* High Traffic Warning Banner */}
        <AnimatePresence>
          {showTrafficWarning && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-amber-300 text-xs sm:text-sm"
            >
              <AlertTriangle className="mt-0.5 shrink-0 text-amber-400" size={18} />
              <div className="leading-relaxed flex-1">
                <strong>High Queue Traffic Detected:</strong> The shared free API tier is busy. Provide your own{' '}
                <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="underline font-semibold text-amber-200 hover:text-white">free Groq API key</a>{' '}
                in <button onClick={() => setShowSettings(true)} className="underline font-semibold text-amber-200 hover:text-white">API Settings</button> for instant queue-free builds.
              </div>
              <button type="button" onClick={() => setShowTrafficWarning(false)} aria-label="Dismiss warning" className="text-amber-400 hover:text-white w-11 h-11 -m-2 flex items-center justify-center shrink-0">
                <X size={16} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error Banner */}
        {errorMsg && (
          <motion.div
            role="alert"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-start gap-3 text-red-400 shadow-sm"
          >
            <AlertCircle className="mt-0.5 shrink-0" size={20} strokeWidth={1.75} />
            <p className="font-medium text-xs sm:text-sm leading-relaxed">{errorMsg}</p>
          </motion.div>
        )}

        {/* 2-Column Cockpit Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-start">
          
          {/* Left / Main Hardware Canvas (col-span-8) */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Canvas Header Control Strip */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                  <span>Your build</span>
                  <span className="text-xs font-medium text-zinc-300 bg-white/5 px-2 py-0.5 rounded border border-white/10">
                    {telemetry.configuredCount} of 12 parts
                  </span>
                </h2>
                <p className="text-xs text-zinc-400 mt-1">Prices from live Bangladeshi retailers</p>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 min-h-11 cursor-pointer text-zinc-400 text-xs font-medium hover:text-zinc-200 transition-colors">
                  <input 
                    type="checkbox" 
                    className="rounded border-zinc-700 bg-zinc-900 text-blue-500 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                    checked={hideUnconfigured}
                    onChange={(e) => setHideUnconfigured(e.target.checked)}
                  />
                  <span>Hide empty</span>
                </label>
              </div>
            </div>

            {/* Compatibility warnings: surfaced above the list, not buried under the AI notes */}
            {buildWarnings.length > 0 && !['analyzing', 'selecting', 'checking'].includes(loadingState) && (
              <div role="alert" className="space-y-2">
                {buildWarnings.map((warning, i) => {
                  const isIncompatible = String(warning).includes('INCOMPATIBLE');
                  return (
                    <div key={i} className={`flex items-start gap-2.5 p-3.5 rounded-xl text-sm leading-relaxed ${
                      isIncompatible
                        ? 'bg-red-500/10 border border-red-500/30 text-red-300'
                        : 'bg-amber-500/10 border border-amber-500/30 text-amber-200'
                    }`}>
                      <AlertTriangle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
                      <span>{warning}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* TIER 1: Core Anchor Components (CPU & GPU) */}
            <div>
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2 text-sm text-blue-400 font-semibold">
                  <Flame size={14} aria-hidden="true" />
                  <span>Core</span>
                </div>
                <span className="text-xs text-zinc-400 hidden sm:inline">Sets platform and power needs</span>
              </div>
              <div className="space-y-1">
                <AnimatePresence mode="popLayout">
                  {ANCHOR_CATEGORIES.map(category => {
                    const isLoading = loadingState === 'analyzing' || loadingState === 'selecting' || loadingState === 'checking';
                    if (isLoading) return <SkeletonRow key={`skel-anchor-${category}`} isHero={true} />;
                    return renderComponentRow(category, category === "Processor", "", true);
                  })}
                </AnimatePresence>
              </div>
            </div>

            {/* TIER 2: Core Platform Infrastructure */}
            <div>
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2 text-sm text-zinc-200 font-semibold">
                  <Layers size={14} className="text-zinc-400" aria-hidden="true" />
                  <span>Platform</span>
                </div>
                <span className="text-xs text-zinc-400 hidden sm:inline">Board, memory, storage, power, cooling, case</span>
              </div>
              <div className="space-y-1">
                <AnimatePresence mode="popLayout">
                  {PLATFORM_CATEGORIES.map(category => {
                    const isLoading = loadingState === 'analyzing' || loadingState === 'selecting' || loadingState === 'checking';
                    if (isLoading) return <SkeletonRow key={`skel-platform-${category}`} />;
                    
                    const isRequired = ["Motherboard", "RAM", "Storage", "PSU", "Casing"].includes(category);
                    let dependencyStr = "";
                    if (category === "Motherboard") dependencyStr = "CPU";
                    if (category === "RAM") dependencyStr = "Motherboard";
                    return renderComponentRow(category, isRequired, dependencyStr);
                  })}
                </AnimatePresence>
              </div>
            </div>

            {/* TIER 3: Peripherals & Gear */}
            <div>
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2 text-sm text-zinc-200 font-semibold">
                  <Monitor size={14} className="text-zinc-400" aria-hidden="true" />
                  <span>Peripherals</span>
                </div>
                <span className="text-xs text-zinc-400 hidden sm:inline">Monitor, mouse, keyboard, UPS</span>
              </div>
              <div className="space-y-1">
                <AnimatePresence mode="popLayout">
                  {PERIPHERAL_CATEGORIES.map(category => {
                    const isLoading = loadingState === 'analyzing' || loadingState === 'selecting' || loadingState === 'checking';
                    if (isLoading) return <SkeletonRow key={`skel-peri-${category}`} />;
                    return renderComponentRow(category, false, "");
                  })}
                </AnimatePresence>
              </div>
            </div>

            {/* AI Intelligence Explanation & Warnings */}
            {explanation && (
              <motion.div 
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="titanium-card rounded-2xl p-6 border-l-4 border-l-blue-500"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="text-blue-400" size={18} />
                  <h3 className="text-base sm:text-lg font-bold text-white tracking-tight">Why these parts</h3>
                </div>
                <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-line">
                  {explanation}
                </p>
              </motion.div>
            )}

          </div>

          {/* Right Column: Sticky Telemetry & Inspector (col-span-4) */}
          <div id="summary-rail" className="lg:col-span-4 space-y-5 lg:sticky lg:top-24 scroll-mt-40">
            
            {/* Total System Value Card */}
            <div className="titanium-card rounded-2xl p-5 border border-white/10 shadow-xl">
              <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
                <span>Total</span>
                <span className="text-zinc-400 flex items-center gap-1">
                  <ShieldCheck size={14} className="text-emerald-400" aria-hidden="true" /> Live prices
                </span>
              </div>
              <div className="font-mono-num font-bold text-3xl sm:text-4xl text-white tracking-tight">
                {formatPrice(total)}
              </div>
              <div className="text-xs text-zinc-400 mt-2 flex items-center justify-between pt-3 border-t border-white/5">
                <span>Parts selected</span>
                <span className="font-mono-num text-zinc-200">{telemetry.configuredCount} of 12</span>
              </div>
            </div>

            {/* Power estimate: only meaningful once there are parts to estimate from */}
            {telemetry.configuredCount > 0 && (
            <div className="titanium-card rounded-2xl p-5 border border-white/10">
              <div className="flex items-center justify-between text-xs text-zinc-400 mb-3">
                <span className="flex items-center gap-1.5 text-zinc-200 font-semibold text-sm">
                  <Zap size={14} className="text-amber-400" aria-hidden="true" /> Power
                </span>
                {telemetry.installedPsu > 0 && (
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    telemetry.psuStatus === 'optimal'
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : telemetry.psuStatus === 'warning'
                      ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                      : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  }`}>
                    {telemetry.psuStatus === 'optimal' ? 'Good headroom' : telemetry.psuStatus === 'warning' ? 'Too tight' : 'Tight'}
                  </span>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-baseline text-sm">
                  <span className="text-zinc-400">Estimated draw</span>
                  <span className="font-mono-num font-semibold text-white">~{telemetry.estimatedDraw}W</span>
                </div>

                <div className="flex justify-between items-baseline text-sm">
                  <span className="text-zinc-400">Recommended PSU</span>
                  <span className="font-mono-num font-semibold text-blue-400">{telemetry.recommendedPsu}W+</span>
                </div>

                {telemetry.installedPsu > 0 && (
                  <div className="flex justify-between items-baseline text-sm pt-2 border-t border-white/5">
                    <span className="text-zinc-400">Your PSU</span>
                    <span className="font-mono-num font-semibold text-zinc-100">{telemetry.installedPsu}W ({telemetry.psuRatio}% load)</span>
                  </div>
                )}

                {/* Visual Power Load Bar */}
                <div
                  className="w-full bg-white/5 h-2 rounded-full overflow-hidden mt-2 border border-white/5"
                  role="progressbar"
                  aria-label="Estimated power load"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(Math.min(100, telemetry.installedPsu > 0 ? telemetry.psuRatio : (telemetry.estimatedDraw / 750) * 100))}
                >
                  <div
                    className={`h-full transition-all duration-500 ${
                      telemetry.psuRatio > 85 ? 'bg-red-500' : telemetry.psuRatio > 65 ? 'bg-amber-400' : 'bg-emerald-400'
                    }`}
                    style={{ width: `${Math.min(100, telemetry.installedPsu > 0 ? telemetry.psuRatio : (telemetry.estimatedDraw / 750) * 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>
            )}

            {/* Budget Allocation Breakdown */}
            {total > 0 && (
              <div className="titanium-card rounded-2xl p-5 border border-white/10">
                <div className="text-sm text-zinc-200 mb-3 font-semibold">
                  Where the money goes
                </div>

                {/* Segmented Bar */}
                <div className="w-full h-3 rounded-full overflow-hidden flex bg-white/5 border border-white/10 mb-3">
                  <div style={{ width: `${telemetry.gpuPct}%` }} className="bg-purple-500 h-full" title={`GPU: ${telemetry.gpuPct}%`}></div>
                  <div style={{ width: `${telemetry.cpuPct}%` }} className="bg-blue-500 h-full" title={`CPU: ${telemetry.cpuPct}%`}></div>
                  <div style={{ width: `${telemetry.otherPct}%` }} className="bg-emerald-500 h-full" title={`Platform: ${telemetry.otherPct}%`}></div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                  <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
                    <div className="text-purple-400 font-bold">{telemetry.gpuPct}%</div>
                    <div className="text-xs text-zinc-400 mt-0.5">Graphics</div>
                  </div>
                  <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <div className="text-blue-400 font-bold">{telemetry.cpuPct}%</div>
                    <div className="text-xs text-zinc-400 mt-0.5">Processor</div>
                  </div>
                  <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <div className="text-emerald-400 font-bold">{telemetry.otherPct}%</div>
                    <div className="text-xs text-zinc-400 mt-0.5">Platform</div>
                  </div>
                </div>
              </div>
            )}

            {/* Hardware Compatibility Checklist */}
            <div className="titanium-card rounded-2xl p-5 border border-white/10">
              <div className="text-sm text-zinc-200 mb-3 font-semibold">
                Compatibility
              </div>

              {/* Status reflects the engine's actual warnings; nothing is claimed that wasn't checked. */}
              {telemetry.configuredCount === 0 ? (
                <div className="flex items-center gap-2 text-sm text-zinc-400">
                  <CircleHelp size={16} className="shrink-0" aria-hidden="true" />
                  <span>Not checked yet. Build a PC to see results.</span>
                </div>
              ) : telemetry.incompatibleCount > 0 ? (
                <div className="flex items-start gap-2 text-sm text-red-300">
                  <ShieldAlert size={16} className="shrink-0 mt-0.5 text-red-400" aria-hidden="true" />
                  <span>
                    {telemetry.incompatibleCount} incompatible {telemetry.incompatibleCount === 1 ? 'part' : 'parts'}
                    {telemetry.noteCount > 0 && ` and ${telemetry.noteCount} ${telemetry.noteCount === 1 ? 'note' : 'notes'}`}. See details above the parts list.
                  </span>
                </div>
              ) : telemetry.noteCount > 0 ? (
                <div className="flex items-start gap-2 text-sm text-amber-200">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-400" aria-hidden="true" />
                  <span>
                    {telemetry.noteCount} {telemetry.noteCount === 1 ? 'note' : 'notes'} to review. See details above the parts list.
                  </span>
                </div>
              ) : (
                <div className="flex items-start gap-2 text-sm text-zinc-200">
                  <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-emerald-400" aria-hidden="true" />
                  <span>No compatibility issues found when this build was generated.</span>
                </div>
              )}
            </div>

            {/* Quick Action Dock */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={handleCopySpecSheet}
                className="tactile-btn p-3 min-h-11 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center gap-2 text-xs font-medium text-zinc-200 hover:text-white"
              >
                <Copy size={14} />
                <span>Copy Summary</span>
              </button>

              <button
                onClick={handleDownloadPDF}
                className="tactile-btn p-3 min-h-11 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center gap-2 text-xs font-medium text-zinc-200 hover:text-white"
              >
                <FileDown size={14} />
                <span>Print PDF</span>
              </button>
            </div>

          </div>

        </div>

      </main>

      {/* Floating Conversational Command Deck */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#08090C]/90 backdrop-blur-2xl border-t border-white/10 p-3 sm:p-4 z-40 print:hidden shadow-[0_-10px_35px_rgba(0,0,0,0.7)]">
        <div className="max-w-4xl mx-auto relative chatbox-shell">
          
          {/* Active Generation Status Banner */}
          {loadingState !== 'idle' && loadingState !== 'success' && loadingState !== 'error' && (
            <div className="absolute left-1/2 -top-12 transform -translate-x-1/2 z-50 pointer-events-none">
              <div role="status" className="bg-zinc-900/95 text-blue-300 border border-blue-500/30 px-5 py-2 rounded-full shadow-2xl flex items-center gap-3 text-sm">
                <Loader2 size={14} className="animate-spin text-blue-400" aria-hidden="true" />
                <span>{getLoadingMessage()}</span>
              </div>
            </div>
          )}

          {/* Refine Mode Status Strip */}
          {previousIntent && loadingState !== 'analyzing' && loadingState !== 'selecting' && loadingState !== 'checking' && (
            <div className="mb-2.5 flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 text-xs font-medium flex items-center gap-1.5">
                  <RefreshCw size={12} aria-hidden="true" />
                  Refining your build
                </span>
                <span className="text-xs text-zinc-400 hidden sm:inline">Ask to swap parts, raise the budget, or change cooling</span>
              </div>
              <button
                type="button"
                onClick={handleClear}
                className="text-xs text-zinc-400 hover:text-red-400 transition-colors px-3 min-h-11 shrink-0"
              >
                Start over
              </button>
            </div>
          )}

          {/* Quick Workload Preset Chips (When Input is Empty) */}
          {chatInput === "" && !previousIntent && total === 0 && loadingState === 'idle' && (
            <div className="mb-2.5 flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 mask-fade-edges">
              {PRESET_WORKLOADS.map((preset) => {
                const PresetIcon = preset.icon;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => { setChatInput(preset.prompt); textareaRef.current?.focus(); }}
                    className="tactile-btn whitespace-nowrap px-3.5 min-h-11 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 hover:border-blue-500/40 text-xs text-zinc-300 hover:text-white flex items-center gap-1.5 transition-all shrink-0"
                  >
                    <PresetIcon size={14} className="text-blue-400" aria-hidden="true" />
                    <span className="font-medium">{preset.label}</span>
                    <span className="text-xs text-blue-300 bg-blue-500/10 px-1.5 rounded border border-blue-500/20">{preset.tag}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Quick Modifier Chips */}
          {chatInput !== "" && loadingState === 'idle' && (
            <div className="mb-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              <span className="text-xs text-zinc-400 shrink-0">Add:</span>
              {PROMPT_MODIFIERS.map((mod) => (
                <button
                  key={mod.label}
                  type="button"
                  onClick={() => setChatInput((prev) => prev.trim() + mod.append)}
                  className="tactile-btn whitespace-nowrap px-3 min-h-11 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-zinc-300 hover:text-white shrink-0"
                >
                  {mod.label}
                </button>
              ))}
            </div>
          )}

          {/* Input Form with Tactile Action */}
          <form onSubmit={handleSubmit} className="flex gap-2.5 sm:gap-3 items-end">
            <div className="relative flex-1">
              <textarea 
                ref={textareaRef}
                className="w-full bg-[#0D0F14] border border-white/15 focus:border-blue-500/70 rounded-2xl px-4 sm:px-5 py-3 sm:py-3.5 text-zinc-100 placeholder:text-zinc-400 placeholder:font-normal transition-colors text-sm sm:text-base leading-6 resize-none overflow-y-auto min-h-12 sm:min-h-[52px] max-h-36 shadow-inner font-sans block"
                placeholder={
                  isNarrow
                    ? (previousIntent ? 'e.g. Upgrade GPU to RTX 4060' : 'e.g. Gaming PC under 75,000 BDT')
                    : (previousIntent
                        ? 'Tweak your build, e.g. "Upgrade GPU to RTX 4060" or "Change RAM to 32GB"'
                        : 'Describe your PC, e.g. "Gaming build under 75,000 BDT with Ryzen 5"')
                }
                aria-label="Build description input"
                value={chatInput}
                rows={1}
                onChange={(e) => {
                  setChatInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, getMaxChatboxHeight()) + 'px';
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (chatInput.trim() && loadingState !== 'analyzing' && loadingState !== 'selecting' && loadingState !== 'checking') {
                      handleSubmit(e);
                    }
                  }
                }}
                disabled={loadingState === 'analyzing' || loadingState === 'selecting' || loadingState === 'checking'}
              />
            </div>

            {/* Submit or Stop Button */}
            <div className="shrink-0 mb-0.5">
              {loadingState === 'idle' || loadingState === 'success' || loadingState === 'error' ? (
                <button 
                  type="submit" 
                  className="tactile-btn bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-xl w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(59,130,246,0.3)] disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={!chatInput.trim()}
                  title="Build"
                  aria-label="Build"
                >
                  <Send size={18} strokeWidth={2.2} className="ml-0.5" />
                </button>
              ) : (
                <button 
                  type="button" 
                  onClick={handleStop}
                  className="tactile-btn bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 rounded-xl w-11 h-11 sm:w-12 sm:h-12 flex items-center justify-center shrink-0"
                  title="Stop"
                  aria-label="Stop building"
                >
                  <div className="w-3.5 h-3.5 bg-current rounded-[3px]"></div>
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* Groq API Settings Modal */}
      <AnimatePresence>
      {showSettings && (
        <motion.div
          key="settings-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 print:hidden"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowSettings(false); }}
        >
          <motion.div
            ref={settingsDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className="titanium-card rounded-2xl max-w-md w-full shadow-2xl border border-white/15 overflow-hidden"
          >
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <h3 id="settings-title" className="text-base sm:text-lg font-bold flex items-center gap-2 text-white">
                <Key className="text-blue-400" size={18} strokeWidth={1.75} aria-hidden="true" />
                <span>AI settings</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                aria-label="Close settings"
                className="text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 w-11 h-11 flex items-center justify-center rounded-lg transition-colors"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Provider Selection Tabs */}
              <div className="flex p-1 bg-white/5 rounded-xl border border-white/10 gap-1">
                <button
                  type="button"
                  onClick={() => setSelectedProvider('ollama')}
                  aria-pressed={selectedProvider === 'ollama'}
                  className={`flex-1 min-h-11 text-sm font-medium rounded-lg transition-all ${
                    selectedProvider === 'ollama'
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Ollama Cloud
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedProvider('groq')}
                  aria-pressed={selectedProvider === 'groq'}
                  className={`flex-1 min-h-11 text-sm font-medium rounded-lg transition-all ${
                    selectedProvider === 'groq'
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Groq Cloud
                </button>
              </div>

              {selectedProvider === 'ollama' ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label htmlFor="ollama-key" className="text-sm font-semibold text-zinc-200">
                      Ollama API key
                    </label>
                    <a 
                      href="https://ollama.com/settings/keys" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-blue-400 hover:text-blue-300 text-xs font-mono underline"
                    >
                      ollama.com ↗
                    </a>
                  </div>
                  <input
                    id="ollama-key"
                    type="password"
                    autoComplete="off"
                    placeholder="Enter your Ollama API key..."
                    value={customOllamaKey}
                    onChange={(e) => setCustomOllamaKey(e.target.value)}
                    className="w-full bg-[#0D0F14] border border-white/15 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:border-blue-500 font-mono text-sm shadow-inner"
                  />
                  <p className="text-xs text-zinc-400 leading-relaxed font-mono">
                    Connected to <strong className="text-zinc-200">gpt-oss:120b</strong> on Ollama Cloud with free API quota.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label htmlFor="groq-key" className="text-sm font-semibold text-zinc-200">
                      Groq API key
                    </label>
                    <a 
                      href="https://console.groq.com/keys" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-blue-400 hover:text-blue-300 text-xs font-mono underline"
                    >
                      console.groq.com ↗
                    </a>
                  </div>
                  <input
                    id="groq-key"
                    type="password"
                    autoComplete="off"
                    placeholder="gsk_..."
                    value={customGroqKey}
                    onChange={(e) => setCustomGroqKey(e.target.value)}
                    className="w-full bg-[#0D0F14] border border-white/15 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:border-blue-500 font-mono text-sm shadow-inner"
                  />
                  <p className="text-xs text-zinc-400 leading-relaxed font-mono">
                    High-speed LPU inference with custom API key to skip public queue limits.
                  </p>
                </div>
              )}
            </div>

            <div className="p-5 border-t border-white/10 flex justify-end bg-white/[0.02]">
              <button 
                onClick={() => { setShowSettings(false); showToast("API Settings Saved"); }}
                className="tactile-btn bg-white hover:bg-zinc-200 text-zinc-950 px-5 min-h-11 rounded-xl text-sm font-semibold shadow"
              >
                Save & Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

    </div>
  );
}

export default Builder;