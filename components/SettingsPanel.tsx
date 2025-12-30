
import React from 'react';
import { IndicatorSettings } from '../types';

interface SettingsPanelProps {
  settings: IndicatorSettings;
  setSettings: React.Dispatch<React.SetStateAction<IndicatorSettings>>;
  isOpen: boolean;
  onClose: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, setSettings, isOpen, onClose }) => {
  const toggle = (key: keyof IndicatorSettings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const update = (key: keyof IndicatorSettings, val: any) => {
    setSettings(prev => ({ ...prev, [key]: val }));
  };

  if (!isOpen) return null;

  return (
    <div className="w-64 bg-[#0d1117] h-full overflow-y-auto p-5 flex flex-col gap-6 select-none shadow-2xl z-30 relative">
      <div className="flex justify-between items-start">
        <div className="flex flex-col">
          <h2 className="text-[11px] font-black uppercase tracking-[0.3em] text-blue-500">VolWill Suite</h2>
          <div className="h-0.5 w-full bg-blue-900/30 mt-1 relative">
             <div className="absolute top-0 left-0 h-full w-12 bg-blue-600"></div>
          </div>
        </div>
        <button 
          onClick={onClose} 
          className="text-gray-600 hover:text-red-500 transition-colors"
          title="Minimize Panel"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <section className="flex flex-col gap-3">
        <h3 className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">Feed Control</h3>
        <div className="flex flex-col gap-2 p-2 bg-black/40 border border-white/5 rounded">
           <span className="text-[8px] font-bold text-gray-500 uppercase">Data Source</span>
           <select 
             value={settings.dataSource} 
             onChange={(e) => update('dataSource', e.target.value)}
             className="bg-[#0d1117] border border-[#30363d] text-[10px] text-white py-1 rounded focus:outline-none cursor-pointer"
           >
             <option value="mock">Simulated (Resampling)</option>
             <option value="ws">WebSocket Feed</option>
             <option value="custom">Imported Static</option>
           </select>
           
           {settings.dataSource === 'ws' && (
             <div className="flex flex-col gap-1 mt-1">
               <input 
                 type="text" 
                 value={settings.wsUrl} 
                 onChange={(e) => update('wsUrl', e.target.value)}
                 className="bg-[#0d1117] border border-[#30363d] text-[10px] text-white p-1 rounded font-mono"
                 placeholder="ws://url:port"
               />
               <button 
                 onClick={() => update('wsUrl', settings.wsUrl)} // Triggers useEffect in App
                 className="bg-blue-600 hover:bg-blue-500 text-white text-[9px] font-bold py-1 rounded transition-colors shadow-lg shadow-blue-600/20"
               >
                 Reconnect
               </button>
             </div>
           )}
        </div>

        <ToggleItem label="Live Follow" active={settings.isLiveFollow} onClick={() => toggle('isLiveFollow')} />
        <div className="grid grid-cols-2 gap-1 p-1 bg-black/60 rounded-sm border border-[#30363d]">
           {['CANDLE', 'RENKO'].map(m => (
             <button key={m} onClick={() => update('chartMode', m)} className={`py-1.5 text-[10px] font-black rounded-sm transition-all ${settings.chartMode === m ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-600 hover:text-gray-400'}`}>{m}</button>
           ))}
        </div>
        {settings.chartMode === 'RENKO' && (
          <RangeInput label="Brick Size" min={1} max={100} step={1} value={settings.renkoBoxSize} onChange={v => update('renkoBoxSize', v)} />
        )}
      </section>

      <section className="flex flex-col gap-3 border-t border-[#30363d] pt-4">
        <h3 className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">Overlays</h3>
        <ToggleItem label="Volume Heatmap" active={settings.showHeatmap} onClick={() => toggle('showHeatmap')} />
        <ToggleItem label="Volume Bubbles" active={settings.showVolBubbles} onClick={() => toggle('showVolBubbles')} />
        <ToggleItem label="S/R Dots (🔵🟠)" active={settings.showSRDots} onClick={() => toggle('showSRDots')} />
        <ToggleItem label="Supply/Demand Zones" active={settings.showVolSR} onClick={() => toggle('showVolSR')} />
      </section>

      <section className="flex flex-col gap-3 border-t border-[#30363d] pt-4">
        <h3 className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">Indicators</h3>
        <ToggleItem label="eVWMA" active={settings.showEVWMA} onClick={() => toggle('showEVWMA')} />
        <ToggleItem label="VWAP" active={settings.showVWAP} onClick={() => toggle('showVWAP')} />
        <ToggleItem label="EMA Suite (9/20/200)" active={settings.showEMAs} onClick={() => toggle('showEMAs')} />
      </section>

      <div className="mt-auto pt-6 border-t border-[#30363d]">
        <div className="flex justify-between items-center text-[9px] font-bold text-gray-700 uppercase">
          <span>Build: V2025.HFT</span>
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
        </div>
      </div>
    </div>
  );
};

const ToggleItem: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => (
  <button onClick={onClick} className="flex items-center justify-between text-[11px] text-gray-400 hover:text-white transition-all py-1.5 group">
    <span className="group-hover:translate-x-1 transition-transform">{label}</span>
    <div className={`w-8 h-4 rounded-full relative transition-colors ${active ? 'bg-blue-600' : 'bg-[#30363d]'}`}>
      <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all shadow-md ${active ? 'left-4.5' : 'left-0.5'}`} />
    </div>
  </button>
);

const RangeInput: React.FC<{ label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }> = ({ label, min, max, step, value, onChange }) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex justify-between text-[10px] font-bold text-gray-500 uppercase tracking-tight">
      <span>{label}</span>
      <span className="text-blue-500 font-mono">{value}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} className="w-full h-1 bg-[#30363d] rounded-lg appearance-none cursor-pointer accent-blue-600" />
  </div>
);

export default SettingsPanel;
