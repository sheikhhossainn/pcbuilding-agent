import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Cpu, Layers, Database, HardDrive, Monitor, Zap, Fan, Box, 
  Tv, MousePointer2, Keyboard, BatteryCharging, FileDown, 
  Trash2, Send, Loader2, Sparkles, AlertCircle, AlertTriangle, ExternalLink, Key, X, Menu, RefreshCw
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

const CORE_CATEGORIES = [
  "Processor", "Motherboard", "RAM", "Storage", "Graphics Card", "PSU", "CPU Cooler", "Casing"
];

const PERIPHERAL_CATEGORIES = [
  "Monitor", "Mouse", "Keyboard", "UPS"
];

const SkeletonRow = () => (
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-5 mb-3 rounded-xl border border-white/5 bg-zinc-900/40 animate-pulse">
    <div className="flex items-center gap-4 flex-1">
      {/* Icon Skeleton */}
      <div className="w-12 h-12 bg-zinc-800/60 rounded-xl shrink-0"></div>
      
      <div className="flex flex-col gap-2 w-full">
        {/* Category Name Skeleton */}
        <div className="w-32 h-5 bg-zinc-800/60 rounded-md"></div>
        {/* Component Name Skeleton */}
        <div className="w-3/4 sm:w-64 h-4 bg-zinc-800/40 rounded-md mt-1"></div>
      </div>
    </div>
    
    {/* Price Skeleton */}
    <div className="w-24 h-6 bg-zinc-800/60 rounded-md mt-2 sm:mt-0"></div>
  </div>
);

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

function Builder() {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "";
  const [build, setBuild] = useState(INITIAL_BUILD);
  const [total, setTotal] = useState(0);
  const [explanation, setExplanation] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [selectedSite, setSelectedSite] = useState("startech");
  const [customSiteUrl, setCustomSiteUrl] = useState("");
  const [loadingState, setLoadingState] = useState("idle"); // idle, analyzing, selecting, checking, success, error
  const [hideUnconfigured, setHideUnconfigured] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [buildWarnings, setBuildWarnings] = useState([]);
  const [customGroqKey, setCustomGroqKey] = useState(localStorage.getItem('customGroqKey') || "");
  const [showSettings, setShowSettings] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [queuePosition, setQueuePosition] = useState(0);
  const [showTrafficWarning, setShowTrafficWarning] = useState(false);
  const [previousIntent, setPreviousIntent] = useState(null);
  const [previousBuild, setPreviousBuild] = useState(null);
  const pollRef = useRef(null);
  
  const builderRef = useRef();
  const textareaRef = useRef(null);
  const loadingTimersRef = useRef([]);
  const abortControllerRef = useRef(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (chatInput === "" && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [chatInput]);

  const getMaxChatboxHeight = () => {
    // Keep the chatbox from becoming huge on mobile.
    // Tailwind's `sm` breakpoint is 640px.
    if (typeof window !== 'undefined' && window.innerWidth < 640) return 120;
    return 200;
  };

  useEffect(() => {
    localStorage.setItem('customGroqKey', customGroqKey);
  }, [customGroqKey]);

  const handleDownloadPDF = () => {
    window.print();
  };

  const handleClear = () => {
    setBuild(INITIAL_BUILD);
    setTotal(0);
    setExplanation("");
    setErrorMsg("");
    setBuildWarnings([]);
    setLoadingState("idle");
    setQueuePosition(0);
    setShowTrafficWarning(false);
    setPreviousIntent(null);
    setPreviousBuild(null);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
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
        customKeys: { groq: customGroqKey },
        ...(previousIntent && { previousIntent }),
        ...(previousBuild && { previousBuild }),
      };
      abortControllerRef.current = new AbortController();

      // Step 1: Submit → get jobId instantly (~200ms)
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

      // Simulate loading phases
      const selectTimer = setTimeout(() => {
        setLoadingState((prev) => (prev === 'idle' || prev === 'error' || prev === 'success') ? prev : "selecting");
      }, 1500);
      const checkTimer = setTimeout(() => {
        setLoadingState((prev) => (prev === 'idle' || prev === 'error' || prev === 'success') ? prev : "checking");
      }, 3000);
      loadingTimersRef.current = [selectTimer, checkTimer];

      // Step 2: Poll every 3s for result
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
            setTotal(data.result.total);
            setExplanation(data.result.explanation);
            setBuildWarnings(data.result.warnings || []);
            setPreviousIntent(data.result.intent || null);
            setPreviousBuild(data.result.build || null);
            setLoadingState("success");
            setQueuePosition(0);
            setShowTrafficWarning(false);
            setChatInput("");
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
          // Polling errors are transient — keep trying unless cancelled
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
        setErrorMsg("You've reached the free limit. Please wait 15 minutes, or enter your own API key in the settings to continue immediately.");
      } else {
        setErrorMsg(err.response?.data?.error || "Failed to connect to the AI builder.");
      }
      setLoadingState("error");
      clearLoadingTimers();
    }
  };

  const formatPrice = (price) => {
    return new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', minimumFractionDigits: 0 }).format(price);
  };

  const renderComponentRow = (category, isRequired, dependencyStr) => {
    const item = build[category];
    if (hideUnconfigured && !item) return null;

    const Icon = CATEGORY_ICONS[category] || Box;

    return (
      <motion.div 
        key={category} 
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, x: -20, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="component-row flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-5 mb-3 rounded-xl border border-white/5 bg-zinc-900/30 hover:bg-zinc-900/80"
      >
        <div className="flex items-start sm:items-center gap-4 sm:gap-5 flex-1 min-w-0">
          <div className="p-3 bg-zinc-800/50 rounded-xl text-zinc-300 shrink-0 shadow-sm border border-white/5">
            <Icon size={22} strokeWidth={1.5} />
          </div>
          
          <div className="flex flex-col min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-semibold text-base sm:text-lg text-zinc-100 tracking-tight">{category}</span>
              {isRequired && <span className="text-[11px] font-medium uppercase tracking-wider bg-red-500/10 text-red-400 px-2.5 py-0.5 rounded-full border border-red-500/20">Required</span>}
              {dependencyStr && <span className="text-xs text-zinc-500">*{dependencyStr}</span>}
            </div>
            
            {item ? (
              <div className="flex items-start sm:items-center gap-3 mt-1.5 min-w-0">
                {item.image && <img src={item.image} alt={item.name} className="w-10 h-10 sm:w-11 sm:h-11 object-cover rounded-md bg-white p-1 shrink-0" />}
                <div className="text-zinc-300 font-medium wrap-break-word min-w-0 leading-snug">{item.name}</div>
              </div>
            ) : (
              <div className="text-zinc-600 text-sm mt-1.5 italic">Not configured</div>
            )}
          </div>
        </div>

        {item ? (
          <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 w-full sm:w-auto mt-2 sm:mt-0">
            <div className="font-semibold text-lg sm:text-xl text-zinc-100 whitespace-nowrap tracking-tight">{formatPrice(item.price)}</div>
            <div className="flex gap-2">
              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 text-zinc-400 hover:text-zinc-100 bg-zinc-800/50 rounded-lg hover:bg-zinc-700 transition-colors border border-transparent hover:border-white/10"
                  title="View on store"
                >
                  <ExternalLink size={18} strokeWidth={1.5} />
                </a>
              )}
              <button 
                className="p-2.5 text-zinc-400 hover:text-red-400 bg-zinc-800/50 rounded-lg hover:bg-zinc-800 transition-colors border border-transparent hover:border-red-500/20"
                title="Remove component"
                onClick={() => {
                   const newBuild = {...build};
                   newBuild[category] = null;
                   setBuild(newBuild);
                   setTotal(total - item.price);
                }}
              >
                <Trash2 size={18} strokeWidth={1.5} />
              </button>
            </div>
          </div>
        ) : (
          <div className="hidden sm:block text-zinc-700 text-sm">—</div>
        )}
      </motion.div>
    );
  };

  const getLoadingMessage = () => {
    if (queuePosition > 0) return `Queue position: #${queuePosition} — estimated ~${queuePosition * 12}s`;
    switch (loadingState) {
      case 'analyzing': return "Analyzing your requirements...";
      case 'selecting': return "Selecting optimal components...";
      case 'checking': return "Checking compatibility rules...";
      default: return "Processing...";
    }
  };


  return (
    <div className="min-h-screen pb-[calc(10rem+env(safe-area-inset-bottom))] sm:pb-32 bg-[#09090b]">
      {/* Floating Header */}
      <div className="sticky top-0 z-50 pt-4 sm:pt-6 px-4 sm:px-6 print:hidden">
        <header className="max-w-5xl mx-auto bg-zinc-900/80 backdrop-blur-2xl border border-white/10 rounded-2xl px-4 sm:px-6 py-3.5 flex items-center justify-between shadow-2xl shadow-black/50">
          <div className="flex items-center gap-3 shrink-0">
            <div className="bg-zinc-100 p-1.5 rounded-lg text-zinc-950">
              <Sparkles size={20} strokeWidth={2} />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-100 tracking-tight">
              BuildMyPC
            </h1>
          </div>
          
          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-3">
            <div className="flex items-center gap-2 bg-zinc-950/50 px-3.5 py-2 rounded-xl border border-white/5 shadow-inner">
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-widest">Source:</span>
              <select 
                value={selectedSite} 
                onChange={(e) => setSelectedSite(e.target.value)}
                className="bg-transparent text-sm font-medium text-zinc-200 focus:outline-none cursor-pointer"
                disabled={loadingState !== 'idle' && loadingState !== 'error' && loadingState !== 'success'}
              >
                <option className="bg-zinc-900 text-zinc-200" value="startech">StarTech</option>
                <option className="bg-zinc-900 text-zinc-200" value="techland">Techland</option>
                <option className="bg-zinc-900 text-zinc-200" value="computermania">CompMania</option>
                <option className="bg-zinc-900 text-zinc-200" value="custom">Custom...</option>
              </select>
            </div>

            <button 
              onClick={() => setShowSettings(true)}
              className={`px-3.5 py-2 bg-zinc-950/50 rounded-xl border flex items-center gap-2.5 transition-all shadow-inner ${
                showTrafficWarning
                  ? 'text-yellow-400 border-yellow-400/30 ring-1 ring-yellow-400/50 pulse-active'
                  : 'text-zinc-400 hover:text-zinc-100 border-white/5 hover:border-white/10 hover:bg-zinc-800/80'
              }`}
            >
              <Key size={16} strokeWidth={1.5} />
              <span className="text-sm font-medium">API Key</span>
            </button>

            <div className="w-px h-5 bg-white/10 mx-1"></div>

            <button onClick={handleDownloadPDF} className="px-3.5 py-2 bg-zinc-950/50 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 rounded-xl border border-white/5 flex items-center gap-2.5 transition-all shadow-inner">
              <FileDown size={16} strokeWidth={1.5} />
              <span className="text-sm font-medium">Export</span>
            </button>

            <button onClick={handleClear} className="px-3.5 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 rounded-xl border border-red-500/10 flex items-center gap-2.5 transition-all">
              <Trash2 size={16} strokeWidth={1.5} />
              <span className="text-sm font-medium">Clear</span>
            </button>
          </div>

          {/* Mobile Hamburger Toggle */}
          <button 
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="lg:hidden p-2 text-zinc-400 hover:text-zinc-100 bg-zinc-950/80 rounded-xl border border-white/5 transition-colors"
          >
            {showMobileMenu ? <X size={22} strokeWidth={1.5} /> : <Menu size={22} strokeWidth={1.5} />}
          </button>
        </header>

        {/* Mobile Menu Popover */}
        <AnimatePresence>
          {showMobileMenu && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full left-4 right-4 mt-3 bg-zinc-900 border border-white/10 p-5 rounded-2xl lg:hidden flex flex-col gap-4 shadow-2xl"
            >
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Shop Source</label>
                <select 
                  value={selectedSite} 
                  onChange={(e) => setSelectedSite(e.target.value)}
                  className="w-full bg-zinc-950 border border-white/5 rounded-xl px-4 py-3 text-zinc-200 focus:outline-none focus:border-zinc-700"
                >
                  <option className="bg-zinc-900 text-zinc-200" value="startech">StarTech</option>
                  <option className="bg-zinc-900 text-zinc-200" value="techland">Techland</option>
                  <option className="bg-zinc-900 text-zinc-200" value="computermania">ComputerMania</option>
                  <option className="bg-zinc-900 text-zinc-200" value="custom">Custom URL...</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => { setShowSettings(true); setShowMobileMenu(false); }}
                  className={`flex items-center justify-center gap-2 bg-zinc-950 border rounded-xl py-3.5 transition-all ${
                    showTrafficWarning
                      ? 'text-yellow-400 border-yellow-400/30 ring-1 ring-yellow-400/50'
                      : 'text-zinc-300 border-white/5 hover:bg-zinc-800'
                  }`}
                >
                  <Key size={18} strokeWidth={1.5} />
                  <span className="text-sm font-medium">API Key</span>
                </button>
                <button 
                  onClick={() => { handleDownloadPDF(); setShowMobileMenu(false); }}
                  className="flex items-center justify-center gap-2 bg-zinc-950 hover:bg-zinc-800 border border-white/5 rounded-xl py-3.5 text-zinc-300 transition-all"
                >
                  <FileDown size={18} strokeWidth={1.5} />
                  <span className="text-sm font-medium">PDF</span>
                </button>
              </div>

              <button 
                onClick={() => { handleClear(); setShowMobileMenu(false); }}
                className="w-full flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-xl py-3.5 transition-all"
              >
                <Trash2 size={18} strokeWidth={1.5} />
                <span className="text-sm font-medium">Clear Current Build</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto mt-6 sm:mt-8 px-3 sm:px-4" ref={builderRef}>

        {/* Traffic Warning Banner */}
        <AnimatePresence>
          {showTrafficWarning && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-start gap-3 text-yellow-300"
            >
              <AlertTriangle className="mt-0.5 shrink-0" size={20} />
              <div className="text-sm">
                <strong>Heavy traffic detected.</strong> Get your{' '}
                <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="underline text-yellow-200 hover:text-white">free Groq API key</a>{' '}
                and paste it in <button onClick={() => setShowSettings(true)} className="underline text-yellow-200 hover:text-white">API Settings</button> for instant builds — no queue.
              </div>
              <button onClick={() => setShowTrafficWarning(false)} className="text-yellow-400 hover:text-white shrink-0 ml-auto">
                <X size={18} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        
        <div className="glass-card rounded-2xl p-5 sm:p-8 mb-8 border border-white/5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between border-b border-white/5 pb-5 mb-7 gap-5">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-2.5 text-zinc-100 tracking-tight">Build Your Own PC</h2>
              <label className="flex items-center gap-2.5 cursor-pointer text-zinc-400 text-sm font-medium hover:text-zinc-300 transition-colors">
                <input 
                  type="checkbox" 
                  className="rounded border-zinc-700 bg-zinc-900 text-zinc-300 focus:ring-zinc-500 focus:ring-offset-zinc-900 w-4 h-4 cursor-pointer"
                  checked={hideUnconfigured}
                  onChange={(e) => setHideUnconfigured(e.target.checked)}
                />
                Hide Unconfigured Components
              </label>
            </div>
            
            <div className="total-card text-left bg-zinc-900/60 p-4 rounded-xl border border-white/5 w-full sm:w-auto sm:min-w-50 shadow-inner">
              <div className="text-zinc-500 text-sm mb-1 font-medium tracking-wide uppercase">Total ({Object.values(build).filter(Boolean).length} items)</div>
              <div className="text-3xl font-bold text-zinc-100 tracking-tight">{formatPrice(total)}</div>
            </div>
          </div>

          {errorMsg && (
            <div className="mb-7 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3 text-red-400 shadow-sm">
              <AlertCircle className="mt-0.5 shrink-0" size={20} strokeWidth={1.5} />
              <p className="font-medium text-sm sm:text-base leading-relaxed">{errorMsg}</p>
            </div>
          )}

          <div className="mb-10">
            <div className="bg-zinc-800/80 text-zinc-300 font-semibold px-4 py-2 rounded-lg mb-5 inline-block shadow-sm border border-white/5 tracking-wide text-sm uppercase">
              Core Components
            </div>
            <div className="space-y-1">
              <AnimatePresence mode="popLayout">
                {CORE_CATEGORIES.map(category => {
                  const isLoading = loadingState === 'analyzing' || loadingState === 'selecting' || loadingState === 'checking';
                  if (isLoading) return <SkeletonRow key={`skel-${category}`} />;

                  const isRequired = ["Processor", "Motherboard", "RAM", "Storage", "PSU", "Casing"].includes(category);
                  let dependencyStr = "";
                  if (category === "Motherboard") dependencyStr = "Processor";
                  if (category === "RAM") dependencyStr = "Motherboard";
                  return renderComponentRow(category, isRequired, dependencyStr);
                })}
              </AnimatePresence>
            </div>
          </div>

          <div>
            <div className="bg-zinc-800/80 text-zinc-300 font-semibold px-4 py-2 rounded-lg mb-5 inline-block shadow-sm border border-white/5 tracking-wide text-sm uppercase">
              Peripherals
            </div>
            <div className="space-y-1">
              <AnimatePresence mode="popLayout">
                {PERIPHERAL_CATEGORIES.map(category => {
                  const isLoading = loadingState === 'analyzing' || loadingState === 'selecting' || loadingState === 'checking';
                  if (isLoading) return <SkeletonRow key={`skel-${category}`} />;
                  return renderComponentRow(category, false, "");
                })}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {explanation && (
          <div className="glass-card rounded-xl p-6 mb-8 border-l-4 border-l-sky-500">
            <h3 className="text-xl font-bold mb-3 flex items-center gap-2">
              <Sparkles className="text-sky-400" size={20} />
              AI Build Explanation
            </h3>
            <p className="text-slate-300 leading-relaxed">
              {explanation}
            </p>
            {buildWarnings.length > 0 && (
              <div className="mt-4 space-y-2">
                {buildWarnings.map((warning, i) => (
                  <div key={i} className={`flex items-start gap-2 p-3 rounded-lg text-sm ${
                    warning.includes('INCOMPATIBLE') 
                      ? 'bg-red-500/10 border border-red-500/30 text-red-400' 
                      : 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
                  }`}>
                    <AlertTriangle className="mt-0.5 shrink-0" size={16} />
                    <span>{warning}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </main>

      {/* Fixed Chat Input */}
      <div className="fixed bottom-0 left-0 right-0 bg-zinc-950/80 backdrop-blur-xl border-t border-white/5 p-3 sm:p-5 pb-[calc(1rem+env(safe-area-inset-bottom))] z-50 print:hidden">
        <div className="max-w-4xl mx-auto relative chatbox-shell">
          
          {loadingState !== 'idle' && loadingState !== 'success' && loadingState !== 'error' && (
            <div className="absolute left-1/2 -top-14 transform -translate-x-1/2 z-50 pointer-events-none">
              <div className="bg-zinc-900 text-zinc-300 px-5 py-2.5 rounded-full border border-white/10 shadow-xl flex items-center gap-3 text-sm font-medium tracking-wide">
                <Loader2 size={16} className="animate-spin text-zinc-500" strokeWidth={2} />
                {getLoadingMessage()}
              </div>
            </div>
          )}

          {/* Follow-up mode indicator */}
          {previousIntent && loadingState !== 'analyzing' && loadingState !== 'selecting' && loadingState !== 'checking' && (
            <div className="mb-3 flex items-center gap-3">
              <div className="bg-zinc-800/80 text-zinc-300 px-4 py-1.5 rounded-full border border-white/5 flex items-center gap-2 text-xs font-medium tracking-wide">
                <RefreshCw size={12} strokeWidth={2} />
                Refine mode
              </div>
              <button
                type="button"
                onClick={handleClear}
                className="text-xs text-zinc-500 hover:text-zinc-300 font-medium transition-colors"
              >
                Start fresh
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex gap-3 sm:gap-4 relative group">
            {chatInput === "" && !previousIntent && total === 0 && loadingState === 'idle' && (
              <div className="absolute -top-14 left-0 right-0 flex gap-2.5 overflow-x-auto no-scrollbar px-1 pb-2 mask-linear-fade">
                {["Budget 1080p Gaming", "High-end Video Editing", "Office Productivity PC"].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setChatInput(`I need a ${prompt.toLowerCase()} under 80,000 BDT`)}
                    className="whitespace-nowrap px-4 py-2 rounded-full bg-zinc-900 border border-white/5 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 hover:border-white/10 transition-all shadow-lg"
                  >
                    ✨ {prompt}
                  </button>
                ))}
              </div>
            )}
            <div className="relative flex-1">
              {!chatInput && (
               <div className="pointer-events-none absolute inset-0 flex items-center px-5 sm:px-6 text-zinc-500 text-base sm:text-lg">
                {previousIntent
                  ? 'Tweak your build... e.g. Change GPU to RTX 4060'
                  : 'Describe your build... e.g. I need a gaming PC under 60,000 BDT'
                }
               </div>
              )}
              <textarea 
                ref={textareaRef}
                className="w-full bg-zinc-900 border border-white/10 rounded-2xl px-5 sm:px-6 py-3.5 sm:py-4 text-zinc-100 placeholder-transparent focus:outline-none focus:border-zinc-500 focus:bg-zinc-800/80 transition-all text-base sm:text-lg resize-none overflow-y-auto min-h-13 sm:min-h-15 max-h-32 sm:max-h-48 shadow-inner"
               placeholder=""
               aria-label="Build description"
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
            <div className="flex items-center self-end mb-1 sm:mb-1.5">
              {loadingState === 'idle' || loadingState === 'success' || loadingState === 'error' ? (
                <button 
                  type="submit" 
                  className="bg-zinc-100 hover:bg-white text-zinc-950 rounded-xl w-11 h-11 sm:w-13 sm:h-13 flex items-center justify-center shrink-0 shadow-lg shadow-white/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5"
                  disabled={!chatInput.trim()}
                >
                  <Send size={20} strokeWidth={2} className="ml-0.5" />
                </button>
              ) : (
                <button 
                  type="button" 
                  onClick={handleStop}
                  className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-xl w-11 h-11 sm:w-13 sm:h-13 flex items-center justify-center shrink-0 transition-all hover:-translate-y-0.5"
                  title="Stop generation"
                >
                  <div className="w-4 h-4 bg-current rounded-[3px]"></div>
                </button>
              )}
            </div>
          </form>
        </div>
      </div>


      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-100 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-zinc-950 border border-white/10 rounded-2xl max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between p-6 border-b border-white/5">
              <h3 className="text-xl font-bold flex items-center gap-2 text-zinc-100">
                <Key className="text-zinc-400" size={20} strokeWidth={1.5} />
                API Settings
              </h3>
              <button onClick={() => setShowSettings(false)} className="text-zinc-500 hover:text-zinc-300 transition-colors bg-zinc-900 hover:bg-zinc-800 p-2 rounded-lg">
                <X size={20} strokeWidth={1.5} />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <p className="text-sm text-zinc-400 leading-relaxed">
                To bypass rate limits, provide your own API key. It is stored locally in your browser and never saved on our servers.
              </p>
              
              <div className="space-y-3">
                <label className="text-sm font-semibold text-zinc-300 flex items-center justify-between uppercase tracking-wider">
                  Groq API Key
                  <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-zinc-100 border-b border-zinc-700 hover:border-zinc-400 transition-all text-xs font-medium">Get a key</a>
                </label>
                <input 
                  type="password"
                  placeholder="gsk_..."
                  value={customGroqKey}
                  onChange={(e) => setCustomGroqKey(e.target.value)}
                  className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-all font-mono"
                />
              </div>
            </div>
            <div className="p-6 border-t border-white/5 flex justify-end bg-zinc-900/30">
              <button 
                onClick={() => setShowSettings(false)}
                className="bg-zinc-100 hover:bg-white text-zinc-950 px-6 py-2.5 rounded-xl font-medium transition-colors"
              >
                Save & Close
              </button>
            </div>
          </motion.div>
        </div>
      )}

    </div>
  );
}

export default Builder;