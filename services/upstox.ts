
import protobuf from "protobufjs";
import Long from "long";

// Configure Protobuf to use Long for 64-bit integers
protobuf.util.Long = Long;
protobuf.configure();

// Official Upstox MarketDataFeedV3.proto definition
// Package: com.upstox.marketdatafeederv3udapi.rpc.proto
const PROTO_STR = `
syntax = "proto3";
package com.upstox.marketdatafeederv3udapi.rpc.proto;

message LTPC {
  double ltp = 1;
  int64 ltt = 2;
  int64 ltq = 3;
  double cp = 4;
}

message MarketLevel {
  repeated Quote bidAskQuote = 1;
}

message MarketOHLC {
  repeated OHLC ohlc = 1;
}

message Quote {
  int64 bidQ = 1;
  double bidP = 2;
  int64 askQ = 3;
  double askP = 4;
}

message OptionGreeks {
  double delta = 1;
  double theta = 2;
  double gamma = 3;
  double vega = 4;
  double rho = 5;
}

message OHLC {
  string interval = 1;
  double open = 2;
  double high = 3;
  double low = 4;
  double close = 5;
  int64 vol = 6;
  int64 ts = 7;
}

enum Type{
  initial_feed = 0;
  live_feed = 1;
  market_info = 2;
}

message MarketFullFeed{
  LTPC ltpc = 1;
  MarketLevel marketLevel = 2;
  OptionGreeks optionGreeks = 3;
  MarketOHLC marketOHLC = 4;
  double atp = 5; //avg traded price
  int64 vtt = 6; //volume traded today
  double oi = 7; //open interest
  double iv = 8; //implied volatility 
  double tbq =9; //total buy quantity
  double tsq = 10; //total sell quantity
}

message IndexFullFeed{
  LTPC ltpc = 1;
  MarketOHLC marketOHLC = 2;
}


message FullFeed {
  oneof FullFeedUnion {
    MarketFullFeed marketFF = 1;
    IndexFullFeed indexFF = 2;
  }
}

message FirstLevelWithGreeks{
  LTPC ltpc = 1;
  Quote firstDepth = 2;
  OptionGreeks optionGreeks = 3;
  int64 vtt = 4; //volume traded today
  double oi = 5; //open interest
  double iv = 6; //implied volatility 
}

message Feed {
  oneof FeedUnion {
    LTPC ltpc = 1;
    FullFeed fullFeed = 2;
    FirstLevelWithGreeks firstLevelWithGreeks = 3;
  }
  RequestMode requestMode = 4;
}

enum RequestMode {
  ltpc = 0;
  full_d5 = 1;
  option_greeks = 2;
  full_d30 = 3;
}

enum MarketStatus {
  PRE_OPEN_START = 0;
  PRE_OPEN_END = 1;
  NORMAL_OPEN = 2;
  NORMAL_CLOSE = 3;
  CLOSING_START = 4;
  CLOSING_END = 5;
}


message MarketInfo {
  map<string, MarketStatus> segmentStatus = 1;
}

message FeedResponse{
  Type type = 1;
  map<string, Feed> feeds = 2;
  int64 currentTs = 3;
  MarketInfo marketInfo = 4;
}
`;

// Initialize Protobuf Root
let FeedResponse: protobuf.Type | null = null;

try {
  // Parse the proto string to generate the runtime types
  const parsed = protobuf.parse(PROTO_STR, { keepCase: true });
  if (parsed.root) {
      // Correct package path for Upstox V3
      FeedResponse = parsed.root.lookupType("com.upstox.marketdatafeederv3udapi.rpc.proto.FeedResponse");
  }
} catch (error) {
  console.error("Upstox Proto Parse Error:", error);
}

export const decodeUpstoxMessage = (buffer: ArrayBuffer): any => {
  if (!FeedResponse) {
    console.warn("Proto type not initialized");
    return null;
  }
  
  if (buffer.byteLength === 0) return null;

  try {
    // Decode the binary buffer
    const decoded = FeedResponse.decode(new Uint8Array(buffer));
    
    // Convert to a plain JavaScript object
    return FeedResponse.toObject(decoded, {
      longs: String,
      enums: String,
      bytes: String,
      defaults: true,
      arrays: true,
      oneofs: true
    });
  } catch (err: any) {
    console.error("Upstox Decode Error:", err);
    return null;
  }
};
