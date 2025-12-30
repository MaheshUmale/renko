
import React, { useState, useMemo, useEffect } from 'react';
import ChartComponent from './components/ChartComponent';
import SettingsPanel from './components/SettingsPanel';
import DataImportModal from './components/DataImportModal';
import { generateMockData, calculateIndicators, calculateRenkoBricks, timeframeToSeconds } from './services/indicators';
import { IndicatorSettings, OHLCV, Timeframe } from './types';

const INITIAL_SETTINGS: IndicatorSettings = {
  timeframe: '1s',
  chartMode: 'RENKO',
  renkoBoxSize: 10,
  showHeatmap: true,
  showTraps: true,
  showFVG: true,
  showMarketStructure: true,
  showEVWMA: true,
  showDynamicPivot: true,
  showBuySellVol: true,
  
  heatmapIntensity: 1.5,
  trapThreshold: 2.5,
  evwmaLength: 14,
  pivotPeriod: 30,
  buySellPeriod: 30,
};

const App: React.FC = () => {
  const [data, setData] = useState<OHLCV[]>([]);
  const [settings, setSettings] = useState<IndicatorSettings>(INITIAL_SETTINGS);
  const [dataSource, setDataSource] = useState<'mock' | 'custom'>('mock');
  const [showImportModal, setShowImportModal] = useState(false);

  useEffect(() => {
    if (dataSource === 'mock') {
      setData(generateMockData(800, timeframeToSeconds(settings.timeframe)));
    }
  }, [settings.timeframe, dataSource]);

  useEffect(() => {
    if (dataSource !== 'mock') return;
    // Sequential simulation: Update every second to mimic a real feed
    const interval = setInterval(() => {
      setData(prev => {
        if (!prev.length) return prev;
        const last = prev[prev.length - 1];
        const nextTime = last.time + timeframeToSeconds(settings.timeframe);
        
        // Dynamic step for 1s feed
        const step = (Math.random() - 0.5) * 15;
        const newCandle: OHLCV = {
          time: nextTime,
          open: last.close,
          close: last.close + step,
          high: Math.max(last.close, last.close + step) + Math.random() * 5,
          low: Math.min(last.close, last.close + step) - Math.random() * 5,
          volume: Math.random() * 100 + (Math.random() > 0.95 ? 600 : 0)
        };
        return [...prev.slice(1), newCandle];
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [settings.timeframe, dataSource]);

  const indicators = useMemo(() => {
    if (!data.length) return [];
    // Process core data based on mode
    const processed = settings.chartMode === 'RENKO' 
      ? calculateRenkoBricks(data, settings.renkoBoxSize) 
      : data;
    return calculateIndicators(processed, settings);
  }, [data, settings]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#080a0d] text-white font-sans selection:bg-blue-600/30">
      <header className="h-12 border-b border-white/5 flex items-center px-6 justify-between bg-[#0d1117] z-40 shadow-2xl">
        <div className="flex items-center gap-8">
           <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-blue-600 rounded-sm flex items-center justify-center font-black italic text-white shadow-2xl shadow-blue-600/40">V</div>
             <div className="flex flex-col">
               <h1 className="text-[11px] font-black tracking-tighter uppercase leading-none">VolWill_V3.2</h1>
               <span className="text-[7px] text-blue-500 font-bold tracking-[0.3em] uppercase">Auction Market Engine</span>
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
          <button onClick={() => setShowImportModal(true)} className="px-3 py-1.5 bg-[#161b22] hover:bg-[#30363d] rounded-sm text-[9px] font-bold border border-white/10 transition-all uppercase tracking-widest text-gray-400">Custom Feed</button>
          <div className="flex items-center gap-3 bg-black/40 px-4 py-1.5 rounded-sm border border-blue-500/10">
              <div className="flex gap-1">
                 <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                 <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
              </div>
              <span className="text-[9px] font-black text-blue-500 uppercase tracking-tighter">Live Stream Active</span>
           </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <div className="flex-1 min-w-0 bg-[#080a0d] relative">
          {data.length > 0 ? (
            <ChartComponent data={data} indicators={indicators} settings={settings} />
          ) : (
             <div className="w-full h-full flex flex-col items-center justify-center">
               <div className="w-12 h-12 border-2 border-blue-600/20 border-t-blue-600 rounded-full animate-spin"></div>
               <span className="mt-6 text-[10px] text-gray-600 font-black tracking-[0.4em] uppercase">Synthesizing Sequential Auction Feed</span>
             </div>
          )}
        </div>
        <SettingsPanel settings={settings} setSettings={setSettings} />
      </main>

      <footer className="h-6 border-t border-white/5 flex items-center px-6 justify-between bg-[#0d1117] text-[9px] text-gray-700 font-black uppercase tracking-[0.2em] z-40">
        <div className="flex gap-8">
           <span className="text-blue-900">V3.2_SEQUENTIAL_CORE</span>
           <span className="flex items-center gap-2">
             <span className="w-2 h-2 rounded-full bg-green-900"></span>
             Status: Synced
           </span>
        </div>
        <div className="opacity-60">Order Flow & Liquidity Heatmap Analytics Suite</div>
      </footer>

      {showImportModal && <DataImportModal onImport={d => { setDataSource('custom'); setData(d); }} onClose={() => setShowImportModal(false)} />}
    </div>
  );
};

export default App;
