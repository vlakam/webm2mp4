import { promises as fs } from "fs";
import path from "path";
import {
  BigOutputError,
  ConvertError,
  NotAVideoError,
  TimeoutError,
} from "@/error";
import { ConvertJob } from "@/types";
import { env } from "@/env";
import { ProcessError, runProcess } from "./process";

const METADATA_TIMEOUT_MS = 30_000;
const THUMBNAIL_TIMEOUT_MS = 30_000;
const THUMBNAIL_THRESHOLD_MB = 10;
const MAX_THUMBNAIL_BYTES = 200_000;

export type FfmpegProgress = {
  percent?: number;
};

export type ConverterHooks = {
  onProgress?: (progress: FfmpegProgress, bar: string) => void | Promise<void>;
  onThumbnailStart?: () => void | Promise<void>;
};

export type ConvertResult = {
  outputPath: string;
  thumbPath?: string;
  sizeMb: number;
  durationSeconds?: number;
};

type Metadata = {
  streams: Array<{
    codec_type: string;
    codec_name?: string;
    disposition?: { attached_pic?: number };
  }>;
  format?: { duration?: string };
};

type Mode = "copy" | "copy-video" | "transcode";

export default class FfmpegConverter {
  private hooks: ConverterHooks;
  private output: string;

  constructor(private job: ConvertJob, hooks: ConverterHooks = {}) {
    this.hooks = hooks;
    this.output = path.join(job.dir, "converted.mp4");

    if (path.resolve(this.output) === path.resolve(job.filePath)) {
      this.output = path.join(job.dir, "converted-output.mp4");
    }
  }

  setHooks(hooks: ConverterHooks): void {
    this.hooks = { ...this.hooks, ...hooks };
  }

  static generateProgress(percent?: number): string {
    const count = Math.max(0, Math.min(10, Math.floor((percent || 0) / 10)));
    return "🔸".repeat(count) + "🔹".repeat(10 - count);
  }

  private async probe(filename: string): Promise<Metadata> {
    const output = await runProcess("ffprobe", [
      "-v", "error",
      "-show_streams",
      "-show_format",
      "-of", "json",
      filename,
    ], METADATA_TIMEOUT_MS);

    return JSON.parse(output);
  }

  private getDuration(metadata: Metadata): number | undefined {
    const duration = Number(metadata.format?.duration);
    return Number.isFinite(duration) && duration > 0 ? duration : undefined;
  }

  private async getOutputSizeMb(): Promise<number> {
    const stat = await fs.stat(this.output);
    return stat.size / 1_000_000;
  }

  private buildArguments(mode: Mode): string[] {
    const args = [
      "-hide_banner",
      "-nostdin",
      "-y",
      "-loglevel", "error",
      "-i", this.job.filePath,
      // Select the first real video (excluding cover art) and all audio streams.
      "-map", "0:V:0",
      "-map", "0:a?",
      "-map_metadata", "0",
    ];

    switch (mode) {
      case "copy":
        args.push("-c", "copy");
        break;

      case "copy-video":
        args.push("-c:v", "copy", "-c:a", "aac");
        break;

      case "transcode":
        args.push(
          "-c:v", "libx264",
          "-crf", "25",
          "-profile:v", "high",
          "-level:v", "4.2",
          "-pix_fmt", "yuv420p",
          "-preset", "medium",
          "-threads", String(env.THREADS),
          "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
          "-c:a", "aac"
        );
        break;
    }

    args.push(
      "-max_muxing_queue_size", "4096",
      "-movflags", "+faststart",
      "-progress", "pipe:1",
      "-nostats",
      this.output
    );

    return args;
  }

  private createProgressHandler(duration?: number): (chunk: string) => void {
    let pending = "";
    let notifying = false;

    return (chunk: string) => {
      // Process output chunks can end halfway through a key=value line.
      pending += chunk;
      const lines = pending.split("\n");
      pending = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("out_time_us=") || notifying) continue;

        const seconds = Number(line.slice("out_time_us=".length)) / 1_000_000;
        const percent = duration && Number.isFinite(seconds)
          ? Math.max(0, Math.min(100, seconds / duration * 100))
          : undefined;

        // A slow Telegram status update must not block FFmpeg's output pipe.
        notifying = true;
        void Promise.resolve()
          .then(() => this.hooks.onProgress?.(
            { percent },
            FfmpegConverter.generateProgress(percent)
          ))
          .catch(error => console.warn("Progress notification failed", error))
          .finally(() => {
            notifying = false;
          });
      }
    };
  }

  private async convert(mode: Mode, duration?: number): Promise<void> {
    const configuredLimit = Number(process.env.TIMELIMIT || 900);
    const limitSeconds = Number.isFinite(configuredLimit) && configuredLimit > 0
      ? configuredLimit
      : 900;

    console.info("FFmpeg processing", { mode, messageId: this.job.messageId });

    await runProcess(
      "ffmpeg",
      this.buildArguments(mode),
      limitSeconds * 1000,
      this.createProgressHandler(duration)
    );
  }

  private async convertWithFallback(duration?: number): Promise<void> {
    // Let the installed MP4 muxer decide what it can preserve. An audio-only
    // retry avoids re-encoding video when the audio caused the remux failure.
    const modes: Mode[] = this.job.remuxEnabled
      ? ["copy", "copy-video", "transcode"]
      : ["transcode"];

    for (const mode of modes) {
      try {
        await this.convert(mode, duration);

        if (await this.getOutputSizeMb() > env.API_SIZE_LIMIT_MB) {
          if (mode !== "transcode") continue;
          throw new BigOutputError();
        }

        return;
      } catch (error) {
        // Timeouts and infrastructure failures are not codec incompatibilities.
        if (mode === "transcode" || !(error instanceof ProcessError) || error.timedOut) {
          throw error;
        }

        console.warn("MP4 stream copy failed; trying conversion", {
          mode,
          stderr: error.stderr,
        });
      }
    }
  }

  private async createThumbnail(outputMetadata: Metadata): Promise<string | undefined> {
    try {
      await this.hooks.onThumbnailStart?.();

      const filename = path.join(this.job.dir, "thumbnail.jpg");
      const duration = Number(outputMetadata.format?.duration);
      const timestamp = Number.isFinite(duration) ? duration / 2 : 0;

      await runProcess("ffmpeg", [
        "-hide_banner",
        "-nostdin",
        "-y",
        "-loglevel", "error",
        "-ss", String(timestamp),
        "-i", this.output,
        "-map", "0:V:0",
        "-frames:v", "1",
        "-vf", "scale=320:320:force_original_aspect_ratio=decrease",
        filename,
      ], THUMBNAIL_TIMEOUT_MS);

      const thumbnail = await fs.stat(filename);
      if (thumbnail.size > 0 && thumbnail.size < MAX_THUMBNAIL_BYTES) {
        return filename;
      }
    } catch (error) {
      // Thumbnails are optional: their failure must not discard a valid video.
      console.warn("Thumbnail generation failed", error);
    }

    return undefined;
  }

  private mapError(error: unknown): Error {
    if (error instanceof NotAVideoError ||
        error instanceof BigOutputError ||
        error instanceof ConvertError) {
      return error;
    }

    console.error("Video processing failed", error);

    if (error instanceof ProcessError) {
      if (error.timedOut) return new TimeoutError();
      if (error.stderr.includes("Invalid data found")) return new NotAVideoError();
    }

    return new ConvertError();
  }

  async run(): Promise<ConvertResult> {
    try {
      const inputMetadata = await this.probe(this.job.filePath);
      const hasVideo = inputMetadata.streams.some(stream =>
        stream.codec_type === "video" && !stream.disposition?.attached_pic
      );

      if (!hasVideo) throw new NotAVideoError();

      const inputDuration = this.getDuration(inputMetadata);
      await this.convertWithFallback(inputDuration);

      const outputMetadata = await this.probe(this.output);
      if (!outputMetadata.streams.some(stream => stream.codec_type === "video")) {
        throw new ConvertError();
      }

      const sizeMb = await this.getOutputSizeMb();
      const thumbPath = sizeMb >= THUMBNAIL_THRESHOLD_MB
        ? await this.createThumbnail(outputMetadata)
        : undefined;

      return {
        outputPath: this.output,
        thumbPath,
        sizeMb,
        durationSeconds: this.getDuration(outputMetadata) ?? inputDuration,
      };
    } catch (error) {
      throw this.mapError(error);
    }
  }
}
