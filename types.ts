
export type Timeframe = '1s' | '1m' | '5m' | '15m' | '1h';

export interface Tick {
  timestamp: number; // unix ms or seconds
  ltp: number;      // Last Traded Price
  ltq: number;      // Last Traded Quantity
}

export interface OHLCV {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface RenkoBrick {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isUp: boolean;
}

export interface IndicatorSettings {
  timeframe: Timeframe;
  chartMode: 'CANDLE' | 'RENKO';
  renkoBoxSize: number;
  showHeatmap: boolean;
  showEVWMA: boolean;
  showVWAP: boolean;
  showEMAs: boolean;
  showVolBubbles: boolean;
  showSRDots: boolean;
  showVolSR: boolean;
  showGodMode: boolean;
  isLiveFollow: boolean;
  
  heatmapIntensity: number;
  evwmaLength: number;
  
  // Data Source Config
  dataSource: 'mock' | 'ws' | 'custom';
  wsUrl: string;
}

export interface VolumeProfileBucket {
  price: number;
  volume: number;
  intensity: number; 
}

export interface SRLevels {
  gsh?: number;
  gsl?: number;
  grh?: number;
  grl?: number;
  gsdh?: number;
  gsdl?: number;
}

export interface IndicatorOutput {
  index: number;
  evwma?: number;
  vwap?: number;
  ema9?: number;
  ema20?: number;
  ema200?: number;
  delta: number;
  normVol: number;
  candleColor: string;
  godModeValue: number;
  srLevels: SRLevels;
  srDots: {
    s?: number;
    r?: number;
  };
  bubbleSize: number;
  atr?: number;
}

export interface TradeSignal {
  id: string;
  index: number;
  time: number;
  type: 'LONG' | 'SHORT';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  status: 'OPEN' | 'TP_HIT' | 'SL_HIT' | 'CLOSED';
  exitPrice?: number;
  exitIndex?: number;
  pnl?: number;
  reason: string;
  slHistory: { index: number, price: number }[]; // Track how SL moves over time
}

export interface ChartZone {
  type: 'SUPPORT' | 'RESISTANCE';
  price: number;
  startIndex: number;
  endIndex?: number;
  strength: number;
}

export interface AIAnalysis {
  confidenceScore: number; // 0 to 100
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  reasoning: string;
  riskFactors: string[];
}
