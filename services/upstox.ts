
import protobuf from "protobufjs";

// Minimal Proto Definition for Upstox Market Data Feed (V3)
// Reference: com.upstox.marketdatafeeder.rpc.proto
const UPSTOX_PROTO_JSON = {
  nested: {
    com: {
      nested: {
        upstox: {
          nested: {
            marketdatafeeder: {
              nested: {
                rpc: {
                  nested: {
                    proto: {
                      nested: {
                        FeedResponse: {
                          fields: {
                            type: { type: "Type", id: 1 },
                            feeds: { keyType: "string", type: "Feed", id: 2 }
                          }
                        },
                        Feed: {
                          fields: {
                            ltpc: { type: "LTPC", id: 1 },
                            fullFeed: { type: "FullFeed", id: 2 }
                          }
                        },
                        FullFeed: {
                          fields: {
                            lastTrade: { type: "LastTrade", id: 5 }
                          }
                        },
                        LTPC: {
                          fields: {
                            ltp: { type: "double", id: 1 },
                            ltt: { type: "int64", id: 2 },
                            ltq: { type: "int64", id: 3 }
                          }
                        },
                        LastTrade: {
                          fields: {
                            ltp: { type: "double", id: 1 },
                            ltt: { type: "int64", id: 2 },
                            ltq: { type: "int64", id: 3 }
                          }
                        },
                        Type: {
                            values: {
                                "initial_feed": 0,
                                "live_feed": 1
                            }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};

const root = protobuf.Root.fromJSON(UPSTOX_PROTO_JSON);
const FeedResponse = root.lookupType("com.upstox.marketdatafeeder.rpc.proto.FeedResponse");

export interface UpstoxFeedData {
  feeds?: {
    [key: string]: {
      ltpc?: { ltp?: number; ltt?: number; ltq?: number };
      fullFeed?: {
        lastTrade?: { ltp?: number; ltt?: number; ltq?: number };
      }
    }
  }
}

export const decodeUpstoxMessage = (buffer: ArrayBuffer): UpstoxFeedData | null => {
  try {
    const message = FeedResponse.decode(new Uint8Array(buffer));
    const object = FeedResponse.toObject(message, {
      longs: Number,
      enums: String,
      bytes: String,
      defaults: true
    });
    return object as UpstoxFeedData;
  } catch (err) {
    console.error("Upstox Proto Decode Error", err);
    return null;
  }
};
