import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { 
  Cpu, Layers, Database, HardDrive, Monitor, Zap, Fan, Box, 
  Tv, MousePointer2, Keyboard, FileDown, 
  Trash2, Send, Loader2, Sparkles, AlertCircle, ExternalLink, Key, X
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
  "Keyboard": Keyboard
};

const CORE_CATEGORIES = [
  "Processor", "Motherboard", "RAM", "Storage", "Graphics Card", "PSU", "CPU Cooler", "Casing"
];

const PERIPHERAL_CATEGORIES = [
  "Monitor", "Mouse", "Keyboard"
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
  "Keyboard": null
};

function Builder() {
  const [build, setBuild] = useState(INITIAL_BUILD);
  const [total, setTotal] = useState(0);
  const [explanation, setExplanation] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [selectedSite, setSelectedSite] = useState("startech");
  const [customSiteUrl, setCustomSiteUrl] = useState("");
  const [selectedApi, setSelectedApi] = useState("groq");
  const [loadingState, setLoadingState] = useState("idle"); // idle, analyzing, selecting, checking, success, error
  const [hideUnconfigured, setHideUnconfigured] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [customGroqKey, setCustomGroqKey] = useState(localStorage.getItem('customGroqKey') || "");
  const [customGeminiKey, setCustomGeminiKey] = useState(localStorage.getItem('customGeminiKey') || "");
  const [showSettings, setShowSettings] = useState(false);
  
  const builderRef = useRef();
  const loadingTimersRef = useRef([]);
  const abortControllerRef = useRef(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    localStorage.setItem('customGroqKey', customGroqKey);
  }, [customGroqKey]);

  useEffect(() => {
    localStorage.setItem('customGeminiKey', customGeminiKey);
  }, [customGeminiKey]);

  const handleDownloadPDF = () => {
    window.print();
  };

  const handleClear = () => {
    setBuild(INITIAL_BUILD);
    setTotal(0);
    setExplanation("");
    setErrorMsg("");
    setLoadingState("idle");
  };

  const clearLoadingTimers = () => {
    loadingTimersRef.current.forEach((timerId) => clearTimeout(timerId));
    loadingTimersRef.current = [];
  };


  const handleStop = () => {
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
    e.preventDefault();
    if (!chatInput.trim()) return;
    clearLoadingTimers();
    setLoadingState("analyzing");
    setErrorMsg("");
    
    // Simulate some steps before API returns
    const selectTimer = setTimeout(() => {
      setLoadingState((prev) => (prev === 'error' || prev === 'success') ? prev : "selecting");
    }, 1500);
    const checkTimer = setTimeout(() => {
      setLoadingState((prev) => (prev === 'error' || prev === 'success') ? prev : "checking");
    }, 3000);
    loadingTimersRef.current = [selectTimer, checkTimer];

    try {
      const currentRequestId = requestIdRef.current + 1;
      requestIdRef.current = currentRequestId;
      const requestPayload = { 
        message: chatInput, 
        site: selectedSite === 'custom' ? customSiteUrl : selectedSite,
        apiProvider: selectedApi,
        customKeys: {
          groq: customGroqKey,
          gemini: customGeminiKey
        }
      };
      abortControllerRef.current = new AbortController();
      const response = await axios.post('/api/build', requestPayload, {
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
      <div key={category} className="component-row flex items-center justify-between p-4 mb-3 rounded-lg border border-slate-700 bg-slate-800/50">
        <div className="flex items-center gap-4 flex-1">
          <div className="p-3 bg-slate-700 rounded-lg text-sky-400">
            <Icon size={24} />
          </div>
          
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-lg">{category}</span>
              {isRequired && <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full border border-red-500/30">Required</span>}
              {dependencyStr && <span className="text-xs text-slate-400 italic">*{dependencyStr}</span>}
            </div>
            
            {item ? (
              <div className="flex items-center gap-3 mt-1">
                {item.image && <img src={item.image} alt={item.name} className="w-12 h-12 object-cover rounded bg-white p-1" />}
                <div className="text-sky-300 font-medium">{item.name}</div>
              </div>
            ) : (
              <div className="text-slate-500 text-sm mt-1">Not configured</div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {item ? (
            <>
              <div className="font-bold text-lg text-emerald-400">{formatPrice(item.price)}</div>
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
            </>
          ) : (
            <div className="p-2 text-slate-600 bg-slate-700/50 rounded cursor-not-allowed" title="No component selected">
              <ExternalLink size={18} />
            </div>
          )}
        </div>
      </div>
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
    <div className="min-h-screen pb-32">
      {/* Header */}
      <header className="glass sticky top-0 z-50 px-6 py-4 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <Sparkles className="text-sky-400" size={28} />
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-sky-400 to-blue-600">
            BuildMyPC
          </h1>
        </div>
        
        <div className="flex items-center gap-6">
          {/* Settings Group */}
          <div className="flex items-center gap-4 bg-slate-800/50 px-4 py-2 rounded-lg border border-slate-700/50">
             <div className="flex items-center gap-2">
               <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Source:</span>
               <select 
                  value={selectedSite} 
                  onChange={(e) => setSelectedSite(e.target.value)}
                  className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200 focus:outline-none focus:border-sky-500 transition-all cursor-pointer"
                  disabled={loadingState === 'analyzing' || loadingState === 'selecting' || loadingState === 'checking'}
                >
                  <option value="startech">StarTech</option>
                  <option value="techland">Techland</option>
                  <option value="computermania">ComputerMania</option>
                  <option value="custom">Custom URL...</option>
                </select>
                
                {selectedSite === 'custom' && (
                  <input 
                    type="text" 
                    placeholder="Enter shop URL..." 
                    value={customSiteUrl}
                    onChange={(e) => setCustomSiteUrl(e.target.value)}
                    className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200 focus:outline-none focus:border-sky-500 w-48"
                  />
                )}
             </div>

             <div className="w-px h-6 bg-slate-700"></div>

             <div className="flex items-center gap-2">
               <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">AI:</span>
               <select 
                  value={selectedApi} 
                  onChange={(e) => setSelectedApi(e.target.value)}
                  className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200 focus:outline-none focus:border-sky-500 transition-all cursor-pointer"
                  disabled={loadingState === 'analyzing' || loadingState === 'selecting' || loadingState === 'checking'}
                >
                  <option value="groq">Groq (Llama 3)</option>
                  <option value="gemini">Gemini (2.5 Pro)</option>
                </select>
             </div>
             
             <div className="w-px h-6 bg-slate-700"></div>
             
             <button 
                onClick={() => setShowSettings(true)}
                className="p-1.5 text-slate-400 hover:text-sky-400 bg-slate-800 rounded transition-colors border border-slate-600/50 hover:border-sky-500/50"
                title="API Settings"
             >
                <Key size={18} />
             </button>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button onClick={handleDownloadPDF} className="btn-secondary px-3 py-1.5 rounded-md flex items-center gap-2 text-sm font-medium">
              <FileDown size={16} /> Print PDF
            </button>
            <button onClick={handleClear} className="btn-secondary px-3 py-1.5 rounded-md flex items-center gap-2 text-sm font-medium text-red-400 hover:text-red-300">
              <Trash2 size={16} /> Clear
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto mt-8 px-4" ref={builderRef}>
        
        <div className="glass-card rounded-xl p-6 mb-8">
          <div className="flex items-center justify-between border-b border-slate-700 pb-4 mb-6">
            <div>
              <h2 className="text-3xl font-bold mb-2">PC Builder - Build Your Own PC</h2>
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
            
            <div className="total-card text-left bg-slate-800 p-3 rounded-lg border border-slate-700 min-w-[200px]">
              <div className="text-slate-400 text-sm mb-1">Total ({Object.values(build).filter(Boolean).length} items)</div>
              <div className="text-3xl font-bold text-sky-400">{formatPrice(total)}</div>
            </div>
          </div>

          {errorMsg && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-3 text-red-400">
              <AlertCircle className="mt-0.5 flex-shrink-0" size={20} />
              <p>{errorMsg}</p>
            </div>
          )}

          <div className="mb-8">
            <div className="bg-slate-800 text-slate-300 font-semibold px-4 py-2 rounded-md mb-4 inline-block shadow-sm border border-slate-700">
              Core Components
            </div>
            {CORE_CATEGORIES.map(category => {
               const isRequired = ["Processor", "Motherboard", "RAM", "Storage", "PSU", "Casing"].includes(category);
               let dependencyStr = "";
               if (category === "Motherboard") dependencyStr = "Processor";
               if (category === "RAM") dependencyStr = "Motherboard";
               return renderComponentRow(category, isRequired, dependencyStr);
            })}
          </div>

          <div>
            <div className="bg-slate-800 text-slate-300 font-semibold px-4 py-2 rounded-md mb-4 inline-block shadow-sm border border-slate-700">
              Peripherals
            </div>
            {PERIPHERAL_CATEGORIES.map(category => renderComponentRow(category, false, ""))}
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
          </div>
        )}

      </main>

      {/* Fixed Chat Input */}
      <div className="fixed bottom-0 left-0 right-0 glass border-t border-slate-700/50 p-4 z-50 print:hidden">
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

          <form onSubmit={handleSubmit} className="flex gap-3 relative items-center">
            <textarea 
              className="flex-1 bg-slate-800/90 border border-slate-600 rounded-2xl px-6 py-4 text-white placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all text-lg resize-none overflow-y-auto min-h-[60px] max-h-[200px]"
              placeholder="Describe your build... e.g. I need a gaming PC under 60,000 BDT"
              value={chatInput}
              rows={1}
              onChange={(e) => {
                 setChatInput(e.target.value);
                 e.target.style.height = 'auto';
                 e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
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
            {loadingState === 'idle' || loadingState === 'success' || loadingState === 'error' ? (
              <button 
                type="submit" 
                className="btn-primary rounded-full w-14 h-14 flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/20"
                disabled={!chatInput.trim()}
              >
                <Send size={20} />
              </button>
            ) : (
              <button 
                type="button" 
                onClick={handleStop}
                className="bg-red-500 hover:bg-red-600 text-white rounded-full w-14 h-14 flex items-center justify-center flex-shrink-0 shadow-lg shadow-red-500/20 transition-all"
                title="Stop generation"
              >
                <div className="w-4 h-4 bg-white rounded-sm"></div>
              </button>
            )}
          </form>
        </div>
      </div>


      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="glass-card bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full shadow-2xl">
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

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-400 flex items-center justify-between">
                  Google Gemini API Key
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline text-xs font-normal">Get a key</a>
                </label>
                <input 
                  type="password"
                  placeholder="AIza..."
                  value={customGeminiKey}
                  onChange={(e) => setCustomGeminiKey(e.target.value)}
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