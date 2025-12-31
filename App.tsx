import React, { useState, useMemo, useEffect, useRef } from 'react';
import ChartComponent from './components/ChartComponent';
import SettingsPanel from './components/SettingsPanel';
import DataImportModal from './components/DataImportModal';
import { generateMockData, calculateIndicators, calculateRenkoBricks, timeframeToSeconds, resampleTick, generateTradeSignals, aggregateCandles } from './services/indicators';
import { decodeUpstoxMessage } from './services/upstox';
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
  wsUrl: 'ws://localhost:8080',
  upstoxAccessToken: 'eyJ0eXAiOiJKV1QiLCJrZXlfaWQiOiJza192MS4wIiwiYWxnIjoiSFMyNTYifQ.eyJzdWIiOiI3NkFGMzUiLCJqdGkiOiI2OTU0YTc0MjQ2NmZiMjEyODM2NjM2ODAiLCJpc011bHRpQ2xpZW50IjpmYWxzZSwiaXNQbHVzUGxhbiI6ZmFsc2UsImlhdCI6MTc2NzE1NTUyMiwiaXNzIjoidWRhcGktZ2F0ZXdheS1zZXJ2aWNlIiwiZXhwIjoxNzY3MjE4NDAwfQ.16xcu45V5ZPug7u6oKGeBZluYU7GEvVYqVCx9biobac',
  upstoxInstrumentKey: 'NSE_FO|49229'
};

const App: React.FC = () => {
  const [data, setData] = useState<OHLCV[]>([]);
  const [settings, setSettings] = useState<IndicatorSettings>(INITIAL_SETTINGS);
  const [showImportModal, setShowImportModal] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(true);
  const [wsStatus, setWsStatus] = useState<'IDLE' | 'CONNECTING' | 'CONNECTED' | 'ERROR'>('IDLE');
  
  // Base Store: Holds 1s resolution data to allow resampling without data loss
  const baseDataRef = useRef<OHLCV[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // 1. Data Source Initialization (Only runs on Source change, NOT timeframe change)
  useEffect(() => {
    // Reset Data Stores
    baseDataRef.current = [];
    setData([]);

    if (settings.dataSource === 'mock') {
      // Generate high-res (1s) mock data
      const mock1s = generateMockData(5000, 1);
      baseDataRef.current = mock1s;
      // Initial Aggregation to current timeframe
      const aggregated = aggregateCandles(mock1s, timeframeToSeconds(settings.timeframe));
      setData(aggregated);
    } 
    // For 'upstox' or 'ws', we start empty and wait for connection
  }, [settings.dataSource]);

  // 2. Timeframe Change Handler (Re-aggregates existing history)
  useEffect(() => {
    if (baseDataRef.current.length > 0) {
      console.log(`Re-aggregating ${baseDataRef.current.length} base candles to ${settings.timeframe}`);
      const aggregated = aggregateCandles(baseDataRef.current, timeframeToSeconds(settings.timeframe));
      setData(aggregated);
    }
  }, [settings.timeframe]);

  // 3. Mock Live Feed Simulation
  useEffect(() => {
    if (settings.dataSource !== 'mock') return;
    const interval = setInterval(() => {
      const lastBase = baseDataRef.current[baseDataRef.current.length - 1];
      if (!lastBase) return;

      const nextTime = lastBase.time + 1; // Always 1s increment for base
      const step = (Math.random() - 0.5) * 5;
      const tick: Tick = {
        timestamp: nextTime,
        ltp: lastBase.close + step,
        ltq: Math.random() * 50
      };

      // 1. Update Base Store (1s)
      baseDataRef.current = resampleTick(tick, baseDataRef.current, 1);
      
      // 2. Update View Store (Current Timeframe)
      setData(prev => resampleTick(tick, prev, timeframeToSeconds(settings.timeframe)));
    }, 1000);
    return () => clearInterval(interval);
  }, [settings.dataSource, settings.timeframe]); // Added timeframe to dep to ensure resample uses correct TF

  // 4. WebSocket Feed Logic (Generic)
  useEffect(() => {
    if (settings.dataSource !== 'ws') return;
    if (wsRef.current) wsRef.current.close();
    setWsStatus('CONNECTING');
    
    try {
      const ws = new WebSocket(settings.wsUrl);
      wsRef.current = ws;
      ws.onopen = () => setWsStatus('CONNECTED');
      ws.onmessage = (event) => {
        try {
          const tick: Tick = JSON.parse(event.data);
          if (tick.ltp !== undefined && tick.timestamp !== undefined) {
             // Update Base & View
             baseDataRef.current = resampleTick(tick, baseDataRef.current, 1);
             setData(prev => resampleTick(tick, prev, timeframeToSeconds(settings.timeframe)));
          }
        } catch (e) { console.error("Invalid WS message", e); }
      };
      ws.onerror = () => setWsStatus('ERROR');
      ws.onclose = () => setWsStatus('IDLE');
    } catch (e) { setWsStatus('ERROR'); }
    return () => { if (wsRef.current) wsRef.current.close(); };
  }, [settings.dataSource, settings.wsUrl, settings.timeframe]);

  // 5. UPSTOX Feed Logic
  useEffect(() => {
    if (settings.dataSource !== 'upstox') return;
    if (!settings.upstoxAccessToken || !settings.upstoxInstrumentKey) {
      console.warn("Upstox Config Missing"); setWsStatus('IDLE'); return;
    }
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    setWsStatus('CONNECTING');

    const connectUpstox = async () => {
      try {
        const authResponse = await fetch('https://api.upstox.com/v3/feed/market-data-feed/authorize', {
          headers: { 'Authorization': `Bearer ${settings.upstoxAccessToken}`, 'Accept': 'application/json' }
        });
        const authJson = await authResponse.json();
        if (authJson.status !== 'success' || !authJson.data?.authorizedRedirectUri) {
          setWsStatus('ERROR'); return;
        }

        const ws = new WebSocket(authJson.data.authorizedRedirectUri);
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        ws.onopen = () => {
          setWsStatus('CONNECTED');
          const payload = { guid: "guid-" + Date.now(), method: "sub", data: { mode: "full", instrumentKeys: [settings.upstoxInstrumentKey] } };
          ws.send(new TextEncoder().encode(JSON.stringify(payload))); 
        };

        ws.onmessage = async (event) => {
          let arrayBuffer: ArrayBuffer;
          if (event.data instanceof Blob) arrayBuffer = await event.data.arrayBuffer();
          else if (event.data instanceof ArrayBuffer) arrayBuffer = event.data;
          else return;

          const uint8View = new Uint8Array(arrayBuffer);
          if (uint8View.length === 0 || (uint8View[0] !== 8 && uint8View[0] !== 18)) return;

          const decoded = decodeUpstoxMessage(arrayBuffer);
          if (decoded && decoded.feeds) {
             const targetKey = Object.keys(decoded.feeds).find(k => k === settings.upstoxInstrumentKey) || Object.keys(decoded.feeds)[0];
             const feed = decoded.feeds[targetKey];
             if (feed) {
                const fullFeed = feed.fullFeed;
                const ltpc = feed.ltpc || fullFeed?.marketFF?.ltpc || fullFeed?.indexFF?.ltpc;
                if (ltpc) {
                    const tick: Tick = {
                      timestamp: ltpc.ltt ? Number(ltpc.ltt) / 1000 : Date.now() / 1000,
                      ltp: Number(ltpc.ltp),
                      ltq: Number(ltpc.ltq || 0)
                    };
                    
                    // Update Base Ref (History @ 1s)
                    baseDataRef.current = resampleTick(tick, baseDataRef.current, 1);
                    
                    // Update View State (Current TF)
                    setData(prev => resampleTick(tick, prev, timeframeToSeconds(settings.timeframe)));
                }
             }
          }
        };
        ws.onerror = () => setWsStatus('ERROR');
        ws.onclose = () => setWsStatus('IDLE');
      } catch (err) { setWsStatus('ERROR'); }
    };
    connectUpstox();
    return () => { if (wsRef.current) wsRef.current.close(); };
  }, [settings.dataSource, settings.upstoxAccessToken, settings.upstoxInstrumentKey, settings.timeframe]);

  const loadMoreHistory = () => {
    if (!data.length) return;
    const firstTime = data[0].time;
    // Generate historic data at 1s resolution
    const history1s = generateMockData(1000, 1, data[0].open);
    // Adjust time to be before current data
    const shift = firstTime - (history1s[history1s.length-1].time + 1);
    const alignedHistory1s = history1s.map(d => ({...d, time: d.time + shift}));
    
    // Prepend to base store
    baseDataRef.current = [...alignedHistory1s, ...baseDataRef.current];
    
    // Aggregates for view
    const aggregatedHistory = aggregateCandles(alignedHistory1s, timeframeToSeconds(settings.timeframe));
    setData(prev => [...aggregatedHistory, ...prev]);
  };

  // Centralized Data Processing (CANDLE vs RENKO)
  const { processedData, indicators, signals } = useMemo(() => {
    if (!data.length) return { processedData: [], indicators: [], signals: { signals: [], zones: [] } };
    
    // Calculate Renko or use Candles
    const processed = settings.chartMode === 'RENKO' 
      ? calculateRenkoBricks(data, settings.renkoBoxSize) 
      : data;
      
    const inds = calculateIndicators(processed, settings);
    const sigs = generateTradeSignals(processed as OHLCV[], inds);
    
    return { processedData: processed, indicators: inds, signals: sigs };
  }, [data, settings.chartMode, settings.renkoBoxSize, settings.heatmapIntensity, settings.evwmaLength, settings.showHeatmap, settings.showEVWMA, settings.showVWAP, settings.showEMAs, settings.showVolBubbles, settings.showSRDots, settings.showVolSR, settings.showGodMode]);

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
          {(settings.dataSource === 'ws' || settings.dataSource === 'upstox') && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-black/40 rounded border border-white/5">
              <div className={`w-2 h-2 rounded-full ${
                wsStatus === 'CONNECTED' ? 'bg-green-500 animate-pulse' : 
                wsStatus === 'CONNECTING' ? 'bg-yellow-500 animate-bounce' : 
                'bg-red-500'
              }`} />
              <span className="text-[9px] font-black uppercase text-gray-400">
                {settings.dataSource === 'upstox' ? 'UPSTOX' : 'WS'}: {wsStatus}
              </span>
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
          {processedData.length > 0 ? (
            <ChartComponent 
               processedData={processedData} // Pass pre-calculated data (Candles or Bricks)
               indicators={indicators} 
               signals={signals} 
               settings={settings} 
            />
          ) : (
             <div className="w-full h-full flex flex-col items-center justify-center">
               {wsStatus === 'CONNECTING' ? (
                 <div className="flex flex-col items-center">
                   <div className="w-12 h-12 border-2 border-yellow-600/20 border-t-yellow-500 rounded-full animate-spin"></div>
                   <span className="mt-6 text-[10px] text-yellow-500 font-black tracking-[0.4em] uppercase">Connecting to Feed</span>
                 </div>
               ) : wsStatus === 'ERROR' ? (
                 <div className="flex flex-col items-center">
                   <span className="text-4xl">⚠️</span>
                   <span className="mt-4 text-[10px] text-red-500 font-black tracking-[0.2em] uppercase">Connection Failed</span>
                   <span className="text-[9px] text-gray-500 mt-2">Check Console for Auth Details</span>
                 </div>
               ) : (
                 <div className="flex flex-col items-center">
                   <div className="w-12 h-12 border-2 border-blue-600/20 border-t-blue-600 rounded-full animate-spin"></div>
                   <span className="mt-6 text-[10px] text-gray-600 font-black tracking-[0.4em] uppercase">Awaiting Feed Stream</span>
                 </div>
               )}
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
           <span className="text-blue-900">V2025_ULTRA_PERSIST</span>
           <span>Bars: {data.length} ({baseDataRef.current.length} buffer)</span>
           <span className="text-gray-800">Source: {settings.dataSource}</span>
           {settings.dataSource === 'upstox' && <span className="text-yellow-900/50">{settings.upstoxInstrumentKey}</span>}
        </div>
        <div className="opacity-60 font-mono tracking-tight">Real-time Tick Resampling Engine • {settings.timeframe} Grain</div>
      </footer>

      {showImportModal && <DataImportModal 
        settings={settings}
        setSettings={setSettings}
        onImport={d => { 
           setSettings(s => ({...s, dataSource: 'custom'})); 
           baseDataRef.current = d; 
           setData(d); 
        }} 
        onClose={() => setShowImportModal(false)} 
      />}
    </div>
  );
};

export default App;