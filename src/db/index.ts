import mongoose from "mongoose";
import { CachedVideoModel } from "./models/cachedVideo";
import { env } from "@/env";

const connect = async (db: string): Promise<void> => {
  const doConnect = async () => {
    await mongoose.connect(db, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: env.MONGODB_TIMEOUT,
    });
    console.info(`Successfully connected to ${db}`);
  };
  await doConnect();

  mongoose.connection.on("disconnected", async () => {
    console.error("Lost connection to mongo. Trying to reconnect");
    try {
      await doConnect();
    } catch (error) {
      console.error("Error connecting to database: ", error);
    }
  });
};

export const CachedVideo = CachedVideoModel;
export { connect };
