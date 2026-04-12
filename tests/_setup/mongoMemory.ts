import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongoServer: MongoMemoryServer | null = null;

/**
 * Start an in-memory MongoDB instance and connect Mongoose.
 * Safe to call multiple times — idempotent.
 */
export async function startInMemoryMongo(): Promise<void> {
  if (mongoServer) return;
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
}

/**
 * Disconnect Mongoose and stop the in-memory MongoDB instance.
 */
export async function stopInMemoryMongo(): Promise<void> {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }
}

/**
 * Drop all collections — call between tests for isolation.
 */
export async function clearAllCollections(): Promise<void> {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}
