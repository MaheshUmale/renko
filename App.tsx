
import React, { useState, useMemo, useEffect, useRef } from 'react';
import ChartComponent from './components/ChartComponent';
import SettingsPanel from './components/SettingsPanel';
import DataImportModal from './components/DataImportModal';
import { generateMockData, calculateIndicators, calculateRenkoBricks, timeframeToSeconds, resampleTick, generateTradeSignals } from './services/indicators';
import { IndicatorSettings, OHLCV, Timeframe, Tick, TradeSignal } from './types';

const INITIAL_SETTINGS: IndicatorSettings = {
  timeframe: '1s',
  chartMode: 'CANDLE',
  renkoBoxSize: 10,
  showHeatmap: true,
  showEVWMA: true,
  showVWAP: true,
  showEMAs: true,
  showVolBubbles: true,
  showSRDots: true,
  showVolSR: true,
  showGodMode: true,
  isLiveFollow: true,
  heatmapIntensity: 1.5,
  evwmaLength: 14,
  dataSource: 'mock',
  wsUrl: 'ws://localhost:8080'
};

const App: React.FC = () => {
  const [data, setData] = useState<OHLCV[]>([]);
  const [settings, setSettings] = useState<IndicatorSettings>(INITIAL_SETTINGS);
  const [showImportModal, setShowImportModal] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(true);
  const [wsStatus, setWsStatus] = useState<'IDLE' | 'CONNECTING' | 'CONNECTED' | 'ERROR'>('IDLE');
  
  const wsRef = useRef<WebSocket | null>(null);

  // Initialize data based on source
  useEffect(() => {
    if (settings.dataSource === 'mock') {
      setData(generateMockData(2000, timeframeToSeconds(settings.timeframe)));
    }
  }, [settings.timeframe, settings.dataSource]);

  // Handle Mock Live Feed
  useEffect(() => {
    if (settings.dataSource !== 'mock') return;
    const interval = setInterval(() => {
      setData(prev => {
        if (!prev.length) return prev;
        const last = prev[prev.length - 1];
        const nextTime = last.time + timeframeToSeconds(settings.timeframe);
        const step = (Math.random() - 0.5) * 15;
        const tick: Tick = {
          timestamp: nextTime,
          ltp: last.close + step,
          ltq: Math.random() * 100 + (Math.random() > 0.95 ? 600 : 0)
        };
        return resampleTick(tick, prev, timeframeToSeconds(settings.timeframe));
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [settings.timeframe, settings.dataSource]);

  // Handle WebSocket Live Feed
  useEffect(() => {
    if (settings.dataSource !== 'ws') {
      if (wsRef.current) wsRef.current.close();
      setWsStatus('IDLE');
      return;
    }

    setWsStatus('CONNECTING');
    try {
      const ws = new WebSocket(settings.wsUrl);
      wsRef.current = ws;

      ws.onopen = () => setWsStatus('CONNECTED');
      ws.onmessage = (event) => {
        try {
          const tick: Tick = JSON.parse(event.data);
          if (tick.ltp !== undefined && tick.timestamp !== undefined) {
            setData(prev => resampleTick(tick, prev, timeframeToSeconds(settings.timeframe)));
          }
        } catch (e) {
          console.error("Invalid WS message format", e);
        }
      };
      ws.onerror = () => setWsStatus('ERROR');
      ws.onclose = () => setWsStatus('IDLE');

    } catch (e) {
      setWsStatus('ERROR');
    }

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [settings.dataSource, settings.wsUrl, settings.timeframe]);

  const loadMoreHistory = () => {
    if (!data.length) return;
    const firstCandle = data[0];
    const historical = generateMockData(500, timeframeToSeconds(settings.timeframe), firstCandle.open);
    const shift = (firstCandle.time - (historical[historical.length-1].time + timeframeToSeconds(settings.timeframe)));
    const alignedHistorical = historical.map(d => ({...d, time: d.time + shift}));
    setData(prev => [...alignedHistorical, ...prev]);
  };

  const { indicators, signals } = useMemo(() => {
    if (!data.length) return { indicators: [], signals: { signals: [], zones: [] } };
    // Process indicators
    const processed = settings.chartMode === 'RENKO' 
      ? calculateRenkoBricks(data, settings.renkoBoxSize) 
      : data;
    const inds = calculateIndicators(processed, settings);
    
    // Generate Signals based on OHLCV + Indicators
    // We pass the raw OHLCV for signal generation for accuracy even if Renko is displayed
    // but aligning indices might be tricky with Renko, so for now we generate signals on what is displayed.
    const sigs = generateTradeSignals(processed as OHLCV[], inds);
    
    return { indicators: inds, signals: sigs };
  }, [data, settings]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#080a0d] text-white font-sans selection:bg-blue-600/30">
      <header className="h-12 border-b border-white/5 flex items-center px-6 justify-between bg-[#0d1117] z-40 shadow-2xl">
        <div className="flex items-center gap-8">
           <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-blue-600 rounded-sm flex items-center justify-center font-black italic text-white shadow-2xl shadow-blue-600/40 cursor-pointer" onClick={() => setSettings(p => ({...p, isLiveFollow: !p.isLiveFollow}))}>G</div>
             <div className="flex flex-col">
               <h1 className="text-[11px] font-black tracking-tighter uppercase leading-none">GODMODE_FLOW</h1>
               <span className="text-[7px] text-blue-500 font-bold tracking-[0.3em] uppercase">Auto-Trader V1</span>
             </div>
           </div>
           <div className="flex items-center bg-black/40 rounded-sm border border-white/5 p-0.5">
             {(['1s', '1m', '5m', '15m', '1h'] as Timeframe[]).map(tf => (
               <button key={tf} onClick={() => setSettings(p => ({...p, timeframe: tf}))} className={`px-3 py-1 text-[9px] font-black rounded-sm transition-all ${settings.timeframe === tf ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-600 hover:text-gray-400'}`}>
                 {tf}
               </button>
             ))}
           </div>
        </div>
        <div className="flex items-center gap-4">
          {settings.dataSource === 'ws' && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-black/40 rounded border border-white/5">
              <div className={`w-2 h-2 rounded-full ${
                wsStatus === 'CONNECTED' ? 'bg-green-500 animate-pulse' : 
                wsStatus === 'CONNECTING' ? 'bg-yellow-500 animate-bounce' : 
                'bg-red-500'
              }`} />
              <span className="text-[9px] font-black uppercase text-gray-400">WS: {wsStatus}</span>
            </div>
          )}
          <button onClick={loadMoreHistory} className="px-3 py-1.5 bg-[#161b22] hover:bg-[#30363d] rounded-sm text-[9px] font-bold border border-white/10 transition-all uppercase tracking-widest text-gray-400">History+</button>
          <button onClick={() => setShowImportModal(true)} className="px-3 py-1.5 bg-[#161b22] hover:bg-[#30363d] rounded-sm text-[9px] font-bold border border-white/10 transition-all uppercase tracking-widest text-gray-400">Feed Manager</button>
          <button 
            onClick={() => setIsSettingsOpen(!isSettingsOpen)} 
            className={`px-3 py-1.5 rounded-sm text-[9px] font-bold border transition-all uppercase tracking-widest ${isSettingsOpen ? 'bg-blue-600/20 border-blue-500/50 text-blue-400' : 'bg-[#161b22] border-white/10 text-gray-400'}`}
          >
            {isSettingsOpen ? 'Close Settings' : 'Settings'}
          </button>
          <div className={`flex items-center gap-3 bg-black/40 px-4 py-1.5 rounded-sm border ${settings.isLiveFollow ? 'border-red-500/20' : 'border-blue-500/10'}`}>
              <div className="flex gap-1">
                 <div className={`w-1.5 h-1.5 rounded-full ${settings.isLiveFollow ? 'bg-red-500 animate-pulse' : 'bg-blue-500'}`}></div>
              </div>
              <span className={`text-[9px] font-black uppercase tracking-tighter ${settings.isLiveFollow ? 'text-red-500' : 'text-blue-500'}`}>
                {settings.isLiveFollow ? 'Live' : 'Paused'}
              </span>
           </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 min-w-0 bg-[#080a0d] relative">
          {data.length > 0 ? (
            <ChartComponent data={data} indicators={indicators} signals={signals} settings={settings} />
          ) : (
             <div className="w-full h-full flex flex-col items-center justify-center">
               <div className="w-12 h-12 border-2 border-blue-600/20 border-t-blue-600 rounded-full animate-spin"></div>
               <span className="mt-6 text-[10px] text-gray-600 font-black tracking-[0.4em] uppercase">Awaiting Feed Stream</span>
             </div>
          )}
          
          {!isSettingsOpen && (
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="absolute right-0 top-1/2 -translate-y-1/2 bg-[#0d1117] border-l border-y border-blue-500/30 p-2 rounded-l-md hover:bg-[#161b22] transition-colors shadow-2xl z-20 group"
            >
              <div className="text-[10px] font-black text-blue-500 vertical-text tracking-widest uppercase [writing-mode:vertical-rl] group-hover:text-blue-400">Open Settings</div>
            </button>
          )}
        </div>
        
        <div className={`transition-all duration-300 ease-in-out h-full overflow-hidden ${isSettingsOpen ? 'w-64 border-l border-[#30363d]' : 'w-0 border-l-0'}`}>
          <SettingsPanel settings={settings} setSettings={setSettings} isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        </div>
      </main>

      <footer className="h-6 border-t border-white/5 flex items-center px-6 justify-between bg-[#0d1117] text-[9px] text-gray-700 font-black uppercase tracking-[0.2em] z-40">
        <div className="flex gap-8">
           <span className="text-blue-900">V2025_ULTRA_RESAMPLE</span>
           <span>Bars: {data.length}</span>
           <span className="text-gray-800">Source: {settings.dataSource}</span>
        </div>
        <div className="opacity-60 font-mono tracking-tight">Real-time Tick Resampling Engine • {settings.timeframe} Grain</div>
      </footer>

      {showImportModal && <DataImportModal 
        settings={settings}
        setSettings={setSettings}
        onImport={d => { setSettings(s => ({...s, dataSource: 'custom'})); setData(d); }} 
        onClose={() => setShowImportModal(false)} 
      />}
    </div>
  );
};

export default App;
