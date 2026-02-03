// src/lib/database/mongodb.ts
import dns from 'dns';

// Guard for dns (server-only)
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

import mongoose, { Connection } from 'mongoose';

// ONLY check/throw on the server — prevents client-side crash
if (typeof window === 'undefined') {
  const MONGODB_URI = process.env.MONGODB_URI as string;

  if (!MONGODB_URI) {
    throw new Error('Please define the MONGODB_URI environment variable inside .env.local');
  }
}

// Declare globally to avoid re-connecting
declare global {
  var mongoose:
    | {
        conn: Connection | null;
        promise: Promise<Connection> | null;
      }
    | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const globalWithMongoose = globalThis as any;
let cached = globalWithMongoose.mongoose;

if (!cached) {
  cached = globalWithMongoose.mongoose = { conn: null, promise: null };
}

const dbConnect = async (): Promise<Connection> => {
  // If we're in the browser, throw early to catch misuse
  if (typeof window !== 'undefined') {
    throw new Error('dbConnect() cannot be called from client-side code');
  }

  if (cached.conn) {
    console.log('Using existing database connection');
    return cached.conn;
  }

  if (!cached.promise) {
    const MONGODB_URI = process.env.MONGODB_URI as string;

    const opts = {
      bufferCommands: false,
      ssl: true,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongooseInstance) => {
      console.log('MongoDB connected!');
      return mongooseInstance.connection;
    });
  }

  mongoose.connection.on('connected', () => {
    console.log('Connected to DB:', mongoose.connection.name);
  });

  cached.conn = await cached.promise;
  return cached.conn;
};

export default dbConnect;
