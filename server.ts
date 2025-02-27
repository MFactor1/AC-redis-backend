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

let seedsMatt: number[] = new Array(9).fill(0);
let seedsHail: number[] = new Array(9).fill(0);

redis.lrange("seedsMatt", 0, 9, (err, value) => {
  if (value && value.length == 9) {
    seedsMatt = value.map(Number);
  } else if (err) {
    console.log(err.message);
  }
});

redis.lrange("seedsHail", 0, 9, (err, value) => {
  if (value && value.length == 9) {
    seedsHail = value.map(Number);
  } else if (err) {
    console.log(err.message);
  }
});
