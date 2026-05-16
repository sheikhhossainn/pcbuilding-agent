import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Cpu, Layers, Database, HardDrive, Monitor, Zap, Fan, Box, 
  Tv, MousePointer2, Keyboard, BatteryCharging, FileDown, 
  Trash2, Send, Loader2, Sparkles, AlertCircle, AlertTriangle, ExternalLink, Key, X, Menu
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
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 mb-3 rounded-lg border border-slate-700/50 bg-slate-800/30 animate-pulse">
    <div className="flex items-center gap-4 flex-1">
      {/* Icon Skeleton */}
      <div className="w-12 h-12 bg-slate-700/50 rounded-lg shrink-0"></div>
      
      <div className="flex flex-col gap-2 w-full">
        {/* Category Name Skeleton */}
        <div className="w-32 h-5 bg-slate-700/50 rounded"></div>
        {/* Component Name Skeleton */}
        <div className="w-3/4 sm:w-64 h-4 bg-slate-700/30 rounded mt-1"></div>
      </div>
    </div>
    
    {/* Price Skeleton */}
    <div className="w-24 h-6 bg-slate-700/50 rounded mt-2 sm:mt-0"></div>
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
    requestIdRef.current += 1;
    setLoadingState("idle");
    setErrorMsg("");
    clearLoadingTimers();
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || loadingState === "analyzing" || loadingState === "selecting" || loadingState === "checking") return;
    clearLoadingTimers();
    setLoadingState("analyzing");
    setErrorMsg("");
    
    // Simulate some steps before API returns
    const selectTimer = setTimeout(() => {
      setLoadingState((prev) => (prev === 'idle' || prev === 'error' || prev === 'success') ? prev : "selecting");
    }, 1500);
    const checkTimer = setTimeout(() => {
      setLoadingState((prev) => (prev === 'idle' || prev === 'error' || prev === 'success') ? prev : "checking");
    }, 3000);
    loadingTimersRef.current = [selectTimer, checkTimer];

    try {
      const currentRequestId = requestIdRef.current + 1;
      requestIdRef.current = currentRequestId;
      const requestPayload = { 
        message: chatInput, 
        site: selectedSite === 'custom' ? customSiteUrl : selectedSite,
        customKeys: {
          groq: customGroqKey
        }
      };
      abortControllerRef.current = new AbortController();
      const response = await axios.post(`${apiBaseUrl}/api/build`, requestPayload, {
        signal: abortControllerRef.current.signal
      });

      if (currentRequestId !== requestIdRef.current) {
        return;
      }
      
      if (response.data.error) {
        setErrorMsg(response.data.error);
        setLoadingState("error");
        clearLoadingTimers();
        return;
      }

      setBuild({...INITIAL_BUILD, ...response.data.build});
      setTotal(response.data.total);
      setExplanation(response.data.explanation);
      setBuildWarnings(response.data.warnings || []);
      setLoadingState("success");
      clearLoadingTimers();
      setChatInput(""); // clear input
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
        className="component-row flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 mb-3 rounded-lg border border-slate-700 bg-slate-800/50"
      >
        <div className="flex items-start sm:items-center gap-3 sm:gap-4 flex-1 min-w-0">
          <div className="p-2.5 sm:p-3 bg-slate-700 rounded-lg text-sky-400 shrink-0">
            <Icon size={24} />
          </div>
          
          <div className="flex flex-col min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-base sm:text-lg">{category}</span>
              {isRequired && <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full border border-red-500/30">Required</span>}
              {dependencyStr && <span className="text-xs text-slate-400 italic">*{dependencyStr}</span>}
            </div>
            
            {item ? (
              <div className="flex items-start sm:items-center gap-3 mt-1 min-w-0">
                {item.image && <img src={item.image} alt={item.name} className="w-10 h-10 sm:w-12 sm:h-12 object-cover rounded bg-white p-1 shrink-0" />}
                <div className="text-sky-300 font-medium wrap-break-word min-w-0">{item.name}</div>
              </div>
            ) : (
              <div className="text-slate-500 text-sm mt-1">Not configured</div>
            )}
          </div>
        </div>

        {item ? (
          <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 w-full sm:w-auto">
            <div className="font-bold text-base sm:text-lg text-emerald-400 whitespace-nowrap">{formatPrice(item.price)}</div>
            <div className="flex gap-2">
              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 text-slate-400 hover:text-sky-400 bg-slate-700 rounded transition-colors"
                  title="View on store"
                >
                  <ExternalLink size={18} />
                </a>
              )}
              <button 
                className="p-2 text-slate-400 hover:text-red-400 bg-slate-700 rounded transition-colors"
                title="Remove component"
                onClick={() => {
                   const newBuild = {...build};
                   newBuild[category] = null;
                   setBuild(newBuild);
                   setTotal(total - item.price);
                }}
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ) : (
          <div className="hidden sm:block text-slate-600 text-sm">—</div>
        )}
      </motion.div>
    );
  };

  const getLoadingMessage = () => {
    switch (loadingState) {
      case 'analyzing': return "Analyzing your requirements...";
      case 'selecting': return "Selecting optimal components...";
      case 'checking': return "Checking compatibility rules...";
      default: return "Processing...";
    }
  };


  return (
    <div className="min-h-screen pb-[calc(10rem+env(safe-area-inset-bottom))] sm:pb-32">
      {/* Header */}
      <header className="glass sticky top-0 z-50 px-4 sm:px-6 py-3 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-2 shrink-0">
          <Sparkles className="text-sky-400" size={24} />
          <h1 className="text-xl sm:text-2xl font-bold bg-clip-text text-transparent bg-linear-to-r from-sky-400 to-blue-600">
            BuildMyPC
          </h1>
        </div>
        
        {/* Desktop Navigation */}
        <div className="hidden lg:flex items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-700/50">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Source:</span>
            <select 
              value={selectedSite} 
              onChange={(e) => setSelectedSite(e.target.value)}
              className="bg-transparent text-sm text-slate-200 focus:outline-none cursor-pointer"
              disabled={loadingState !== 'idle' && loadingState !== 'error' && loadingState !== 'success'}
            >
              <option className="bg-slate-800 text-slate-200" value="startech">StarTech</option>
              <option className="bg-slate-800 text-slate-200" value="techland">Techland</option>
              <option className="bg-slate-800 text-slate-200" value="computermania">CompMania</option>
              <option className="bg-slate-800 text-slate-200" value="custom">Custom...</option>
            </select>
          </div>

          <button 
            onClick={() => setShowSettings(true)}
            className="px-3 py-1.5 text-slate-400 hover:text-sky-400 bg-slate-800 rounded-lg border border-slate-700/50 flex items-center gap-2 transition-colors"
          >
            <span className="text-sm font-medium">API Key</span>
            <Key size={16} />
          </button>

          <div className="w-px h-6 bg-slate-700 mx-1"></div>

          <button onClick={handleDownloadPDF} className="px-3 py-1.5 bg-slate-800 text-slate-300 hover:text-white rounded-lg border border-slate-700/50 flex items-center gap-2 transition-colors">
            <FileDown size={16} />
            <span className="text-sm font-medium">Download PDF</span>
          </button>

          <button onClick={handleClear} className="px-3 py-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg border border-red-500/20 flex items-center gap-2 transition-colors">
            <Trash2 size={16} />
            <span className="text-sm font-medium">Clear Build</span>
          </button>
        </div>

        {/* Mobile Hamburger Toggle */}
        <button 
          onClick={() => setShowMobileMenu(!showMobileMenu)}
          className="lg:hidden p-2 text-slate-300 hover:text-white bg-slate-800 rounded-lg border border-slate-700"
        >
          {showMobileMenu ? <X size={24} /> : <Menu size={24} />}
        </button>

        {/* Mobile Menu Overlay */}
        <AnimatePresence>
          {showMobileMenu && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-full left-0 right-0 glass border-b border-slate-700 p-4 lg:hidden flex flex-col gap-4 shadow-2xl"
            >
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Shop Source</label>
                <select 
                  value={selectedSite} 
                  onChange={(e) => setSelectedSite(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-slate-200 focus:outline-none"
                >
                  <option className="bg-slate-800 text-slate-200" value="startech">StarTech</option>
                  <option className="bg-slate-800 text-slate-200" value="techland">Techland</option>
                  <option className="bg-slate-800 text-slate-200" value="computermania">ComputerMania</option>
                  <option className="bg-slate-800 text-slate-200" value="custom">Custom URL...</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => { setShowSettings(true); setShowMobileMenu(false); }}
                  className="flex items-center justify-center gap-2 bg-slate-800 border border-slate-700 rounded-lg py-3 text-slate-300"
                >
                  <Key size={18} />
                  <span className="text-sm font-medium">API Key</span>
                </button>
                <button 
                  onClick={() => { handleDownloadPDF(); setShowMobileMenu(false); }}
                  className="flex items-center justify-center gap-2 bg-slate-800 border border-slate-700 rounded-lg py-3 text-slate-300"
                >
                  <FileDown size={18} />
                  <span className="text-sm font-medium">PDF</span>
                </button>
              </div>

              <button 
                onClick={() => { handleClear(); setShowMobileMenu(false); }}
                className="w-full flex items-center justify-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg py-3"
              >
                <Trash2 size={18} />
                <span className="text-sm font-medium">Clear Current Build</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto mt-6 sm:mt-8 px-3 sm:px-4" ref={builderRef}>
        
        <div className="glass-card rounded-xl p-4 sm:p-6 mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between border-b border-slate-700 pb-4 mb-6 gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-2">PC Builder - Build Your Own PC</h2>
              <label className="flex items-center gap-2 cursor-pointer text-slate-400 text-sm">
                <input 
                  type="checkbox" 
                  className="rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500"
                  checked={hideUnconfigured}
                  onChange={(e) => setHideUnconfigured(e.target.checked)}
                />
                Hide Unconfigured Components
              </label>
            </div>
            
            <div className="total-card text-left bg-slate-800 p-3 rounded-lg border border-slate-700 w-full sm:w-auto sm:min-w-50">
              <div className="text-slate-400 text-sm mb-1">Total ({Object.values(build).filter(Boolean).length} items)</div>
              <div className="text-3xl font-bold text-sky-400">{formatPrice(total)}</div>
            </div>
          </div>

          {errorMsg && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3 text-red-400">
              <AlertCircle className="mt-0.5 shrink-0" size={20} />
              <p>{errorMsg}</p>
            </div>
          )}

          <div className="mb-8">
            <div className="bg-slate-800 text-slate-300 font-semibold px-4 py-2 rounded-md mb-4 inline-block shadow-sm border border-slate-700">
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
            <div className="bg-slate-800 text-slate-300 font-semibold px-4 py-2 rounded-md mb-4 inline-block shadow-sm border border-slate-700">
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
      <div className="fixed bottom-0 left-0 right-0 glass border-t border-slate-700/50 p-3 sm:p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] z-50 print:hidden">
        <div className="max-w-4xl mx-auto relative chatbox-shell">
          
          {loadingState !== 'idle' && loadingState !== 'success' && loadingState !== 'error' && (
            <div className="loading-pill">
              <div className="bg-slate-800 text-sky-400 px-4 py-2 rounded-full border border-sky-500/30 shadow-lg shadow-sky-900/20 flex items-center gap-3 text-sm font-medium">
                <Loader2 size={16} className="animate-spin" />
                {getLoadingMessage()}
              </div>
            </div>
          )}

          {/* Settings Row above Chat removed */}

          <form onSubmit={handleSubmit} className="flex gap-3 relative">
            {chatInput === "" && total === 0 && loadingState === 'idle' && (
              <div className="absolute -top-12 left-0 right-0 flex gap-2 overflow-x-auto no-scrollbar px-1 pb-2 mask-linear-fade">
                {["Budget 1080p Gaming", "High-end Video Editing", "Office Productivity PC"].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setChatInput(`I need a ${prompt.toLowerCase()} under 80,000 BDT`)}
                    className="whitespace-nowrap px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-xs text-sky-300 hover:bg-slate-700 transition-colors shadow-lg"
                  >
                    ✨ {prompt}
                  </button>
                ))}
              </div>
            )}
            <div className="relative flex-1">
              {!chatInput && (
               <div className="pointer-events-none absolute inset-0 flex items-center px-4 sm:px-6 text-slate-400 text-base sm:text-lg">
                Describe your build... e.g. I need a gaming PC under 60,000 BDT
               </div>
              )}
              <textarea 
                ref={textareaRef}
                className="w-full bg-slate-800/90 border border-slate-600 rounded-2xl px-4 sm:px-6 py-3 sm:py-4 text-white placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all text-base sm:text-lg resize-none overflow-y-auto min-h-13 sm:min-h-14 max-h-30 sm:max-h-50"
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
            <div className="flex items-center self-center">
              {loadingState === 'idle' || loadingState === 'success' || loadingState === 'error' ? (
                <button 
                  type="submit" 
                  className="btn-primary rounded-full w-11 h-11 sm:w-14 sm:h-14 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20"
                  disabled={!chatInput.trim()}
                >
                  <Send size={20} />
                </button>
              ) : (
                <button 
                  type="button" 
                  onClick={handleStop}
                  className="bg-red-500 hover:bg-red-600 text-white rounded-full w-11 h-11 sm:w-14 sm:h-14 flex items-center justify-center shrink-0 shadow-lg shadow-red-500/20 transition-all"
                  title="Stop generation"
                >
                  <div className="w-4 h-4 bg-white rounded-sm"></div>
                </button>
              )}
            </div>
          </form>
        </div>
      </div>


      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-100 flex items-center justify-center p-4">
          <div className="glass-card bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-800">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Key className="text-sky-400" size={20} />
                API Settings
              </h3>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white transition-colors">
                <X size={24} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <p className="text-sm text-slate-300">
                To bypass rate limits, you can provide your own API keys. These are stored locally in your browser and are only sent to our backend during processing.
              </p>
              
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-400 flex items-center justify-between">
                  Groq API Key
                  <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline text-xs font-normal">Get a key</a>
                </label>
                <input 
                  type="password"
                  placeholder="gsk_..."
                  value={customGroqKey}
                  onChange={(e) => setCustomGroqKey(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-600 rounded px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all"
                />
              </div>
            </div>
            <div className="p-6 border-t border-slate-800 flex justify-end">
              <button 
                onClick={() => setShowSettings(false)}
                className="btn-primary px-6 py-2 rounded-md font-medium"
              >
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default Builder;