import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URL;
if (!uri) {
  throw new Error('Missing MONGODB_URL environment variable');
}

let client: MongoClient | null = null;
let clientPromise: Promise<MongoClient> | null = null;

export const getMongoClient = async () => {
  if (client) return client;
  if (!clientPromise) {
    clientPromise = new MongoClient(uri).connect();
  }
  client = await clientPromise;
  return client;
};
