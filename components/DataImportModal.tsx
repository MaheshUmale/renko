
import React, { useState } from 'react';
import { OHLCV } from '../types';

interface DataImportModalProps {
  onImport: (data: OHLCV[]) => void;
  onClose: () => void;
}

const DataImportModal: React.FC<DataImportModalProps> = ({ onImport, onClose }) => {
  const [jsonInput, setJsonInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleImport = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      if (!Array.isArray(parsed)) throw new Error("Data must be an array of OHLCV objects");
      
      // Basic validation
      const isValid = parsed.every(item => 
        typeof item.time === 'number' &&
        typeof item.open === 'number' &&
        typeof item.high === 'number' &&
        typeof item.low === 'number' &&
        typeof item.close === 'number' &&
        typeof item.volume === 'number'
      );

      if (!isValid) throw new Error("Invalid OHLCV object structure detected");

      onImport(parsed as OHLCV[]);
      onClose();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const sampleJson = JSON.stringify([
    { "time": Math.floor(Date.now()/1000), "open": 50000, "high": 50100, "low": 49950, "close": 50050, "volume": 1200 }
  ], null, 2);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#161b22] border border-[#30363d] w-full max-w-2xl rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-[#30363d] flex justify-between items-center">
          <h2 className="text-lg font-bold">Import Custom Feed</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
        </div>
        
        <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-4">
          <p className="text-sm text-gray-400">
            Paste your OHLCV data as a JSON array. Each object must contain: 
            <code className="bg-[#0d1117] px-1 rounded mx-1 text-blue-400">time, open, high, low, close, volume</code>.
          </p>

          <textarea
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder={`[\n  {\n    "time": 1625097600,\n    "open": 34500,\n    "high": 35000,\n    "low": 34000,\n    "close": 34800,\n    "volume": 1500\n  }\n]`}
            className="w-full h-64 bg-[#0d1117] border border-[#30363d] rounded-lg p-4 font-mono text-sm text-gray-300 focus:outline-none focus:border-blue-500"
          />

          {error && <div className="text-red-500 text-xs font-bold bg-red-500/10 p-3 rounded border border-red-500/30">{error}</div>}

          <div className="bg-[#0d1117] p-4 rounded-lg">
             <span className="text-[10px] text-gray-500 uppercase font-bold mb-2 block">Example Format</span>
             <pre className="text-[10px] text-gray-400 overflow-x-auto">{sampleJson}</pre>
          </div>
        </div>

        <div className="p-6 border-t border-[#30363d] flex justify-end gap-4">
          <button 
            onClick={onClose}
            className="px-6 py-2 rounded-lg text-sm font-bold text-gray-400 hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleImport}
            className="px-6 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-lg shadow-blue-600/20"
          >
            Import Data
          </button>
        </div>
      </div>
    </div>
  );
};

export default DataImportModal;
