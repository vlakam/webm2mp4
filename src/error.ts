import { i18n } from "./middlewares";
import { BaseJob } from "./types";
import { editJobMessageText } from "@/utils";

abstract class BotError extends Error {
  constructor(message: string | undefined, readonly i18n: string) {
    super(message);
    this.message = message || "";
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

class NotAVideoError extends BotError {
  constructor(message?: string) {
    super(message, "download_url.error.not_a_video");
  }
}

class TimeoutError extends BotError {
  constructor(message?: string) {
    super(message, "timeout");
  }
}

class DownloadError extends BotError {
  constructor(message?: string) {
    super(message, "download_url.error.download");
  }
}

class SizeError extends BotError {
  constructor(message?: string) {
    super(message, "download_url.error.size");
  }
}

class ConvertError extends BotError {
  constructor(message?: string) {
    super(message, "convert.error");
  }
}

class BigOutputError extends BotError {
  constructor(message?: string) {
    super(message, "convert.big_output");
  }
}

const processError = async (err: unknown, job: BaseJob): Promise<void> => {
  console.error("Job failed", err);
  const key = err instanceof BotError ? err.i18n : "error";

  await editJobMessageText(job, i18n.t(job.locale, key), {
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
};

export {
  processError,
  NotAVideoError,
  BigOutputError,
  ConvertError,
  SizeError,
  DownloadError,
  TimeoutError,
};
