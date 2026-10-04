import { spawn } from "child_process";

export class ProcessError extends Error {
  constructor(message: string, readonly stderr: string, readonly timedOut = false) {
    super(message);
  }
}

export function runProcess(
  command: string,
  args: string[],
  timeoutMs: number,
  onOutput?: (chunk: string) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let overflow = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      if (onOutput) {
        onOutput(chunk);
      } else if (stdout.length + chunk.length <= 4 * 1024 * 1024) {
        stdout += chunk;
      } else {
        overflow = true;
        child.kill("SIGKILL");
      }
    });

    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-65536);
    });

    child.on("error", error => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);

      if (code === 0 && !timedOut && !overflow) {
        resolve(stdout);
        return;
      }

      const reason = timedOut
        ? "timeout"
        : overflow ? "output too large" : signal || code;

      reject(new ProcessError(`${command} failed (${reason})`, stderr, timedOut));
    });
  });
}
