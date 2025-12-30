
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
  const svgRef = useRef<SVGSVGElement>(null);
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
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
      for (const entry of entries) {
        setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(target);
    return () => observer.unobserve(target);
  }, []);

  useEffect(() => {
    if (dimensions.width === 0 || dimensions.height === 0 || !processedData.length) return;

    const margin = { top: 30, right: 60, bottom: 20, left: 10 };
    const volHeight = 100;
    const spacing = 40;
    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom - volHeight - spacing;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('width', dimensions.width).attr('height', dimensions.height).style('background', '#080a0d');

    const x = d3.scaleLinear().domain([0, processedData.length]).range([0, width]);
    const yMin = d3.min(processedData, d => d.low)!;
    const yMax = d3.max(processedData, d => d.high)!;
    const y = d3.scaleLinear().domain([yMin * 0.999, yMax * 1.001]).range([height, 0]);
    
    const deltas = indicators.map(i => i.delta);
    const maxDelta = d3.max(deltas, d => Math.abs(d)) || 1;
    const yV = d3.scaleLinear().domain([-maxDelta, maxDelta]).range([volHeight, 0]);

    const chart = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    const volumePane = svg.append('g').attr('transform', `translate(${margin.left},${margin.top + height + spacing})`);

    const chartAxisG = chart.append('g').attr('class', 'y-axis').attr('transform', `translate(${width}, 0)`).attr('color', '#30363d');
    const volAxisG = volumePane.append('g').attr('class', 'y-axis').attr('transform', `translate(${width}, 0)`).attr('color', '#30363d');

    const updateView = (transform: d3.ZoomTransform) => {
      const nX = transform.rescaleX(x);
      const cW = (width / processedData.length) * transform.k * 0.8;

      // Price Action
      svg.selectAll('.candle, .vol-delta-bar').attr('x', (d: any) => nX(d.index) - cW/2).attr('width', Math.max(1, cW));
      svg.selectAll('.wick').attr('x1', (d: any) => nX(d.index)).attr('x2', (d: any) => nX(d.index));
      
      // Overlays - Crucial Fix: Pinning to Candle Prices
      svg.selectAll('.sr-dot').attr('cx', (d: any) => nX(d.index));
      svg.selectAll('.vol-bubble')
        .attr('cx', (d: any) => nX(d.index))
        .attr('cy', (d: any) => y(processedData[d.index].high) - 20); // 20px offset above candle high
      
      // Dynamic Lines
      svg.selectAll('.indicator-line').attr('d', function(d: any) {
         return d3.line<any>().defined(p => p.val !== undefined).x((p, i) => nX(i)).y(p => y(p.val))(d);
      });

      chartAxisG.call(d3.axisRight(y).ticks(8));
      volAxisG.call(d3.axisRight(yV).ticks(4));
    };

    if (settings.showHeatmap) {
      const profile = getVolumeProfile(processedData, 100);
      const bH = Math.max(1, height / profile.buckets.length);
      chart.selectAll('.heatmap-row').data(profile.buckets).enter().append('rect')
        .attr('x', 0).attr('y', d => y(d.price) - bH).attr('width', width).attr('height', bH)
        .attr('fill', d => d.intensity > 0.85 ? '#00f2ff' : '#1a1d26')
        .attr('opacity', d => d.intensity * 0.3 * settings.heatmapIntensity);
    }

    const drawLine = (vals: (number|undefined)[], color: string, w: number, opacity: number = 0.6) => {
      const line = d3.line<any>().defined(d => d.val !== undefined).x((d, i) => x(i)).y(d => y(d.val));
      chart.append('path').datum(vals.map(v => ({val: v}))).attr('class', 'indicator-line').attr('fill', 'none').attr('stroke', color).attr('stroke-width', w).attr('opacity', opacity).attr('d', line);
    };

    if (settings.showVolSR) {
      drawLine(indicators.map(i => i.srLevels.grh), '#ef4444', 1.5, 0.4);
      drawLine(indicators.map(i => i.srLevels.gsh), '#10b981', 1.5, 0.4);
    }
    if (settings.showEVWMA) drawLine(indicators.map(i => i.evwma), '#4cc9f0', 2);
    if (settings.showVWAP) drawLine(indicators.map(i => i.vwap), '#ff9800', 1.5, 0.8);
    if (settings.showEMAs) {
       drawLine(indicators.map(i => i.ema9), '#ff0404', 1);
       drawLine(indicators.map(i => i.ema20), '#0952fa', 1);
       drawLine(indicators.map(i => i.ema200), '#ffffff', 1, 0.3);
    }

    const candleData = processedData.map((d, i) => ({ ...d, index: i }));
    const candles = chart.selectAll('.candle-group').data(candleData).enter().append('g');
    candles.append('line').attr('class', 'wick').attr('stroke', (d, i) => indicators[i]?.candleColor).attr('y1', d => y(d.high)).attr('y2', d => y(d.low));
    candles.append('rect').attr('class', 'candle').attr('fill', (d, i) => indicators[i]?.candleColor).attr('y', d => y(Math.max(d.open, d.close))).attr('height', d => Math.max(1, Math.abs(y(d.open) - y(d.close))));

    const overlayData = indicators.map((d, i) => ({ ...d, index: i }));

    if (settings.showSRDots) {
      chart.selectAll('.sr-dot-s').data(overlayData).enter().filter(d => d.srDots?.s !== undefined).append('circle').attr('class', 'sr-dot')
        .attr('cy', d => y(d.srDots!.s!)).attr('r', 2.5).attr('fill', '#2195f3').attr('opacity', 0.8);
      chart.selectAll('.sr-dot-r').data(overlayData).enter().filter(d => d.srDots?.r !== undefined).append('circle').attr('class', 'sr-dot')
        .attr('cy', d => y(d.srDots!.r!)).attr('r', 2.5).attr('fill', '#ff9800').attr('opacity', 0.8);
    }

    if (settings.showVolBubbles) {
      chart.selectAll('.vol-bubble').data(overlayData).enter()
        .filter(d => d.bubbleSize > 2)
        .append('circle')
        .attr('class', 'vol-bubble')
        .attr('r', d => Math.min(25, d.bubbleSize * 1.5))
        .attr('fill', d => d.delta > 0 ? '#00f2ff' : '#ff3d00')
        .attr('opacity', 0.25)
        .attr('stroke', '#fff')
        .attr('stroke-width', 0.5)
        .attr('pointer-events', 'none');
    }

    volumePane.append('line').attr('x1', 0).attr('x2', width).attr('y1', yV(0)).attr('y2', yV(0)).attr('stroke', '#30363d').attr('stroke-width', 1);
    volumePane.selectAll('.vol-delta-bar').data(overlayData).enter().append('rect').attr('class', 'vol-delta-bar')
      .attr('y', d => d.delta > 0 ? yV(d.delta) : yV(0)).attr('height', d => Math.abs(yV(d.delta) - yV(0)))
      .attr('fill', d => d.delta > 0 ? '#10b981' : '#ef4444').attr('opacity', 0.6);

    const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.1, 800]).on('zoom', (event) => {
        transformRef.current = event.transform;
        updateView(event.transform);
    });
    svg.call(zoom);

    if (settings.isLiveFollow) {
      const currentK = transformRef.current.k;
      const targetX = width - x(processedData.length) * currentK;
      const targetTransform = d3.zoomIdentity.translate(targetX, 0).scale(currentK);
      transformRef.current = targetTransform;
      svg.call(zoom.transform, targetTransform);
    } else {
      svg.call(zoom.transform, transformRef.current);
    }

    updateView(transformRef.current);

  }, [dimensions, processedData, indicators, settings]);

  const lastInd = indicators[indicators.length - 1];
  const lastPrice = processedData[processedData.length - 1]?.close || 0;

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-[#080a0d]">
      <svg ref={svgRef} className="w-full h-full block cursor-crosshair" />
      
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
           <div className="flex justify-between gap-8">
             <span className="text-gray-500 text-[10px] uppercase">GodMode</span>
             <span className={`text-[11px] font-bold ${lastInd?.godModeValue > 70 ? 'text-red-500' : lastInd?.godModeValue < 30 ? 'text-green-500' : 'text-blue-400'}`}>
               {lastInd?.godModeValue.toFixed(1)}
             </span>
           </div>
        </div>
      </div>

      <div className="absolute bottom-3 right-4 flex gap-2 items-center bg-black/60 px-2 py-1 border border-white/5 rounded-sm">
         <span className="text-[8px] text-gray-700 font-black tracking-widest uppercase">Institutional Analytics Core • 1S Feed</span>
      </div>
    </div>
  );
};

export default ChartComponent;
