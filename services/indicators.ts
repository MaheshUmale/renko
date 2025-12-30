
import { OHLCV, IndicatorSettings, IndicatorOutput, FVG, StructurePoint, TrapSignal, VolumeProfileBucket, RenkoBrick } from '../types';

export const TA = {
  sma: (data: number[], period: number) => {
    const result: (number | undefined)[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) { result.push(undefined); continue; }
      let sum = 0;
      for (let j = 0; j < period; j++) sum += data[i - j];
      result.push(sum / period);
    }
    return result;
  },
  stdev: (data: number[], period: number) => {
    const result: (number | undefined)[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) { result.push(undefined); continue; }
      let sum = 0;
      for (let j = 0; j < period; j++) sum += data[i - j];
      const mean = sum / period;
      let varSum = 0;
      for (let j = 0; j < period; j++) varSum += Math.pow(data[i - j] - mean, 2);
      result.push(Math.sqrt(varSum / period));
    }
    return result;
  }
};

export function calculateRenkoBricks(data: OHLCV[], boxSize: number): RenkoBrick[] {
  if (!data.length) return [];
  const bricks: RenkoBrick[] = [];
  let prevClose = Math.round(data[0].close / boxSize) * boxSize;
  let runningHigh = data[0].high, runningLow = data[0].low, runningVol = data[0].volume;
  let startTime = data[0].time;

  for (let i = 1; i < data.length; i++) {
    const d = data[i];
    runningHigh = Math.max(runningHigh, d.high);
    runningLow = Math.min(runningLow, d.low);
    runningVol += d.volume;

    const diff = d.close - prevClose;
    if (Math.abs(diff) >= boxSize) {
      const numBricks = Math.floor(Math.abs(diff) / boxSize);
      const isUp = diff > 0;
      for (let j = 0; j < numBricks; j++) {
        const bOpen = prevClose;
        const bClose = isUp ? prevClose + boxSize : prevClose - boxSize;
        bricks.push({
          time: startTime,
          open: bOpen,
          close: bClose,
          high: j === 0 ? runningHigh : Math.max(bOpen, bClose),
          low: j === 0 ? runningLow : Math.min(bOpen, bClose),
          volume: j === 0 ? runningVol : 0,
          isUp
        });
        prevClose = bClose;
        runningHigh = bClose; runningLow = bClose; runningVol = 0; startTime = d.time;
      }
    }
  }
  return bricks;
}

export function calculateIndicators(data: (OHLCV | RenkoBrick)[], settings: IndicatorSettings): IndicatorOutput[] {
  const close = data.map(d => d.close);
  const high = data.map(d => d.high);
  const low = data.map(d => d.low);
  const volume = data.map(d => d.volume);

  const avgV = TA.sma(volume, 50);
  
  // Buy/Sell Volume Estimation based on candle close relative to high/low/open (Auction Theory)
  const buyV = data.map((d, i) => {
    const range = d.high - d.low || 0.0001;
    const body = d.close - d.open;
    const buyPressure = (d.close - d.low) / range;
    return d.volume * buyPressure;
  });
  const sellV = data.map((d, i) => {
    const range = d.high - d.low || 0.0001;
    const sellPressure = (d.high - d.close) / range;
    return d.volume * sellPressure;
  });

  const evwma = new Array(data.length).fill(0);
  for (let i = 0; i < data.length; i++) {
    let sumV = 0;
    const lookback = Math.min(i + 1, settings.evwmaLength);
    for (let j = Math.max(0, i - lookback + 1); j <= i; j++) sumV += volume[j];
    if (i === 0) evwma[i] = close[i];
    else {
      const float = sumV || 1;
      evwma[i] = (evwma[i-1] * (float - volume[i]) / float) + (volume[i] * close[i] / float);
    }
  }

  const dynPivot = new Array(data.length).fill(undefined);
  for (let i = settings.pivotPeriod; i < data.length; i++) {
    dynPivot[i] = (Math.max(...high.slice(i-settings.pivotPeriod, i)) + Math.min(...low.slice(i-settings.pivotPeriod, i))) / 2;
  }

  const traps: TrapSignal[] = [];
  const fvgs: FVG[] = [];
  const structure: StructurePoint[] = [];

  for (let i = 2; i < data.length; i++) {
    const d = data[i];
    const prev = data[i-1];
    
    // Auction Theory: Trap Detection
    // Logic: Price pushes to a new high/low (wick), volume spikes (absorption), then price fails to hold.
    const isVolSpike = d.volume > (avgV[i] || 0) * settings.trapThreshold;
    const upperWick = d.high - Math.max(d.close, d.open);
    const lowerWick = Math.min(d.close, d.open) - d.low;
    const body = Math.abs(d.close - d.open);

    if (isVolSpike) {
      if (upperWick > body * 1.5 && d.high > prev.high) {
        traps.push({ index: i, price: d.high, type: 'BULL_TRAP', volumeIntensity: d.volume / (avgV[i] || 1) });
      }
      if (lowerWick > body * 1.5 && d.low < prev.low) {
        traps.push({ index: i, price: d.low, type: 'BEAR_TRAP', volumeIntensity: d.volume / (avgV[i] || 1) });
      }
    }

    // FVG (Fair Value Gap)
    if (data[i-2].high < data[i].low) fvgs.push({ top: data[i].low, bottom: data[i-2].high, startIndex: i-1, isBullish: true });
    if (data[i-2].low > data[i].high) fvgs.push({ top: data[i-2].low, bottom: data[i].high, startIndex: i-1, isBullish: false });

    // Market Structure (HH/LL/BOS)
    if (high[i] > high[i-1] && high[i] > high[i-2] && i < data.length - 2 && high[i] > high[i+1]) 
      structure.push({ index: i, price: high[i], type: 'HH' });
    if (low[i] < low[i-1] && low[i] < low[i-2] && i < data.length - 2 && low[i] < low[i+1]) 
      structure.push({ index: i, price: low[i], type: 'LL' });
  }

  const { poc } = getVolumeProfile(data, 100);

  return data.map((d, i) => {
    const delta = buyV[i] - sellV[i];
    const isUp = d.close >= d.open;
    
    // Smart Candle Coloring
    let candleColor = isUp ? '#22c55e' : '#ef4444';
    if (Math.abs(delta) > (avgV[i] || 0) * 1.2) {
      candleColor = delta > 0 ? '#10b981' : '#b91c1c'; // Aggressive buying/selling
    }

    return {
      evwma: evwma[i],
      dynPivot: dynPivot[i],
      buyVol: buyV[i],
      sellVol: sellV[i],
      delta: delta,
      isVolSpike: d.volume > (avgV[i] || 0) * 1.8,
      candleColor,
      fvgs, structure, traps,
      poc
    };
  });
}

export function getVolumeProfile(data: (OHLCV | RenkoBrick)[], bins: number = 80) {
  if (!data.length) return { buckets: [], poc: 0 };
  const prices = data.flatMap(d => [d.low, d.high, d.close, d.open]);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const range = high - low;
  const step = Math.max(0.01, range / bins);
  const buckets: VolumeProfileBucket[] = Array.from({ length: bins }, (_, i) => ({ 
    price: low + i * step, 
    volume: 0, 
    intensity: 0 
  }));

  data.forEach(d => {
    const idx = Math.min(bins - 1, Math.floor((d.close - low) / step));
    if (idx >= 0) buckets[idx].volume += d.volume;
    
    // Distribute high/low/open volume a bit to fill profile
    const hIdx = Math.min(bins - 1, Math.floor((d.high - low) / step));
    const lIdx = Math.min(bins - 1, Math.floor((d.low - low) / step));
    if (hIdx >= 0) buckets[hIdx].volume += d.volume * 0.1;
    if (lIdx >= 0) buckets[lIdx].volume += d.volume * 0.1;
  });

  const maxV = Math.max(...buckets.map(b => b.volume)) || 1;
  buckets.forEach(b => b.intensity = b.volume / maxV);
  
  const pocBucket = [...buckets].sort((a,b) => b.volume - a.volume)[0];
  return { buckets, poc: pocBucket?.price || 0 };
}

export function generateMockData(count: number, interval: number = 1): OHLCV[] {
  const data: OHLCV[] = [];
  let price = 50000;
  let time = Math.floor(Date.now() / 1000) - count * interval;
  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 20;
    const open = price;
    const close = price + change;
    data.push({ 
      time, 
      open, 
      high: Math.max(open, close) + Math.random() * 8, 
      low: Math.min(open, close) - Math.random() * 8, 
      close, 
      volume: Math.random() * 200 + (Math.random() > 0.94 ? 1200 : 0) 
    });
    price = close;
    time += interval;
  }
  return data;
}

export function timeframeToSeconds(tf: string): number {
  switch (tf) {
    case '1s': return 1;
    case '1m': return 60;
    case '5m': return 300;
    case '15m': return 900;
    case '1h': return 3600;
    default: return 60;
  }
}
