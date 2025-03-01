import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config()

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

const PORT = process.env.PORT || 3001;

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const validRequests: Set<string> = new Set();
validRequests.add("increment");
validRequests.add("updateRequest");

let seedsMatt: number[] = new Array(9).fill(0);
let seedsHail: number[] = new Array(9).fill(0);
let updateMatt: boolean[] = new Array(seedsMatt.length).fill(false);
let updateHail: boolean[] = new Array(seedsHail.length).fill(false);
let lastDataUpdate: number = Date.now();
let lastClientUpdate: number = Date.now();

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
  const existsMatt = await redis.exists("seedsMatt");
  const existsHail = await redis.exists("seedsHail");

  if (!existsMatt) {
    await redis.rpush("seedsMatt", ...seedsMatt);
  }

  if (!existsHail) {
    await redis.rpush("seedsHail", ...seedsHail);
  }

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

function updateClients() {
  if (lastClientUpdate < lastDataUpdate) {
    console.log("Sending out updates to clients");
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "seedUpdate", matt: seedsMatt, hail: seedsHail }));
      }
    });
    lastClientUpdate = Date.now();
  }
}

setInterval(updateClients, 1000);

wss.on("connection", (ws) => {
  console.log("Client connected");

  ws.send(JSON.stringify({ type: "seedUpdate", matt: seedsMatt, hail: seedsHail }));

  ws.on("message", async (message) => {
    const data = JSON.parse(message.toString());
    if (!data.type) {
      ws.send(JSON.stringify({ type: "error", message: "Missing type field", code: 400 }));
      return;
    }

    console.log(`Recieved message of type: ${data.type}`);

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
        ws.send(JSON.stringify({ type: "error", message: "data.matt and data.hail must be an arrays", code: 422 }));
      }

      if (data.matt.length != seedsMatt.length || data.hail.length != seedsHail.length) {
        ws.send(JSON.stringify({ type: "error", message: "Invalid data length", code: 422 }));
        return;
      }

      for (var i = 0; i < data.matt.length; i++) {
        if (typeof data.matt[i] !== "number") {
          ws.send(JSON.stringify({ type: "error", message: `Invalid data format in data.matt: ${typeof data.matt[i]}`, code: 422 }));
          return;
        }
        if (typeof data.hail[i] !== "number") {
          ws.send(JSON.stringify({ type: "error", message: `Invalid data format in data.hail: ${typeof data.hail[i]}`, code: 422 }));
          return;
        }
      }

      console.log(data.matt);
      console.log(data.hail);

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

      lastDataUpdate = Date.now();

    } else if (data.type == "updateRequest") {
      ws.send(JSON.stringify({ type: "seedUpdate", matt: seedsMatt, hail: seedsHail }));
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
