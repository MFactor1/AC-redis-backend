import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config()

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const validRequests: Set<string> = new Set();
validRequests.add("increment");

let seedsMatt: number[] = new Array(9).fill(0);
let seedsHail: number[] = new Array(9).fill(0);
let updateMatt: boolean[] = new Array(seedsMatt.length).fill(false);
let updateHail: boolean[] = new Array(seedsHail.length).fill(false);

redis.lrange("seedsMatt", 0, -1, (err, value) => {
  if (value && value.length == seedsMatt.length) {
    seedsMatt = value.map(Number);
  } else if (err) {
    console.log(err.message);
  }
});

redis.lrange("seedsHail", 0, -1, (err, value) => {
  if (value && value.length == seedsHail.length) {
    seedsHail = value.map(Number);
  } else if (err) {
    console.log(err.message);
  }
});

async function syncToRedis() {
  for (var i = 0; i < seedsMatt.length; i++) {
    if (updateMatt[i]) {
      await redis.lset("seedsMatt", i, seedsMatt[i]);
      updateMatt[i] = false;
    }
    if (updateHail[i]) {
      await redis.lset("seedsHail", i, seedsHail[i])
      updateHail[i] = false;
    }
  }
}

setInterval(syncToRedis, 5000);

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "counter", matt: seedsMatt, hail: seedsHail }));

  ws.on("message", async (message) => {
    const data = JSON.parse(message.toString());
    if (!data.type) {
      ws.send(JSON.stringify({ type: "error", message: "Missing type field", code: 400 }));
      return;
    }

    if (!validRequests.has(data.type)) {
      ws.send(JSON.stringify({ type: "error", message: `Unrecognized request type: ${data.type}`, code: 400 }));
      return;
    }

    if (data.type == "increment") {
      if (!data.matt || !data.hail) {
        ws.send(JSON.stringify({ type: "error", message: "Missing required data fields", code: 400 }));
        return;
      }

      if (!Array.isArray(data.matt) || !Array.isArray(data.hail)) {
        ws.send(JSON.stringify({ type: "error", message: "data.matt and data.hail must be an arrays", code: 400 }));
      }

      if (data.matt.length != seedsMatt.length || data.hail.length != seedsHail.length) {
        ws.send(JSON.stringify({ type: "error", message: "Invalid data length", code: 400 }));
        return;
      }

      for (var i = 0; i < data.matt.length; i++) {
        if (typeof data.matt[i] !== "number") {
          ws.send(JSON.stringify({ type: "error", message: `Invalid data format in data.matt: ${typeof data.matt[i]}`, code: 400 }));
        }
        if (typeof data.hail[i] !== "number") {
          ws.send(JSON.stringify({ type: "error", message: `Invalid data format in data.hail: ${typeof data.hail[i]}`, code: 400 }));
        }
      }

      for (var i = 0; i < seedsMatt.length; i++) {
        if (data.matt[i] != 0) {
          seedsMatt[i] = seedsMatt[i] + data.matt[i];
          updateMatt[i] = true;
        }
        if (data.hail[i] != 0) {
          seedsHail[i] = seedsHail[i] + data.hail[i];
          updateHail[i] = true;
        }
      }

      ws.send(JSON.stringify({ type: "seedUpdate", matt: seedsMatt, hail: seedsHail }));
    }
  });
});
