
export type Timeframe = '1s' | '1m' | '5m' | '15m' | '1h';

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

export interface TrapSignal {
  index: number;
  price: number;
  type: 'BULL_TRAP' | 'BEAR_TRAP';
  volumeIntensity: number;
}

export interface FVG {
  top: number;
  bottom: number;
  startIndex: number;
  isBullish: boolean;
}

export interface StructurePoint {
  index: number;
  price: number;
  type: 'HH' | 'HL' | 'LH' | 'LL' | 'BOS' | 'CHOCH';
}

export interface IndicatorSettings {
  timeframe: Timeframe;
  chartMode: 'CANDLE' | 'RENKO';
  renkoBoxSize: number;
  showHeatmap: boolean;
  showTraps: boolean;
  showFVG: boolean;
  showMarketStructure: boolean;
  showEVWMA: boolean;
  showDynamicPivot: boolean;
  showBuySellVol: boolean;
  
  heatmapIntensity: number;
  trapThreshold: number; 
  evwmaLength: number;
  pivotPeriod: number;
  buySellPeriod: number;
}

export interface VolumeProfileBucket {
  price: number;
  volume: number;
  intensity: number; 
}

export interface IndicatorOutput {
  evwma?: number;
  dynPivot?: number;
  buyVol: number;
  sellVol: number;
  delta: number;
  isVolSpike: boolean;
  candleColor: string;
  fvgs: FVG[];
  structure: StructurePoint[];
  traps: TrapSignal[];
  poc: number;
}
