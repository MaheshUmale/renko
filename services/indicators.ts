
import { OHLCV, IndicatorSettings, IndicatorOutput, VolumeProfileBucket, RenkoBrick } from '../types';

export const TA = {
  sma: (data: (number | undefined)[], period: number) => {
    const result: (number | undefined)[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) { result.push(undefined); continue; }
      let sum = 0, count = 0;
      for (let j = 0; j < period; j++) {
        const val = data[i - j];
        if (val !== undefined) { sum += val; count++; }
      }
      result.push(count > 0 ? sum / count : undefined);
    }
    return result;
  },
  ema: (data: (number | undefined)[], period: number) => {
    const result: (number | undefined)[] = [];
    const alpha = 2 / (period + 1);
    let ema: number | undefined = undefined;
    for (let i = 0; i < data.length; i++) {
      const val = data[i];
      if (val === undefined) { result.push(undefined); continue; }
      if (ema === undefined) ema = val;
      else ema = (val - ema) * alpha + ema;
      result.push(ema);
    }
    return result;
  },
  rsi: (data: number[], period: number) => {
    const result: (number | undefined)[] = [];
    let avgGain = 0, avgLoss = 0;
    for (let i = 1; i < data.length; i++) {
      const change = data[i] - data[i - 1];
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? -change : 0;
      if (i <= period) {
        avgGain += gain / period;
        avgLoss += loss / period;
        if (i === period) result.push(100 - (100 / (1 + (avgGain / (avgLoss || 1)))));
        else result.push(undefined);
      } else {
        avgGain = ((avgGain * (period - 1)) + gain) / period;
        avgLoss = ((avgLoss * (period - 1)) + loss) / period;
        result.push(100 - (100 / (1 + (avgGain / (avgLoss || 1)))));
      }
    }
    return [undefined, ...result];
  },
  highest: (data: number[], period: number) => {
    const result: (number | undefined)[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) { result.push(undefined); continue; }
      result.push(Math.max(...data.slice(i - period + 1, i + 1)));
    }
    return result;
  },
  lowest: (data: number[], period: number) => {
    const result: (number | undefined)[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) { result.push(undefined); continue; }
      result.push(Math.min(...data.slice(i - period + 1, i + 1)));
    }
    return result;
  },
  stdev: (data: number[], period: number) => {
    const result: (number | undefined)[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) { result.push(undefined); continue; }
      const slice = data.slice(i - period + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
      result.push(Math.sqrt(variance));
    }
    return result;
  }
};

export function calculateIndicators(data: (OHLCV | RenkoBrick)[], settings: IndicatorSettings): IndicatorOutput[] {
  const close = data.map(d => d.close), high = data.map(d => d.high), low = data.map(d => d.low), open = data.map(d => d.open), volume = data.map(d => d.volume);
  const len0 = 9, len1 = 26, len2 = 13, highLevel = 70, lowLevel = 30, cou0 = 3;

  // TCI
  const emaPriceLen0 = TA.ema(close, len0);
  const diffPriceEma = close.map((p, i) => emaPriceLen0[i] !== undefined ? p - emaPriceLen0[i]! : 0);
  const emaAbsDiff = TA.ema(diffPriceEma.map(v => Math.abs(v)), len0);
  const tci = TA.ema(diffPriceEma.map((v, i) => emaAbsDiff[i] !== undefined ? v / (0.025 * emaAbsDiff[i]!) : 0), len1).map(v => (v || 0) + 50);

  // MF
  const mf = close.map((_, i) => {
    if (i < len2) return 50;
    let uS = 0, dS = 0;
    for (let j = 0; j < len2; j++) {
      const idx = i - j, chg = close[idx] - (close[idx - 1] || close[idx]);
      if (chg > 0) uS += volume[idx] * close[idx]; else dS += volume[idx] * close[idx];
    }
    return 100 - (100 / (1 + (uS / (dS || 1))));
  });

  // Willy
  const hiL1 = TA.highest(close, len1), loL1 = TA.lowest(close, len1);
  const willy = close.map((p, i) => (hiL1[i] !== undefined && loL1[i] !== undefined && hiL1[i] !== loL1[i]) ? 60 * (p - hiL1[i]!) / (hiL1[i]! - loL1[i]!) + 80 : 50);

  // GodMode
  const rsiL2 = TA.rsi(close, len2);
  const godMode = close.map((_, i) => ((tci[i] || 50) + (mf[i] || 50) + (willy[i] || 50) + (rsiL2[i] || 50)) / 4);

  // Vol_S_R (Persistent Levels)
  let grC = 0, gsC = 0;
  const srOut = godMode.map((gm, i) => {
    if (gm > highLevel) grC++; else grC = 0;
    if (gm < lowLevel) gsC++; else gsC = 0;
    return { 
      gsh: gsC >= cou0 ? high[i] : undefined, gsl: gsC >= cou0 ? low[i] : undefined, 
      grh: grC >= cou0 ? high[i] : undefined, grl: grC >= cou0 ? low[i] : undefined,
      gsdh: (grC >= cou0 || gsC >= cou0) ? high[i] : undefined, gsdl: (grC >= cou0 || gsC >= cou0) ? low[i] : undefined
    };
  });
  for (let i = 1; i < srOut.length; i++) {
    if (srOut[i].gsh === undefined) srOut[i].gsh = srOut[i-1].gsh;
    if (srOut[i].gsl === undefined) srOut[i].gsl = srOut[i-1].gsl;
    if (srOut[i].grh === undefined) srOut[i].grh = srOut[i-1].grh;
    if (srOut[i].grl === undefined) srOut[i].grl = srOut[i-1].grl;
    if (srOut[i].gsdh === undefined) srOut[i].gsdh = srOut[i-1].gsdh;
    if (srOut[i].gsdl === undefined) srOut[i].gsdl = srOut[i-1].gsdl;
  }

  // S/R Dots
  const stdP = 48, stdM = 4, stdDevV = TA.stdev(volume, stdP), avgV = TA.sma(volume, stdP);
  let sL: number | undefined, rL: number | undefined;
  const dots = volume.map((v, i) => {
    const condition = (v - (avgV[i] || 0)) > stdM * (stdDevV[i] || 0);
    if (condition) { if (close[i] > open[i]) sL = low[i]; else rL = high[i]; }
    return { s: sL, r: rL };
  });

  // EMAs & VWAP
  const ema9 = TA.ema(close, 9);
  const ema20 = TA.ema(close, 20);
  const ema200 = TA.ema(close, 200);
  
  let cumPV = 0, cumV = 0;
  const vwap = close.map((p, i) => {
    cumPV += p * volume[i];
    cumV += volume[i];
    return cumPV / (cumV || 1);
  });

  // eVWMA
  const evwma = new Array(data.length).fill(0);
  for (let i = 0; i < data.length; i++) {
    let sV = 0, lb = Math.min(i + 1, settings.evwmaLength);
    for (let j = Math.max(0, i - lb + 1); j <= i; j++) sV += volume[j];
    if (i === 0) evwma[i] = close[i];
    else { const fl = sV || 1; evwma[i] = (evwma[i-1] * (fl - volume[i]) / fl) + (volume[i] * close[i] / fl); }
  }

  return data.map((d, i) => {
    const nv = stdDevV[i] ? (volume[i] - (avgV[i] || 0)) / stdDevV[i]! : 0;
    return {
      index: i, evwma: evwma[i], vwap: vwap[i], ema9: ema9[i], ema20: ema20[i], ema200: ema200[i],
      delta: (d.close > d.open ? 1 : -1) * d.volume, normVol: nv,
      candleColor: d.close >= d.open ? '#22c55e' : '#ef4444', godModeValue: godMode[i], srLevels: srOut[i], srDots: dots[i],
      bubbleSize: Math.max(0, nv * 1.5)
    };
  });
}

export function getVolumeProfile(data: (OHLCV | RenkoBrick)[], bins: number = 80) {
  if (!data.length) return { buckets: [], poc: 0, vah: 0, val: 0 };
  const prices = data.flatMap(d => [d.low, d.high]), low = Math.min(...prices), high = Math.max(...prices), range = high - low, step = Math.max(0.01, range / bins);
  const buckets = Array.from({ length: bins }, (_, i) => ({ price: low + i * step, volume: 0, intensity: 0 }));
  data.forEach(d => {
    const sIdx = Math.max(0, Math.floor((d.low - low) / step)), eIdx = Math.min(bins - 1, Math.floor((d.high - low) / step)), vPB = d.volume / (eIdx - sIdx + 1 || 1);
    for (let j = sIdx; j <= eIdx; j++) buckets[j].volume += vPB;
  });
  const maxV = Math.max(...buckets.map(b => b.volume)) || 1;
  buckets.forEach(b => b.intensity = b.volume / maxV);
  const pIdx = buckets.findIndex(b => b.volume === maxV);
  return { buckets, poc: buckets[pIdx]?.price || 0, vah: 0, val: 0 };
}

export function calculateRenkoBricks(data: OHLCV[], boxSize: number): RenkoBrick[] {
  if (!data.length) return [];
  const bricks: RenkoBrick[] = [];
  let pC = Math.round(data[0].close / boxSize) * boxSize, rH = data[0].high, rL = data[0].low, rV = data[0].volume, sT = data[0].time;
  for (let i = 1; i < data.length; i++) {
    const d = data[i]; rH = Math.max(rH, d.high); rL = Math.min(rL, d.low); rV += d.volume;
    const diff = d.close - pC;
    if (Math.abs(diff) >= boxSize) {
      const nB = Math.floor(Math.abs(diff) / boxSize), isU = diff > 0;
      for (let j = 0; j < nB; j++) {
        const bO = pC, bC = isU ? pC + boxSize : pC - boxSize;
        bricks.push({ time: sT, open: bO, close: bC, high: j === 0 ? rH : Math.max(bO, bC), low: j === 0 ? rL : Math.min(bO, bC), volume: j === 0 ? rV : 0, isUp: isU });
        pC = bC; rH = bC; rL = bC; rV = 0; sT = d.time;
      }
    }
  }
  return bricks;
}

export function generateMockData(count: number, interval: number = 1, startPrice: number = 50000): OHLCV[] {
  const data: OHLCV[] = [];
  let price = startPrice, time = Math.floor(Date.now() / 1000) - count * interval;
  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 20, open = price, close = price + change;
    data.push({ time, open, high: Math.max(open, close) + Math.random() * 8, low: Math.min(open, close) - Math.random() * 8, close, volume: Math.random() * 200 + (Math.random() > 0.94 ? 1200 : 0) });
    price = close; time += interval;
  }
  return data;
}

export function timeframeToSeconds(tf: string): number {
  switch (tf) {
    case '1s': return 1; case '1m': return 60; case '5m': return 300; case '15m': return 900; case '1h': return 3600;
    default: return 60;
  }
}
