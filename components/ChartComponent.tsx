
import React, { useMemo, useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import { OHLCV, IndicatorOutput, IndicatorSettings, RenkoBrick, TradeSignal, ChartZone, AIAnalysis } from '../types';
import { getVolumeProfile, calculateRenkoBricks } from '../services/indicators';
import { analyzeTradeSetup } from '../services/ai';

interface ChartProps {
  data: OHLCV[];
  indicators: IndicatorOutput[];
  signals: { signals: TradeSignal[], zones: ChartZone[] };
  settings: IndicatorSettings;
}

const ChartComponent: React.FC<ChartProps> = ({ data, indicators, signals: { signals, zones }, settings }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // AI State
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const processedData = useMemo(() => {
    return settings.chartMode === 'RENKO' 
      ? calculateRenkoBricks(data, settings.renkoBoxSize) 
      : data;
  }, [data, settings.renkoBoxSize, settings.chartMode]);

  useEffect(() => {
    const target = containerRef.current;
    if (!target) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(target);
    return () => observer.unobserve(target);
  }, []);

  useEffect(() => {
    if (dimensions.width === 0 || dimensions.height === 0 || !processedData.length) return;

    // INCREASED RIGHT MARGIN TO 280px TO FIT THE PANEL
    const margin = { top: 30, right: 280, bottom: 20, left: 10 };
    const volHeight = 100;
    const spacing = 40;
    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom - volHeight - spacing;
    const PADDING_CANDLES = 10; 

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', dimensions.width).attr('height', dimensions.height).style('background', '#080a0d');

    // X Scale
    const x = d3.scaleLinear().domain([0, processedData.length + PADDING_CANDLES]).range([0, width]);
    
    // Y Scale (Initial, will be updated dynamically)
    const y = d3.scaleLinear().range([height, 0]);

    const deltas = indicators.map(i => i.delta);
    const maxDelta = d3.max(deltas, d => Math.abs(d)) || 1;
    const yV = d3.scaleLinear().domain([-maxDelta, maxDelta]).range([volHeight, 0]);

    // Layers
    const chart = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    const volumePane = svg.append('g').attr('transform', `translate(${margin.left},${margin.top + height + spacing})`);

    const chartAxisG = chart.append('g').attr('class', 'y-axis').attr('transform', `translate(${width}, 0)`).attr('color', '#30363d');
    const volAxisG = volumePane.append('g').attr('class', 'y-axis').attr('transform', `translate(${width}, 0)`).attr('color', '#30363d');

    // --- DRAWING GROUPS ---

    // 1. Heatmap
    const heatmapG = chart.append('g').attr('class', 'heatmap');
    if (settings.showHeatmap) {
      const profile = getVolumeProfile(processedData, 100);
      const bH = Math.max(1, height / profile.buckets.length);
      // We bind data but don't set Y yet, will do in updateView
      heatmapG.selectAll('.heatmap-row').data(profile.buckets).enter().append('rect')
        .attr('class', 'heatmap-row')
        .attr('x', 0)
        .attr('width', width)
        .attr('height', bH)
        .attr('fill', d => d.intensity > 0.85 ? '#00f2ff' : '#1a1d26')
        .attr('opacity', d => d.intensity * 0.3 * settings.heatmapIntensity);
    }

    // 2. Zone Rectangles (Memory of S/R)
    const activeZonesG = chart.append('g').attr('class', 'zones');
    activeZonesG.selectAll('.zone-rect')
      .data(zones)
      .enter().append('rect')
      .attr('class', 'zone-rect')
      .attr('fill', d => d.type === 'SUPPORT' ? '#10b981' : '#ef4444')
      .attr('opacity', 0.15)
      .attr('rx', 2);

    // 3. Candles
    const candleG = chart.append('g').attr('class', 'candles');
    const candleData = processedData.map((d, i) => ({ ...d, index: i }));
    const candles = candleG.selectAll('.candle-group').data(candleData).enter().append('g');
    candles.append('line').attr('class', 'wick').attr('stroke', (d, i) => indicators[i]?.candleColor).attr('stroke-width', 1);
    candles.append('rect').attr('class', 'candle').attr('fill', (d, i) => indicators[i]?.candleColor);

    // 4. Indicators (Lines)
    const lineG = chart.append('g').attr('class', 'lines');
    
    // Helper to init lines (rendering happens in updateView)
    const initLine = (dataName: string, color: string, w: number, opacity: number = 0.6) => {
      lineG.append('path')
        .attr('class', `indicator-line ${dataName}`)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', w)
        .attr('opacity', opacity);
    };

    if (settings.showEVWMA) initLine('evwma', '#4cc9f0', 2);
    if (settings.showVWAP) initLine('vwap', '#ff9800', 1.5, 0.8);
    if (settings.showEMAs) {
       initLine('ema9', '#ff0404', 1);
       initLine('ema20', '#0952fa', 1);
       initLine('ema200', '#ffffff', 1, 0.3);
    }

    // 5. Overlays (Dots)
    const overlayG = chart.append('g').attr('class', 'overlays');
    if (settings.showSRDots) {
      const dotsData = indicators.map((d, i) => ({ ...d, index: i })).filter(d => d.srDots?.s || d.srDots?.r);
      overlayG.selectAll('.sr-dot').data(dotsData).enter().append('circle')
        .attr('class', 'sr-dot')
        .attr('r', 3)
        .attr('fill', d => d.srDots.s ? '#10b981' : '#ef4444') 
        .attr('stroke', '#fff')
        .attr('stroke-width', 0.5);
    }

    // 6. Signals & Trades
    const tradeG = chart.append('g').attr('class', 'trades');
    tradeG.selectAll('.trade-tp-line').data(signals).enter().append('line')
      .attr('class', 'trade-tp-line')
      .attr('stroke', '#10b981')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '4,2')
      .attr('opacity', 0.8);

    tradeG.selectAll('.trade-sl-path').data(signals).enter().append('path')
      .attr('class', 'trade-sl-path')
      .attr('fill', 'none')
      .attr('stroke', '#ef4444')
      .attr('stroke-width', 2)
      .attr('stroke-linejoin', 'step');

    const markers = tradeG.selectAll('.trade-marker-group').data(signals).enter().append('g').attr('class', 'trade-marker-group');
    markers.append('path')
      .attr('d', d3.symbol().type(d3.symbolTriangle).size(200))
      .attr('fill', d => d.type === 'LONG' ? '#00f2ff' : '#ff00ff')
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);
    markers.append('text')
      .attr('text-anchor', 'middle')
      .attr('y', d => d.type === 'LONG' ? 30 : -25)
      .attr('fill', d => d.type === 'LONG' ? '#00f2ff' : '#ff00ff')
      .attr('font-size', '10px')
      .attr('font-weight', 'bold')
      .style('text-shadow', '0 2px 4px rgba(0,0,0,0.8)')
      .text(d => `${d.type} @ ${d.entryPrice.toFixed(2)}`);


    // Volume Panel
    volumePane.append('line').attr('x1', 0).attr('x2', width).attr('y1', yV(0)).attr('y2', yV(0)).attr('stroke', '#30363d');
    volumePane.selectAll('.vol-bar').data(indicators.map((d, i) => ({...d, index: i}))).enter().append('rect')
      .attr('class', 'vol-bar')
      .attr('y', d => d.delta > 0 ? yV(d.delta) : yV(0))
      .attr('height', d => Math.abs(yV(d.delta) - yV(0)))
      .attr('fill', d => d.delta > 0 ? '#10b981' : '#ef4444')
      .attr('opacity', 0.6);


    // --- ZOOM & UPDATE ---
    const updateView = (transform: d3.ZoomTransform) => {
      const nX = transform.rescaleX(x);
      
      // AUTO-SCALE Y AXIS LOGIC
      // 1. Get visible domain indices
      const [xMin, xMax] = nX.domain();
      const startIdx = Math.max(0, Math.floor(xMin));
      const endIdx = Math.min(processedData.length, Math.ceil(xMax));
      
      // 2. Slice data to get currently visible candles
      const visibleData = processedData.slice(startIdx, endIdx);

      // 3. Calculate Min/Max Low/High of VISIBLE candles only (ignoring indicators)
      if (visibleData.length > 0) {
        const vLow = d3.min(visibleData, d => d.low) || 0;
        const vHigh = d3.max(visibleData, d => d.high) || 0;
        const vRange = vHigh - vLow;
        const vPadding = vRange * 0.15; // 15% buffer top/bottom

        // Update Y domain dynamically
        y.domain([vLow - vPadding, vHigh + vPadding]);
      }

      // --- REDRAW ELEMENTS WITH NEW Y ---

      const domainSize = processedData.length + PADDING_CANDLES;
      const cW = (width / domainSize) * transform.k * 0.8;

      // Update Heatmap Y
      if (settings.showHeatmap) {
          heatmapG.selectAll('.heatmap-row').attr('y', (d: any) => y(d.price) - 2); 
      }

      // Update Candles
      candleG.selectAll('.candle')
        .attr('x', (d: any) => nX(d.index) - cW/2)
        .attr('width', Math.max(1, cW))
        .attr('y', (d: any) => y(Math.max(d.open, d.close)))
        .attr('height', (d: any) => Math.max(1, Math.abs(y(d.open) - y(d.close))));
      
      candleG.selectAll('.wick')
        .attr('x1', (d: any) => nX(d.index))
        .attr('x2', (d: any) => nX(d.index))
        .attr('y1', (d: any) => y(d.high))
        .attr('y2', (d: any) => y(d.low));

      // Update Lines
      const updateLine = (selector: string, key: keyof IndicatorOutput) => {
        lineG.select(selector).datum(indicators.map(i => ({val: i[key]}))).attr('d', d3.line<any>().defined(p => p.val !== undefined).x((p, i) => nX(i)).y(p => y(p.val)));
      };

      if (settings.showEVWMA) updateLine('.evwma', 'evwma');
      if (settings.showVWAP) updateLine('.vwap', 'vwap');
      if (settings.showEMAs) {
         updateLine('.ema9', 'ema9');
         updateLine('.ema20', 'ema20');
         updateLine('.ema200', 'ema200');
      }

      // Update Zones
      activeZonesG.selectAll('.zone-rect')
        .attr('x', (d: any) => nX(d.startIndex))
        .attr('y', (d: any) => y(d.price) - 10) 
        .attr('width', (d: any) => {
           const endX = d.endIndex ? nX(d.endIndex) : nX(processedData.length - 1);
           return Math.max(0, endX - nX(d.startIndex));
        })
        .attr('height', 20); 

      // Update Overlays
      overlayG.selectAll('.sr-dot')
        .attr('cx', (d: any) => nX(d.index))
        .attr('cy', (d: any) => d.srDots.s ? y(d.srDots.s) : y(d.srDots.r));

      // Update Trades
      tradeG.selectAll('.trade-tp-line')
        .attr('x1', (d: any) => nX(d.index))
        .attr('x2', (d: any) => nX(d.exitIndex || processedData.length - 1))
        .attr('y1', (d: any) => y(d.takeProfit))
        .attr('y2', (d: any) => y(d.takeProfit));

      tradeG.selectAll('.trade-sl-path').attr('d', (d: any) => {
        const path = d3.path();
        if (d.slHistory.length > 0) {
          path.moveTo(nX(d.slHistory[0].index), y(d.slHistory[0].price));
          d.slHistory.forEach((p: any) => {
             path.lineTo(nX(p.index), y(p.price));
          });
          if (!d.exitIndex) {
            path.lineTo(nX(processedData.length - 1), y(d.slHistory[d.slHistory.length-1].price));
          } else {
             path.lineTo(nX(d.exitIndex), y(d.exitPrice));
          }
        }
        return path.toString();
      });

      tradeG.selectAll('.trade-marker-group')
        .attr('transform', (d: any) => {
           const yPos = d.type === 'LONG' ? y(d.low) + 20 : y(d.high) - 20;
           const rot = d.type === 'LONG' ? 0 : 180;
           return `translate(${nX(d.index)}, ${yPos}) rotate(${rot})`;
        });
      
      tradeG.selectAll('text').attr('transform', (d: any) => `rotate(${d.type === 'LONG' ? 0 : 180})`);

      // Volume
      volumePane.selectAll('.vol-bar')
        .attr('x', (d: any) => nX(d.index) - cW/2)
        .attr('width', Math.max(1, cW));

      // Axes
      chartAxisG.call(d3.axisRight(y).ticks(8));
      volAxisG.call(d3.axisRight(yV).ticks(4));
    };

    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.1, 800]).on('zoom', (event) => {
        transformRef.current = event.transform;
        updateView(event.transform);
    });
    svg.call(zoom);

    if (settings.isLiveFollow) {
      const currentK = transformRef.current.k;
      const targetX = width * (1 - currentK);
      const targetTransform = d3.zoomIdentity.translate(targetX, 0).scale(currentK);
      transformRef.current = targetTransform;
      svg.call(zoom.transform, targetTransform);
    } else {
      svg.call(zoom.transform, transformRef.current);
    }

    updateView(transformRef.current);

  }, [dimensions, processedData, indicators, signals, zones, settings]);

  const lastInd = indicators[indicators.length - 1];
  const lastPrice = processedData[processedData.length - 1]?.close || 0;
  const activeSignal = signals.find(s => s.status === 'OPEN');
  
  // Terminal Logic
  const nearbyZone = zones.find(z => !z.endIndex && Math.abs(z.price - lastPrice) < (lastPrice * 0.005));

  // Context Calculations for New Dashboard
  const trendBullish = (lastInd?.ema20 || 0) > (lastInd?.ema200 || 0);
  const trendState = trendBullish ? 'BULLISH' : 'BEARISH';
  const avgAtr = indicators.slice(-20).reduce((sum, i) => sum + (i.atr || 0), 0) / 20;
  const volState = (lastInd?.atr || 0) > avgAtr ? 'EXPANDING' : 'SQUEEZE';
  const vwapBias = lastPrice > (lastInd?.vwap || 0) ? 'BULLISH' : 'BEARISH';
  const godModeBias = (lastInd?.godModeValue || 50) > 50 ? 'BULLISH' : 'BEARISH';

  // BACKTEST / STATS CALCULATION
  const closedSignals = signals.filter(s => s.status === 'TP_HIT' || s.status === 'SL_HIT' || s.status === 'CLOSED');
  const totalTrades = closedSignals.length;
  const wins = closedSignals.filter(s => s.pnl && s.pnl > 0).length;
  const winRate = totalTrades > 0 ? Math.round((wins / totalTrades) * 100) : 0;
  const netPnL = closedSignals.reduce((acc, s) => acc + (s.pnl || 0), 0);
  const grossProfit = closedSignals.reduce((acc, s) => acc + (s.pnl && s.pnl > 0 ? s.pnl : 0), 0);
  const grossLoss = Math.abs(closedSignals.reduce((acc, s) => acc + (s.pnl && s.pnl < 0 ? s.pnl : 0), 0));
  const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : grossProfit > 0 ? '∞' : '0.00';

  const handleAIValidation = async () => {
    if (!lastInd) return;
    setIsAnalyzing(true);
    // Determine context for AI
    const trend = nearbyZone?.type === 'SUPPORT' ? 'LONG' : 'SHORT';
    const analysis = await analyzeTradeSetup(lastPrice, lastInd, nearbyZone, trend);
    setAiAnalysis(analysis);
    setIsAnalyzing(false);
  };

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-[#080a0d]">
      <svg ref={svgRef} className="w-full h-full block cursor-crosshair" />
      
      {/* GODMODE HUD */}
      <div className="absolute top-3 left-4 pointer-events-none z-10 bg-[#0d1117]/90 p-4 rounded-sm border border-blue-500/30 shadow-2xl backdrop-blur-md">
        <div className="text-[10px] font-black text-blue-400 mb-2 tracking-[0.25em] uppercase flex items-center gap-2">
          GODMODE CORE V2025
          {settings.isLiveFollow && <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
        </div>
        <div className="flex flex-col gap-1 font-mono">
           <div className="flex justify-between gap-8">
             <span className="text-gray-500 text-[10px] uppercase">Price</span>
             <span className="text-white text-[14px] font-black">{lastPrice.toFixed(2)}</span>
           </div>
           <div className="flex justify-between gap-8 border-t border-white/10 mt-1 pt-1">
             <span className="text-gray-500 text-[10px] uppercase">Net Delta</span>
             <span className={`text-[12px] font-bold ${lastInd?.delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
               {lastInd?.delta > 0 ? '+' : ''}{Math.round(lastInd?.delta || 0).toLocaleString()}
             </span>
           </div>
        </div>
      </div>

      {/* STRATEGY TERMINAL - MOVED TO RESERVED RIGHT MARGIN */}
      <div className="absolute top-3 right-2 w-[270px] pointer-events-none flex flex-col z-10 gap-3">
        <div className="bg-[#0d1117]/95 p-0 rounded-sm border border-white/10 shadow-2xl backdrop-blur-md w-full pointer-events-auto">
          <div className="bg-[#161b22] px-3 py-1.5 border-b border-white/5 flex justify-between items-center">
             <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Logic Pipeline</span>
             <div className={`w-1.5 h-1.5 rounded-full ${activeSignal ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`}></div>
          </div>
          
          <div className="p-3 grid gap-3">
            {/* STEP 1: SETUP */}
            <div className="flex items-center gap-2 opacity-100">
               <div className={`w-3 h-3 rounded-sm flex items-center justify-center text-[8px] font-bold ${nearbyZone ? 'bg-yellow-500 text-black animate-pulse' : 'bg-gray-800 text-gray-500'}`}>1</div>
               <div className="flex flex-col">
                 <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Zone Setup</span>
                 <span className="text-[11px] font-bold text-white">
                   {nearbyZone ? `In Range: ${nearbyZone.type}` : 'Scanning...'}
                 </span>
               </div>
            </div>

            {/* STEP 2: TRIGGER */}
            <div className="flex items-center gap-2 opacity-100">
               <div className={`w-3 h-3 rounded-sm flex items-center justify-center text-[8px] font-bold ${activeSignal ? 'bg-green-500 text-black' : (nearbyZone ? 'bg-blue-600/50 text-white animate-pulse' : 'bg-gray-800 text-gray-500')}`}>2</div>
               <div className="flex flex-col w-full">
                 <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Trigger</span>
                 <span className="text-[11px] font-bold text-white">
                   {activeSignal ? 'CONFIRMED' : nearbyZone ? 'Awaiting Momentum...' : 'Idle'}
                 </span>
                 
                 {/* AI TRIGGER BUTTON */}
                 {nearbyZone && !activeSignal && !aiAnalysis && (
                    <button 
                      onClick={handleAIValidation}
                      disabled={isAnalyzing}
                      className="mt-2 bg-indigo-600 hover:bg-indigo-500 text-[10px] font-bold text-white px-3 py-1.5 rounded flex items-center gap-2 justify-center transition-all disabled:opacity-50"
                    >
                      {isAnalyzing ? (
                        <span className="animate-spin h-3 w-3 border-2 border-white rounded-full border-t-transparent"></span>
                      ) : (
                        <>✨ Validate with AI</>
                      )}
                    </button>
                 )}

                 {/* AI RESULT DISPLAY */}
                 {aiAnalysis && (
                   <div className="mt-2 p-2 bg-indigo-900/30 border border-indigo-500/30 rounded text-[10px]">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-indigo-300">GEMINI SCORE</span>
                        <span className={`font-black text-xs ${aiAnalysis.confidenceScore > 70 ? 'text-green-400' : 'text-yellow-400'}`}>
                          {aiAnalysis.confidenceScore}/100
                        </span>
                      </div>
                      <div className="text-gray-200 italic mb-1 text-[11px] leading-snug">"{aiAnalysis.reasoning}"</div>
                      {aiAnalysis.riskFactors.length > 0 && (
                        <div className="text-red-400 text-[10px] flex gap-1 items-center font-medium">
                          <span>⚠️</span> {aiAnalysis.riskFactors[0]}
                        </div>
                      )}
                   </div>
                 )}

               </div>
            </div>

            {/* STEP 3: EXECUTION */}
            <div className={`p-2 rounded border ${activeSignal ? 'bg-blue-500/10 border-blue-500/30' : 'bg-gray-900/50 border-white/5'}`}>
               {activeSignal ? (
                 <div className="flex flex-col gap-1">
                   <div className="flex justify-between items-center">
                      <span className={`text-[10px] font-black ${activeSignal.type === 'LONG' ? 'text-cyan-400' : 'text-pink-400'}`}>{activeSignal.type} EXECUTED</span>
                      <span className="text-[10px] text-gray-300 mono">P: {activeSignal.entryPrice.toFixed(2)}</span>
                   </div>
                   <div className="h-px bg-white/10 w-full my-1"></div>
                   <div className="flex justify-between text-[10px] mono font-bold">
                      <span className="text-red-400">SL: {activeSignal.stopLoss.toFixed(2)}</span>
                      <span className="text-green-400">TP: {activeSignal.takeProfit.toFixed(2)}</span>
                   </div>
                   <div className="text-[9px] text-gray-500 mt-1 uppercase tracking-tight font-medium">
                      Active Trail: {(Math.abs(lastPrice - activeSignal.stopLoss)).toFixed(2)} pts risk
                   </div>
                 </div>
               ) : (
                 <div className="text-[10px] text-gray-500 text-center italic py-1">No Active Positions</div>
               )}
            </div>
          </div>
        </div>

        {/* CONFLUENCE BOARD */}
        <div className="bg-[#0d1117]/95 p-0 rounded-sm border border-white/10 shadow-2xl backdrop-blur-md w-full pointer-events-auto">
             <div className="bg-[#161b22] px-3 py-1.5 border-b border-white/5 flex justify-between items-center">
                <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Confluence Matrix</span>
                <span className="text-[8px] text-gray-500 font-mono">LIVE</span>
             </div>
             
             <div className="p-3 grid gap-3">
                {/* 1. TIMEFRAME ALIGNMENT (Simulated based on MA stacking) */}
                <div className="flex flex-col gap-1.5">
                   <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Trend Architecture</span>
                   <div className="flex gap-1.5">
                      <Badge label="LTF" active={true} color={lastPrice > (lastInd?.ema9 || 0) ? 'bg-green-600 text-white' : 'bg-red-600 text-white'} />
                      <Badge label="MTF" active={true} color={lastPrice > (lastInd?.ema20 || 0) ? 'bg-green-600 text-white' : 'bg-red-600 text-white'} />
                      <Badge label="HTF" active={true} color={lastPrice > (lastInd?.ema200 || 0) ? 'bg-green-600 text-white' : 'bg-red-600 text-white'} />
                   </div>
                </div>

                <div className="h-px bg-white/5"></div>

                {/* 2. FACTOR ANALYSIS */}
                <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                   <FactorRow label="Structure" value={trendState} isBullish={trendBullish} />
                   <FactorRow label="Value (VWAP)" value={vwapBias} isBullish={vwapBias === 'BULLISH'} />
                   <FactorRow label="Momentum" value={godModeBias} isBullish={godModeBias === 'BULLISH'} />
                   <FactorRow label="Volatility" value={volState} isBullish={volState === 'EXPANDING'} neutral={true} />
                </div>
                
                {/* 3. ORDER FLOW SUMMARY */}
                <div className="bg-black/40 p-2.5 rounded border border-white/5 flex justify-between items-center mt-1">
                   <span className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">Net Delta (Session)</span>
                   <span className={`text-[11px] font-mono font-bold ${lastInd?.delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {lastInd?.delta > 0 ? '+' : ''}{Math.round(lastInd?.delta || 0)}
                   </span>
                </div>
             </div>
        </div>

        {/* BACKTEST & STATS PANEL */}
        <div className="bg-[#0d1117]/95 p-0 rounded-sm border border-white/10 shadow-2xl backdrop-blur-md w-full pointer-events-auto">
             <div className="bg-[#161b22] px-3 py-1.5 border-b border-white/5 flex justify-between items-center">
                <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Strategy Audit</span>
                <span className="text-[8px] text-gray-500 font-mono">PAPER TRADE</span>
             </div>
             
             <div className="p-3">
                {/* KEY METRICS GRID */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                   <StatBox label="Net PnL" value={netPnL.toFixed(2)} isPositive={netPnL >= 0} />
                   <StatBox label="Win Rate" value={`${winRate}%`} isPositive={winRate >= 50} neutral={winRate === 0} />
                   <StatBox label="Total Trades" value={totalTrades.toString()} />
                   <StatBox label="Profit Factor" value={profitFactor} isPositive={parseFloat(profitFactor) > 1.5} />
                </div>

                {/* RECENT TRADES LIST */}
                <div className="flex flex-col gap-1.5">
                   <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Recent Executions</span>
                   <div className="flex flex-col gap-1 max-h-[80px] overflow-y-auto pr-1 custom-scrollbar">
                     {closedSignals.slice().reverse().slice(0, 5).map(signal => (
                       <div key={signal.id} className="flex justify-between items-center p-1.5 bg-black/40 border border-white/5 rounded text-[9px]">
                         <div className="flex items-center gap-2">
                           <span className={`font-black ${signal.type === 'LONG' ? 'text-cyan-400' : 'text-pink-400'}`}>{signal.type}</span>
                           <span className="text-gray-500">{signal.status === 'TP_HIT' ? 'WIN' : 'LOSS'}</span>
                         </div>
                         <span className={`font-mono font-bold ${signal.pnl && signal.pnl > 0 ? 'text-green-400' : 'text-red-400'}`}>
                           {signal.pnl && signal.pnl > 0 ? '+' : ''}{signal.pnl?.toFixed(2)}
                         </span>
                       </div>
                     ))}
                     {closedSignals.length === 0 && <span className="text-[9px] text-gray-600 italic">No closed trades yet.</span>}
                   </div>
                </div>
             </div>
          </div>
      </div>

    </div>
  );
};

const Badge: React.FC<{ label: string; active: boolean; color: string }> = ({ label, active, color }) => (
  <div className={`flex-1 flex items-center justify-center py-1.5 rounded-sm text-[10px] font-bold tracking-tight shadow-sm ${active ? color : 'bg-gray-800 text-gray-600'}`}>
    {label}
  </div>
);

const FactorRow: React.FC<{ label: string; value: string; isBullish: boolean; neutral?: boolean }> = ({ label, value, isBullish, neutral }) => (
  <div className="flex flex-col">
    <span className="text-[10px] text-gray-400 uppercase font-medium tracking-wide mb-0.5">{label}</span>
    <span className={`text-[11px] font-bold ${neutral ? (isBullish ? 'text-yellow-400' : 'text-gray-500') : (isBullish ? 'text-green-400' : 'text-red-400')}`}>
      {value}
    </span>
  </div>
);

const StatBox: React.FC<{ label: string; value: string; isPositive?: boolean; neutral?: boolean }> = ({ label, value, isPositive, neutral }) => (
  <div className="bg-black/20 p-2 rounded border border-white/5 flex flex-col">
    <span className="text-[8px] text-gray-500 uppercase">{label}</span>
    <span className={`text-[12px] font-black font-mono ${neutral ? 'text-gray-400' : isPositive === undefined ? 'text-white' : isPositive ? 'text-green-400' : 'text-red-400'}`}>
      {value}
    </span>
  </div>
);

export default ChartComponent;
