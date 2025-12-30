
import React from 'react';
import { IndicatorSettings } from '../types';

interface SettingsPanelProps {
  settings: IndicatorSettings;
  setSettings: React.Dispatch<React.SetStateAction<IndicatorSettings>>;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ settings, setSettings }) => {
  const toggle = (key: keyof IndicatorSettings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const update = (key: keyof IndicatorSettings, val: any) => {
    setSettings(prev => ({ ...prev, [key]: val }));
  };

  return (
    <div className="w-64 bg-[#0d1117] border-l border-[#30363d] h-full overflow-y-auto p-5 flex flex-col gap-6 select-none shadow-2xl z-30">
      <div className="flex flex-col">
        <h2 className="text-[11px] font-black uppercase tracking-[0.3em] text-blue-500">Institutional Pro</h2>
        <div className="h-0.5 w-full bg-blue-900/30 mt-1 relative">
           <div className="absolute top-0 left-0 h-full w-12 bg-blue-600"></div>
        </div>
      </div>
      
      <section className="flex flex-col gap-3">
        <h3 className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">Feed Configuration</h3>
        <div className="grid grid-cols-2 gap-1 p-1 bg-black/60 rounded-sm border border-[#30363d]">
           {['CANDLE', 'RENKO'].map(m => (
             <button key={m} onClick={() => update('chartMode', m)} className={`py-1.5 text-[10px] font-black rounded-sm transition-all ${settings.chartMode === m ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-600 hover:text-gray-400'}`}>{m}</button>
           ))}
        </div>
        {settings.chartMode === 'RENKO' && (
          <RangeInput label="Brick Box Size" min={1} max={100} step={1} value={settings.renkoBoxSize} onChange={v => update('renkoBoxSize', v)} />
        )}
      </section>

      <section className="flex flex-col gap-3 border-t border-[#30363d] pt-4">
        <h3 className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">Auction Market Theory</h3>
        <ToggleItem label="Bookmap Heatmap" active={settings.showHeatmap} onClick={() => toggle('showHeatmap')} />
        <RangeInput label="Heatmap Gain" min={0} max={3} step={0.1} value={settings.heatmapIntensity} onChange={v => update('heatmapIntensity', v)} />
        <ToggleItem label="Trap Indicators" active={settings.showTraps} onClick={() => toggle('showTraps')} />
        <RangeInput label="Trap Trigger" min={1} max={5} step={0.1} value={settings.trapThreshold} onChange={v => update('trapThreshold', v)} />
        <ToggleItem label="Buy/Sell Delta Pane" active={settings.showBuySellVol} onClick={() => toggle('showBuySellVol')} />
      </section>

      <section className="flex flex-col gap-3 border-t border-[#30363d] pt-4">
        <h3 className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">SMC & Structure</h3>
        <ToggleItem label="Fair Value Gaps" active={settings.showFVG} onClick={() => toggle('showFVG')} />
        <ToggleItem label="Market Structure" active={settings.showMarketStructure} onClick={() => toggle('showMarketStructure')} />
      </section>

      <section className="flex flex-col gap-3 border-t border-[#30363d] pt-4">
        <h3 className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">Mean Reversion</h3>
        <ToggleItem label="eVWMA Trend" active={settings.showEVWMA} onClick={() => toggle('showEVWMA')} />
        <ToggleItem label="Dynamic Pivot" active={settings.showDynamicPivot} onClick={() => toggle('showDynamicPivot')} />
      </section>

      <div className="mt-auto pt-6 border-t border-[#30363d] flex flex-col gap-2">
        <div className="flex justify-between items-center text-[9px] font-bold text-gray-700 uppercase">
          <span>Build: V3.2_STABLE</span>
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-600"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
          </div>
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
