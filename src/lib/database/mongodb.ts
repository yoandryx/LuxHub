import dns from "dns";
dns.setDefaultResultOrder("ipv4first");
import mongoose, { Connection } from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI as string;

if (!MONGODB_URI) {
  throw new Error("Please define the MONGODB_URI environment variable");
}

// Use the new global type
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const dbConnect = async (): Promise<Connection> => {
  if (cached.conn) {
    console.log("Using existing database connection");
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      ssl: true
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      console.log("MongoDB connected!");
      return mongoose.connection;
    });
  }

  mongoose.connection.on("connected", () => {
    console.log("Connected to DB:", mongoose.connection.name);  // Confirm DB name
  });

  cached.conn = await cached.promise;
  return cached.conn;
};

export default dbConnect;
