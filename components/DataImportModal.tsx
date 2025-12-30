
import React, { useState } from 'react';
import { OHLCV, Tick, IndicatorSettings } from '../types';
import { resampleTick, timeframeToSeconds } from '../services/indicators';

interface DataImportModalProps {
  settings: IndicatorSettings;
  setSettings: React.Dispatch<React.SetStateAction<IndicatorSettings>>;
  onImport: (data: OHLCV[]) => void;
  onClose: () => void;
}

const DataImportModal: React.FC<DataImportModalProps> = ({ settings, setSettings, onImport, onClose }) => {
  const [jsonInput, setJsonInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [importType, setImportType] = useState<'OHLCV' | 'TICK'>('OHLCV');

  const handleImport = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      if (!Array.isArray(parsed)) throw new Error("Data must be an array of objects");
      
      if (importType === 'OHLCV') {
        const isValid = parsed.every(item => 
          typeof item.time === 'number' &&
          typeof item.open === 'number' &&
          typeof item.high === 'number' &&
          typeof item.low === 'number' &&
          typeof item.close === 'number' &&
          typeof item.volume === 'number'
        );
        if (!isValid) throw new Error("Invalid OHLCV structure. Required: time, open, high, low, close, volume");
        onImport(parsed as OHLCV[]);
      } else {
        // Resample Tick Data
        const isValid = parsed.every(item => 
          typeof item.timestamp === 'number' &&
          typeof item.ltp === 'number' &&
          typeof item.ltq === 'number'
        );
        if (!isValid) throw new Error("Invalid Tick structure. Required: timestamp, ltp, ltq");
        
        let resampled: OHLCV[] = [];
        const sortedTicks = (parsed as Tick[]).sort((a, b) => a.timestamp - b.timestamp);
        sortedTicks.forEach(tick => {
          resampled = resampleTick(tick, resampled, timeframeToSeconds(settings.timeframe));
        });
        onImport(resampled);
      }
      onClose();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#161b22] border border-[#30363d] w-full max-w-2xl rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-[#30363d] flex justify-between items-center">
          <h2 className="text-lg font-bold">Feed Management</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
        </div>
        
        <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-6">
          <div className="flex gap-2 p-1 bg-black/40 rounded border border-white/5">
             <button 
               onClick={() => setImportType('OHLCV')}
               className={`flex-1 py-2 text-[10px] font-black rounded uppercase transition-all ${importType === 'OHLCV' ? 'bg-blue-600' : 'text-gray-500'}`}
             >
               OHLCV Array
             </button>
             <button 
               onClick={() => setImportType('TICK')}
               className={`flex-1 py-2 text-[10px] font-black rounded uppercase transition-all ${importType === 'TICK' ? 'bg-blue-600' : 'text-gray-500'}`}
             >
               Tick Feed (LTP/LTQ)
             </button>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
              {importType === 'OHLCV' ? 'OHLCV JSON Input' : 'Tick JSON Input (Resampled to ' + settings.timeframe + ')'}
            </span>
            <textarea
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder={importType === 'OHLCV' 
                ? '[{"time": 1625, "open": 50, "high": 55, "low": 48, "close": 52, "volume": 100}]' 
                : '[{"timestamp": 1625097600, "ltp": 50210.5, "ltq": 0.5}, ...]'
              }
              className="w-full h-64 bg-[#0d1117] border border-[#30363d] rounded-lg p-4 font-mono text-xs text-gray-300 focus:outline-none focus:border-blue-500"
            />
          </div>

          {error && <div className="text-red-500 text-xs font-bold bg-red-500/10 p-3 rounded border border-red-500/30">{error}</div>}

          <div className="bg-[#0d1117] p-4 rounded-lg">
             <span className="text-[10px] text-gray-500 uppercase font-bold mb-2 block">Live WS Info</span>
             <p className="text-[10px] text-gray-400 leading-relaxed">
               To feed via WebSocket, set the source to "WebSocket Feed" in settings and point to a server emitting JSON ticks.
               Expected: <code className="text-blue-400">{"{ \"timestamp\": ms, \"ltp\": price, \"ltq\": quantity }"}</code>
             </p>
          </div>
        </div>

        <div className="p-6 border-t border-[#30363d] flex justify-end gap-4">
          <button onClick={onClose} className="px-6 py-2 rounded-lg text-sm font-bold text-gray-400 hover:bg-gray-800 transition-colors">Cancel</button>
          <button onClick={handleImport} className="px-6 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-lg shadow-blue-600/20">
            Import & Resample
          </button>
        </div>
      </div>
    </div>
  );
};

export default DataImportModal;
