
import { OHLCV, IndicatorSettings, IndicatorOutput, RenkoBrick, Tick, TradeSignal, ChartZone } from '../types';

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
  },
  tr: (high: number[], low: number[], close: number[]) => {
    const tr: number[] = [];
    for(let i=0; i<high.length; i++) {
      if (i===0) { tr.push(high[i]-low[i]); continue; }
      const hl = high[i] - low[i];
      const hc = Math.abs(high[i] - close[i-1]);
      const lc = Math.abs(low[i] - close[i-1]);
      tr.push(Math.max(hl, hc, lc));
    }
    return tr;
  },
  atr: (high: number[], low: number[], close: number[], period: number) => {
    const tr = TA.tr(high, low, close);
    return TA.sma(tr, period); 
  }
};

export function resampleTick(tick: Tick, currentData: OHLCV[], timeframeSeconds: number): OHLCV[] {
  const tickTime = Math.floor((tick.timestamp > 1e11 ? tick.timestamp / 1000 : tick.timestamp) / timeframeSeconds) * timeframeSeconds;
  
  if (currentData.length === 0) {
    return [{
      time: tickTime,
      open: tick.ltp,
      high: tick.ltp,
      low: tick.ltp,
      close: tick.ltp,
      volume: tick.ltq
    }];
  }

  const last = currentData[currentData.length - 1];
  const updatedData = [...currentData];

  if (tickTime === last.time) {
    updatedData[updatedData.length - 1] = {
      ...last,
      high: Math.max(last.high, tick.ltp),
      low: Math.min(last.low, tick.ltp),
      close: tick.ltp,
      volume: last.volume + tick.ltq
    };
  } else if (tickTime > last.time) {
    updatedData.push({
      time: tickTime,
      open: tick.ltp,
      high: tick.ltp,
      low: tick.ltp,
      close: tick.ltp,
      volume: tick.ltq
    });
  }
  
  if (updatedData.length > 5000) return updatedData.slice(updatedData.length - 5000);
  return updatedData;
}

export function calculateIndicators(data: (OHLCV | RenkoBrick)[], settings: IndicatorSettings): IndicatorOutput[] {
  const close = data.map(d => d.close), high = data.map(d => d.high), low = data.map(d => d.low), open = data.map(d => d.open), volume = data.map(d => d.volume);
  const len0 = 9, len1 = 26, len2 = 13, highLevel = 70, lowLevel = 30, cou0 = 3;

  const emaPriceLen0 = TA.ema(close, len0);
  const diffPriceEma = close.map((p, i) => emaPriceLen0[i] !== undefined ? p - emaPriceLen0[i]! : 0);
  const emaAbsDiff = TA.ema(diffPriceEma.map(v => Math.abs(v)), len0);
  const tci = TA.ema(diffPriceEma.map((v, i) => emaAbsDiff[i] !== undefined ? v / (0.025 * emaAbsDiff[i]!) : 0), len1).map(v => (v || 0) + 50);

  const mf = close.map((_, i) => {
    if (i < len2) return 50;
    let uS = 0, dS = 0;
    for (let j = 0; j < len2; j++) {
      const idx = i - j, chg = close[idx] - (close[idx - 1] || close[idx]);
      if (chg > 0) uS += volume[idx] * close[idx]; else dS += volume[idx] * close[idx];
    }
    return 100 - (100 / (1 + (uS / (dS || 1))));
  });

  const hiL1 = TA.highest(close, len1), loL1 = TA.lowest(close, len1);
  const willy = close.map((p, i) => (hiL1[i] !== undefined && loL1[i] !== undefined && hiL1[i] !== loL1[i]) ? 60 * (p - hiL1[i]!) / (hiL1[i]! - loL1[i]!) + 80 : 50);

  const rsiL2 = TA.rsi(close, len2);
  const godMode = close.map((_, i) => ((tci[i] || 50) + (mf[i] || 50) + (willy[i] || 50) + (rsiL2[i] || 50)) / 4);

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
  // Smoother Visualization for SR Lines
  for (let i = 1; i < srOut.length; i++) {
    if (srOut[i].gsh === undefined) srOut[i].gsh = srOut[i-1].gsh;
    if (srOut[i].gsl === undefined) srOut[i].gsl = srOut[i-1].gsl;
    if (srOut[i].grh === undefined) srOut[i].grh = srOut[i-1].grh;
    if (srOut[i].grl === undefined) srOut[i].grl = srOut[i-1].grl;
  }

  const stdP = 48, stdM = 4, stdDevV = TA.stdev(volume, stdP), avgV = TA.sma(volume, stdP);
  let sL: number | undefined, rL: number | undefined;
  
  // Logic for SR Dots: Identify high volume outliers
  const dots = volume.map((v, i) => {
    const condition = (v - (avgV[i] || 0)) > stdM * (stdDevV[i] || 0);
    if (condition) { if (close[i] > open[i]) sL = low[i]; else rL = high[i]; }
    return { s: sL, r: rL };
  });

  const ema9 = TA.ema(close, 9);
  const ema20 = TA.ema(close, 20);
  const ema200 = TA.ema(close, 200);
  
  let cumPV = 0, cumV = 0;
  const vwap = close.map((p, i) => {
    cumPV += p * volume[i];
    cumV += volume[i];
    return cumPV / (cumV || 1);
  });

  const evwma = new Array(data.length).fill(0);
  for (let i = 0; i < data.length; i++) {
    let sV = 0, lb = Math.min(i + 1, settings.evwmaLength);
    for (let j = Math.max(0, i - lb + 1); j <= i; j++) sV += volume[j];
    if (i === 0) evwma[i] = close[i];
    else { const fl = sV || 1; evwma[i] = (evwma[i-1] * (fl - volume[i]) / fl) + (volume[i] * close[i] / fl); }
  }

  const atr = TA.atr(high, low, close, 14);

  return data.map((d, i) => {
    const nv = stdDevV[i] ? (volume[i] - (avgV[i] || 0)) / stdDevV[i]! : 0;
    return {
      index: i, evwma: evwma[i], vwap: vwap[i], ema9: ema9[i], ema20: ema20[i], ema200: ema200[i],
      delta: (d.close > d.open ? 1 : -1) * d.volume, normVol: nv,
      candleColor: d.close >= d.open ? '#22c55e' : '#ef4444', godModeValue: godMode[i], srLevels: srOut[i], srDots: dots[i],
      bubbleSize: Math.max(0, nv * 1.5),
      atr: atr[i]
    };
  });
}

/**
 * Advanced Trading Engine
 * Step 1: Zone Identification (S/R Memory)
 * Step 2: Setup (Price re-visits Zone)
 * Step 3: Trigger (Volume Effort + Reversal)
 * Step 4: Execution & Active Monitoring (Trailing SL)
 */
export function generateTradeSignals(data: OHLCV[], indicators: IndicatorOutput[]): { signals: TradeSignal[], zones: ChartZone[] } {
  const signals: TradeSignal[] = [];
  const zones: ChartZone[] = [];
  let currentPosition: TradeSignal | null = null;
  
  // Track Active Zones
  const activeSupportZones: ChartZone[] = [];
  const activeResistanceZones: ChartZone[] = [];

  const COOLDOWN = 10;
  let lastExitIndex = -COOLDOWN;

  for (let i = 50; i < data.length; i++) {
    const d = data[i];
    const ind = indicators[i];
    const prevInd = indicators[i-1];
    const atr = ind.atr || 0;
    
    // --- 1. ZONE MANAGEMENT ---
    // If a new SR Dot appears, register it as a Zone
    if (ind.srDots.s && indicators[i-1].srDots.s !== ind.srDots.s) {
      const newZone: ChartZone = { type: 'SUPPORT', price: ind.srDots.s, startIndex: i, strength: 1 };
      activeSupportZones.push(newZone);
      zones.push(newZone);
    }
    if (ind.srDots.r && indicators[i-1].srDots.r !== ind.srDots.r) {
      const newZone: ChartZone = { type: 'RESISTANCE', price: ind.srDots.r, startIndex: i, strength: 1 };
      activeResistanceZones.push(newZone);
      zones.push(newZone);
    }

    // Zone Clean-up: If price breaks through zone significantly, invalidate it
    for (let z = activeSupportZones.length - 1; z >= 0; z--) {
      if (d.close < activeSupportZones[z].price - atr * 0.5) { // Break support
         activeSupportZones[z].endIndex = i;
         activeSupportZones.splice(z, 1);
      }
    }
    for (let z = activeResistanceZones.length - 1; z >= 0; z--) {
      if (d.close > activeResistanceZones[z].price + atr * 0.5) { // Break resistance
         activeResistanceZones[z].endIndex = i;
         activeResistanceZones.splice(z, 1);
      }
    }


    // --- 2. TRADE MANAGEMENT (Active Monitoring) ---
    if (currentPosition) {
      const isLong = currentPosition.type === 'LONG';
      
      // Add current SL to history for visualization
      currentPosition.slHistory.push({ index: i, price: currentPosition.stopLoss });

      // Check Exits
      let exit = false;
      let exitReason = '';
      let pnl = 0;

      if (isLong) {
        if (d.low <= currentPosition.stopLoss) { exit = true; exitReason = 'SL_HIT'; pnl = currentPosition.stopLoss - currentPosition.entryPrice; }
        else if (d.high >= currentPosition.takeProfit) { exit = true; exitReason = 'TP_HIT'; pnl = currentPosition.takeProfit - currentPosition.entryPrice; }
      } else {
        if (d.high >= currentPosition.stopLoss) { exit = true; exitReason = 'SL_HIT'; pnl = currentPosition.entryPrice - currentPosition.stopLoss; }
        else if (d.low <= currentPosition.takeProfit) { exit = true; exitReason = 'TP_HIT'; pnl = currentPosition.entryPrice - currentPosition.takeProfit; }
      }

      if (exit) {
        currentPosition.status = exitReason as any;
        currentPosition.exitPrice = exitReason === 'SL_HIT' ? currentPosition.stopLoss : currentPosition.takeProfit;
        currentPosition.exitIndex = i;
        currentPosition.pnl = pnl;
        signals.push(currentPosition);
        currentPosition = null;
        lastExitIndex = i;
      } else {
        // --- TRAILING STOP LOGIC ---
        // 1. Move to Break Even if price moved 40% towards TP
        const distToTP = Math.abs(currentPosition.takeProfit - currentPosition.entryPrice);
        const currentDist = Math.abs(d.close - currentPosition.entryPrice);
        
        if (isLong) {
           if (currentDist > distToTP * 0.4 && currentPosition.stopLoss < currentPosition.entryPrice) {
             currentPosition.stopLoss = currentPosition.entryPrice + atr * 0.1; // Slight profit guarantee
           }
           // Trail by 2 ATR if price goes higher
           const newSL = d.high - 2.5 * atr;
           if (newSL > currentPosition.stopLoss) {
             currentPosition.stopLoss = newSL;
           }
        } else {
           if (currentDist > distToTP * 0.4 && currentPosition.stopLoss > currentPosition.entryPrice) {
             currentPosition.stopLoss = currentPosition.entryPrice - atr * 0.1;
           }
           const newSL = d.low + 2.5 * atr;
           if (newSL < currentPosition.stopLoss) {
             currentPosition.stopLoss = newSL;
           }
        }
      }

      continue; // Skip entry logic if in position
    }


    // --- 3. ENTRY LOGIC (Setup + Trigger) ---
    if (i - lastExitIndex < COOLDOWN) continue;

    // LONG SCENARIO
    // Setup: Price is near a known Support Zone (within 1 ATR)
    const nearestSupport = activeSupportZones.find(z => Math.abs(d.low - z.price) < atr * 1.5 && d.low >= z.price - atr * 0.5);
    
    if (nearestSupport) {
       // Trigger:
       // 1. Rejection Wick (Close is in upper 50% of candle) OR Green Candle
       // 2. Momentum turning up (GodMode crossed up or is low)
       const isRejection = (d.close - d.low) > (d.high - d.low) * 0.6; // Hammer-ish
       const isGreen = d.close > d.open;
       const momemtumOk = ind.godModeValue < 45 && ind.godModeValue > prevInd.godModeValue;
       
       if ((isRejection || isGreen) && momemtumOk) {
         const entry = d.close;
         const sl = nearestSupport.price - atr * 0.5; // SL below the Zone
         // TP at next resistance or 2:1
         let tp = entry + (entry - sl) * 2;
         const nextRes = activeResistanceZones.find(z => z.price > entry);
         if (nextRes) tp = nextRes.price - atr * 0.2;

         if ((tp - entry) / (entry - sl) > 1.2) { // Ensure at least 1.2 R:R
            currentPosition = {
              id: `L-${d.time}`,
              index: i,
              time: d.time,
              type: 'LONG',
              entryPrice: entry,
              stopLoss: sl,
              takeProfit: tp,
              status: 'OPEN',
              reason: `Zone Bounce @ ${nearestSupport.price.toFixed(2)}`,
              slHistory: [{ index: i, price: sl }]
            };
            if (i === data.length - 1) signals.push(currentPosition);
         }
       }
    }

    // SHORT SCENARIO
    // Setup: Price near Resistance Zone
    const nearestRes = activeResistanceZones.find(z => Math.abs(d.high - z.price) < atr * 1.5 && d.high <= z.price + atr * 0.5);
    
    if (nearestRes) {
       // Trigger: Rejection wick from top OR Red Candle
       const isRejection = (d.high - d.close) > (d.high - d.low) * 0.6; // Shooting star-ish
       const isRed = d.close < d.open;
       const momemtumOk = ind.godModeValue > 55 && ind.godModeValue < prevInd.godModeValue;

       if ((isRejection || isRed) && momemtumOk) {
         const entry = d.close;
         const sl = nearestRes.price + atr * 0.5;
         let tp = entry - (sl - entry) * 2;
         const nextSup = activeSupportZones.find(z => z.price < entry);
         if (nextSup) tp = nextSup.price + atr * 0.2;

         if ((entry - tp) / (sl - entry) > 1.2) {
            currentPosition = {
              id: `S-${d.time}`,
              index: i,
              time: d.time,
              type: 'SHORT',
              entryPrice: entry,
              stopLoss: sl,
              takeProfit: tp,
              status: 'OPEN',
              reason: `Zone Reject @ ${nearestRes.price.toFixed(2)}`,
              slHistory: [{ index: i, price: sl }]
            };
            if (i === data.length - 1) signals.push(currentPosition);
         }
       }
    }
  }
  
  // Push open position if not already in list
  if (currentPosition && !signals.find(s => s.id === currentPosition!.id)) {
     signals.push(currentPosition);
  }

  return { signals, zones };
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
