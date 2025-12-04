import ffmpeg, { FfmpegCommand, FfprobeData } from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import { Deferred, MODE } from "@/utils";
import { BigOutputError, ConvertError, NotAVideoError } from "@/error";
import { ConvertJob } from "@/types";
import { env } from "@/env";

export type FfmpegProgress = {
  frames: number;
  currentFps: number;
  currentKbps: number;
  targetSize: number;
  timemark: string;
  percent?: number | undefined;
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

class FfmpegConverter {
  job: ConvertJob;
  output: string;
  input: string;
  ffmpeg: FfmpegCommand;
  deferred: Deferred<ConvertResult>;
  hooks: ConverterHooks = {};
  thumbPath?: string;

  constructor(job: ConvertJob, hooks: ConverterHooks = {}) {
    this.job = job;
    this.hooks = hooks;

    const baseName = path.basename(job.filePath, path.extname(job.filePath));
    this.output = path.join(job.dir, `${baseName}.mp4`);
    this.input = job.filePath;
    this.ffmpeg = ffmpeg(this.input).output(this.output);
    this.deferred = new Deferred<ConvertResult>();

    this.setOutputOptions();
    this.ffmpeg
      .on("start", this.onStart.bind(this))
      .on("stderr", this.onStdErr.bind(this))
      .on("end", this.onEnd.bind(this))
      .on("progress", this.onProgress.bind(this))
      .on("error", this.onError.bind(this));
  }

  setHooks(hooks: ConverterHooks): void {
    this.hooks = { ...this.hooks, ...hooks };
  }

  static generateProgress(currentProgress: number | undefined): string {
    const progressTick = "🔸";
    const inProgressTick = "🔹";
    let bar = "";
    let ticksCount = Math.floor((currentProgress || 0) / 10);
    if (ticksCount > 10) {
      ticksCount = 10;
    }
    for (let i = 0; i < ticksCount; i++) {
      bar += progressTick;
    }
    for (let i = ticksCount; i < 10; i++) {
      bar += inProgressTick;
    }
    return bar;
  }

  setOutputOptions(): void {
    this.ffmpeg
      .videoCodec("libx264")
      .outputOption("-crf 25")
      .outputOption("-profile:v high")
      .outputOption("-level 4.2")
      .outputOption("-max_muxing_queue_size", "4096")
      .outputOption("-pix_fmt", "yuv420p")
      .outputOption("-preset medium")
      .outputOption(`-threads ${process.env.THREADS || 2}`)
      .outputOption("-map V:0?")
      .outputOption("-map 0:a?")
      .outputOption(`-timelimit ${process.env.TIMELIMIT || 900}`)
      .outputOption("-movflags +faststart")
      .outputOption("-strict", "-2")
      .outputOption("-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2");
  }

  onStart(commandLine: string): void {
    console.log(`Starting FFmpeg with command: ${commandLine}`);
  }

  onStdErr(stderrLine: string): void {
    if (MODE === "develop") {
      console.error(`Stderr output: ${stderrLine}`);
    }
  }

  createThumb(): Promise<void> {
    return new Promise((resolve) => {
      const thumbName = `${path.basename(this.output)}.jpg`;
      const thumbPath = path.join(this.job.dir, thumbName);
      ffmpeg(this.output)
        .screenshots({
          timestamps: ["50%"],
          filename: thumbName,
          folder: this.job.dir,
          // scale:
          //   "if(gt(iw,ih),90,trunc(oh*a/2)*2):if(gt(iw,ih),trunc(ow/a/2)*2,90)",
        })
        .on("end", () => {
          this.thumbPath = thumbPath;
          resolve();
        });
    });
  }

  onError(error: Error): void {
    const errStr = error.toString();
    console.error(error);

    if (errStr.includes("Invalid data found when processing input")) {
      this.deferred.reject(new NotAVideoError());
    } else {
      this.deferred.reject(new ConvertError());
    }
  }

  async onEnd(): Promise<void> {
    const videoStat = fs.statSync(this.output);
    const fileSizeInBytes = videoStat.size;
    const fileSizeInMegabytes = fileSizeInBytes / 1000000.0;

    if (fileSizeInMegabytes > env.API_SIZE_LIMIT_MB) {
      return this.deferred.reject(new BigOutputError());
    }

    if (fileSizeInMegabytes >= 10) {
      await this.hooks.onThumbnailStart?.();
      await this.createThumb();
    }

    let durationSeconds: number | undefined;
    try {
      const metadata = await this.getMetadata(this.output);
      const duration = metadata.format?.duration;
      if (duration !== undefined) {
        durationSeconds = Number(duration);
      }
    } catch (err) {
      if (MODE === "develop") {
        console.warn("ffprobe failed to read metadata", err);
      }
    }

    this.deferred.resolve({
      outputPath: this.output,
      thumbPath: this.thumbPath,
      sizeMb: fileSizeInMegabytes,
      durationSeconds,
    });
  }

  private async getMetadata(filePath: string): Promise<FfprobeData> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          resolve(metadata);
        }
      });
    });
  }

  async onProgress(progress: FfmpegProgress): Promise<void> {
    const bar = FfmpegConverter.generateProgress(progress.percent);
    await this.hooks.onProgress?.(progress, bar);
  }

  run(): Promise<ConvertResult> {
    this.ffmpeg.run();
    return this.deferred.getPromise();
  }
}

export default FfmpegConverter;
