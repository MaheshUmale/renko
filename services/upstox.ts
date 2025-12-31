
import protobuf from "protobufjs";

// Exact content of MarketDataFeedV3.proto from Upstox
const PROTO_STR = `
syntax = "proto3";

package com.upstox.marketdatafeeder.rpc.proto;

message LTPC {
  double ltp = 1;
  int64 ltt = 2;
  int64 ltq = 3;
  double cp = 4;
}

message MarketLevel {
  repeated Quote bidAskQuote = 1;
}

message MarketFullFeed {
  LTPC ltpc = 1;
  MarketLevel marketLevel = 2;
  OptionGreeks optionGreeks = 3;
  Quote eod = 4;
  Quote lastClose = 5;
  Quote lastTrade = 6;
}

message IndexFullFeed {
  LTPC ltpc = 1;
  Quote lastClose = 2;
}

message OptionGreeks {
  double op = 1;
  double gamma = 2;
  double theta = 3;
  double vega = 4;
  double delta = 5;
  double rho = 6;
  double vol = 7;
  double iv = 8;
}

message OptionChain {
  double ltp = 1;
  double vol = 2;
  double oi = 3;
  double price = 4;
  double oi_change = 5;
  double bid_price = 6;
  double ask_price = 7;
  double bid_qty = 8;
  double ask_qty = 9;
}

message Quote {
  double ltp = 1;
  int64 ltt = 2;
  int64 ltq = 3;
  double cp = 4;
  double bap = 5;
  int64 baq = 6;
  double sap = 7;
  int64 saq = 8;
}

message FullFeed {
  MarketFullFeed marketFF = 1;
  OptionChain optionChain = 2;
  IndexFullFeed indexFF = 3;
}

message Feed {
  LTPC ltpc = 1;
  FullFeed fullFeed = 2;
}

message FeedResponse {
  Type type = 1;
  map<string, Feed> feeds = 2;
}

enum Type {
  initial_feed = 0;
  live_feed = 1;
}
`;

// Initialize Protobuf Root
let FeedResponse: protobuf.Type | null = null;

try {
  const parsed = protobuf.parse(PROTO_STR, { keepCase: true });
  if (parsed.root) {
      FeedResponse = parsed.root.lookupType("com.upstox.marketdatafeeder.rpc.proto.FeedResponse");
  }
} catch (error) {
  console.error("Proto Parse Error:", error);
}

export const decodeUpstoxMessage = (buffer: ArrayBuffer): any => {
  if (!FeedResponse) {
    console.warn("Proto type not initialized");
    return null;
  }
  try {
    const decoded = FeedResponse.decode(new Uint8Array(buffer));
    return FeedResponse.toObject(decoded, {
      longs: Number,
      enums: String,
      bytes: String,
      defaults: true,
      arrays: true
    });
  } catch (err) {
    console.error("Upstox Decode Error:", err);
    return null;
  }
};
