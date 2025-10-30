import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI as string | undefined;

if (!MONGODB_URI) {
	throw new Error("MONGODB_URI não definida nas variáveis de ambiente");
}

interface MongooseCache {
	conn: typeof mongoose | null;
	promise: Promise<typeof mongoose> | null;
}

const globalForMongoose = global as unknown as { _mongoose?: MongooseCache };

const cached: MongooseCache = globalForMongoose._mongoose ?? {
	conn: null,
	promise: null,
};

globalForMongoose._mongoose = cached;

export async function connectToDatabase() {
	if (cached.conn) return cached.conn;
	if (!cached.promise) {
		cached.promise = mongoose.connect(MONGODB_URI, {
			bufferCommands: false,
		});
	}
	cached.conn = await cached.promise;
	return cached.conn;
}
