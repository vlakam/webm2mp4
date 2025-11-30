import { Schema, model, Document } from 'mongoose';

export interface CachedVideo extends Document {
  hash: string;
  videoFileId: string;
  thumbFileId?: string | null;
}

const cachedVideoSchema = new Schema<CachedVideo>({
  hash: { type: String, index: { unique: true } },
  videoFileId: String,
  thumbFileId: String
});

export const CachedVideoModel = model<CachedVideo>('cachedVideo', cachedVideoSchema);
