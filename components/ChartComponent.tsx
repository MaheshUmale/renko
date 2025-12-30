
import React, { useMemo, useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import { OHLCV, IndicatorOutput, IndicatorSettings, RenkoBrick } from '../types';
import { getVolumeProfile, calculateRenkoBricks } from '../services/indicators';

interface ChartProps {
  data: OHLCV[];
  indicators: IndicatorOutput[];
  settings: IndicatorSettings;
}

const ChartComponent: React.FC<ChartProps> = ({ data, indicators, settings }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const processedData = useMemo(() => {
    return settings.chartMode === 'RENKO' 
      ? calculateRenkoBricks(data, settings.renkoBoxSize) 
      : data;
  }, [data, settings.renkoBoxSize, settings.chartMode]);

  useEffect(() => {
    const target = containerRef.current;
    if (!target) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(target);
    return () => observer.unobserve(target);
  }, []);

  useEffect(() => {
    if (dimensions.width === 0 || dimensions.height === 0 || !processedData.length) return;

    const margin = { top: 20, right: 60, bottom: 20, left: 10 };
    const volHeight = 100;
    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom - volHeight - 40;

    d3.select(containerRef.current).select('svg').remove();
    const svg = d3.select(containerRef.current).append('svg')
      .attr('width', dimensions.width).attr('height', dimensions.height).style('background', '#080a0d');

    const chart = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    const volume = svg.append('g').attr('transform', `translate(${margin.left},${margin.top + height + 45})`);

    const x = d3.scaleLinear().domain([0, processedData.length]).range([0, width]);
    const yMin = d3.min(processedData, d => d.low)!;
    const yMax = d3.max(processedData, d => d.high)!;
    const y = d3.scaleLinear().domain([yMin * 0.9992, yMax * 1.0008]).range([height, 0]);
    
    // Volume Delta sub-chart scale
    const deltas = indicators.map(i => i.delta);
    const maxDelta = d3.max(deltas, d => Math.abs(d)) || 1;
    const yV = d3.scaleLinear().domain([-maxDelta, maxDelta]).range([volHeight, 0]);

    // 1. Bookmap Heatmap Background
    if (settings.showHeatmap) {
      const profile = getVolumeProfile(processedData, 100);
      const bH = Math.max(1, height / profile.buckets.length);
      chart.selectAll('.heatmap-row').data(profile.buckets).enter().append('rect')
        .attr('x', 0).attr('y', d => y(d.price) - bH).attr('width', width).attr('height', bH)
        .attr('fill', d => d.intensity > 0.8 ? '#4cc9f0' : '#3a0ca3')
        .attr('opacity', d => d.intensity * 0.3 * settings.heatmapIntensity);

      // Point of Control (POC) line
      chart.append('line')
        .attr('x1', 0).attr('x2', width)
        .attr('y1', y(profile.poc)).attr('y2', y(profile.poc))
        .attr('stroke', '#f72585').attr('stroke-width', 1).attr('stroke-dasharray', '4,4').attr('opacity', 0.6);
    }

    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.3, 100]).on('zoom', (event) => {
      const nX = event.transform.rescaleX(x);
      const cW = (width / processedData.length) * event.transform.k * 0.85;
      
      svg.selectAll('.candle, .vol-delta-bar').attr('x', (d, i) => nX(i) - cW/2).attr('width', Math.max(1, cW));
      svg.selectAll('.wick').attr('x1', (d, i) => nX(i)).attr('x2', (d, i) => nX(i));
      svg.selectAll('.trap-marker, .struct-marker').attr('x', (d: any) => nX(d.index));
      svg.selectAll('.indicator-line').attr('d', function(d: any) {
         return d3.line<any>().defined(p => p.val !== undefined).x((p, i) => nX(i)).y(p => y(p.val))(d);
      });
      svg.selectAll('.fvg-rect').attr('x', (d: any) => nX(d.startIndex)).attr('width', (d: any) => width - nX(d.startIndex));
    });
    svg.call(zoom);

    // 2. FVG
    if (settings.showFVG && indicators.length > 0) {
      chart.selectAll('.fvg-rect').data(indicators[0].fvgs).enter().append('rect').attr('class', 'fvg-rect')
        .attr('x', d => x(d.startIndex)).attr('y', d => y(d.top)).attr('width', d => width - x(d.startIndex)).attr('height', d => Math.abs(y(d.top) - y(d.bottom)))
        .attr('fill', d => d.isBullish ? '#10b981' : '#ef4444').attr('opacity', 0.05);
    }

    // 3. Core Indicators (eVWMA, Pivot)
    const drawLine = (vals: (number|undefined)[], color: string) => {
      const line = d3.line<any>().defined(d => d.val !== undefined).x((d, i) => x(i)).y(d => y(d.val));
      chart.append('path').datum(vals.map(v => ({val: v}))).attr('class', 'indicator-line').attr('fill', 'none').attr('stroke', color).attr('stroke-width', 1.5).attr('d', line);
    };
    if (settings.showEVWMA) drawLine(indicators.map(i => i.evwma), '#4cc9f0');
    if (settings.showDynamicPivot) drawLine(indicators.map(i => i.dynPivot), '#f72585');

    // 4. Renko/Candles with Wicks
    const cW = (width / processedData.length) * 0.85;
    const candles = chart.selectAll('.candle-group').data(processedData).enter().append('g');
    
    candles.append('line').attr('class', 'wick')
      .attr('x1', (d, i) => x(i)).attr('x2', (d, i) => x(i)).attr('y1', d => y(d.high)).attr('y2', d => y(d.low))
      .attr('stroke', (d, i) => indicators[i].candleColor).attr('stroke-width', 1);

    candles.append('rect').attr('class', 'candle')
      .attr('x', (d, i) => x(i) - cW/2).attr('y', d => y(Math.max(d.open, d.close))).attr('width', cW).attr('height', d => Math.max(1, Math.abs(y(d.open) - y(d.close))))
      .attr('fill', (d, i) => indicators[i].candleColor);

    // 5. Trap Signals
    if (settings.showTraps && indicators.length > 0) {
      const trapGroup = chart.selectAll('.trap-marker').data(indicators[0].traps).enter().append('g').attr('class', 'trap-marker');
      
      trapGroup.append('text')
        .attr('x', d => x(d.index)).attr('y', d => d.type === 'BULL_TRAP' ? y(d.price) - 12 : y(d.price) + 20)
        .attr('text-anchor', 'middle').attr('fill', d => d.type === 'BULL_TRAP' ? '#ff4d4d' : '#00ff88')
        .style('font-size', '10px').style('font-weight', 'black').text('TRAP');
        
      trapGroup.append('circle')
        .attr('cx', d => x(d.index)).attr('cy', d => y(d.price))
        .attr('r', 4).attr('fill', 'none').attr('stroke', d => d.type === 'BULL_TRAP' ? '#ff4d4d' : '#00ff88').attr('stroke-width', 2).attr('opacity', 0.8);
    }

    // 6. Volume Delta Sub-chart (Auction Theory Buy/Sell)
    volume.append('line').attr('x1', 0).attr('x2', width).attr('y1', yV(0)).attr('y2', yV(0)).attr('stroke', '#30363d').attr('stroke-width', 1);

    volume.selectAll('.vol-delta-bar').data(indicators).enter().append('rect').attr('class', 'vol-delta-bar')
      .attr('x', (d, i) => x(i) - cW/2).attr('y', d => d.delta > 0 ? yV(d.delta) : yV(0)).attr('width', cW).attr('height', d => Math.abs(yV(d.delta) - yV(0)))
      .attr('fill', d => d.delta > 0 ? '#10b981' : '#ef4444').attr('opacity', 0.6);

    // Axes
    chart.append('g').attr('transform', `translate(${width}, 0)`).attr('color', '#30363d').call(d3.axisRight(y).ticks(8));
    volume.append('g').attr('transform', `translate(${width}, 0)`).attr('color', '#30363d').call(d3.axisRight(yV).ticks(4));

  }, [dimensions, processedData, indicators, settings]);

  const lastInd = indicators[indicators.length - 1];
  const lastPrice = processedData[processedData.length - 1]?.close || 0;

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden">
      <div className="absolute top-3 left-4 pointer-events-none z-10 bg-[#0d1117]/90 p-4 rounded-sm border border-blue-500/30 shadow-2xl backdrop-blur-md">
        <div className="text-[10px] font-black text-blue-400 mb-2 tracking-[0.25em] uppercase">AUCTION FLOW ENGINE V3</div>
        <div className="flex flex-col gap-1 font-mono">
           <div className="flex justify-between gap-8">
             <span className="text-gray-500 text-[10px] uppercase">Market Price</span>
             <span className="text-white text-[14px] font-black">{lastPrice.toFixed(2)}</span>
           </div>
           <div className="flex justify-between gap-8 border-t border-white/10 mt-1 pt-1">
             <span className="text-gray-500 text-[10px] uppercase">Session Delta</span>
             <span className={`text-[12px] font-bold ${lastInd?.delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
               {lastInd?.delta > 0 ? 'BUYING +' : 'SELLING '}{Math.abs(lastInd?.delta || 0).toLocaleString()}
             </span>
           </div>
           <div className="flex justify-between gap-8">
             <span className="text-gray-500 text-[10px] uppercase">Institutional POC</span>
             <span className="text-[#f72585] text-[11px] font-bold">{lastInd?.poc.toFixed(2)}</span>
           </div>
        </div>
      </div>
      <div className="absolute bottom-3 right-4 text-[9px] text-gray-800 font-black tracking-widest uppercase bg-black/40 px-2 py-1">
        BOOKMAP HYPER-REACTIVE FEED • 1S SEQUENTIAL
      </div>
    </div>
  );
};

export default ChartComponent;
