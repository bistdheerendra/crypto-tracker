/**
 * Server-only: spawn ml/predict.py for display-time win probability.
 * Never persists — callers must not write the result to the DB.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { MlFeatureVector } from "./build-feature-vector";

export type MlEdge = {
  winProbability: number;
  modelVersion: string;
};

const TIMEOUT_MS = 10_000; // cold sklearn+joblib import on Windows often exceeds 3s
const PREDICT_SCRIPT = join(
  /* turbopackIgnore: true */ process.cwd(),
  "ml",
  "predict.py"
);
const MODEL_PATH = join(
  /* turbopackIgnore: true */ process.cwd(),
  "ml",
  "models",
  "baseline_classifier.joblib"
);

let resolvedInterpreter: string | null | undefined;

/**
 * Prefer python3, fall back to python. Cache the first working binary.
 * Logs which interpreter was chosen (or that none worked).
 */
function resolvePythonInterpreter(): string | null {
  if (resolvedInterpreter !== undefined) return resolvedInterpreter;

  for (const cmd of ["python3", "python"] as const) {
    try {
      const r = spawnSync(cmd, ["--version"], {
        encoding: "utf8",
        timeout: 2_000,
        windowsHide: true,
      });
      if (r.error) {
        console.warn(`[ml] interpreter probe failed for "${cmd}":`, {
          code: (r.error as NodeJS.ErrnoException).code,
          message: r.error.message,
        });
        continue;
      }
      if (r.status === 0) {
        const version = (r.stdout || r.stderr || "").trim();
        console.info(`[ml] using interpreter "${cmd}" (${version || "version ok"})`);
        resolvedInterpreter = cmd;
        return cmd;
      }
      console.warn(`[ml] interpreter "${cmd}" exited ${r.status}:`, {
        stdout: r.stdout?.trim(),
        stderr: r.stderr?.trim(),
      });
    } catch (err) {
      console.warn(
        `[ml] interpreter probe threw for "${cmd}":`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  console.error(
    "[ml] no usable Python interpreter (tried python3, then python)"
  );
  resolvedInterpreter = null;
  return null;
}

function parsePredictStdout(stdout: string): MlEdge | null {
  const line = stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .at(-1);
  if (!line) return null;
  try {
    const parsed = JSON.parse(line) as {
      winProbability?: unknown;
      modelVersion?: unknown;
      error?: unknown;
    };
    if (typeof parsed.error === "string") {
      console.warn("[ml] predict.py error:", parsed.error);
      return null;
    }
    if (
      typeof parsed.winProbability !== "number" ||
      !Number.isFinite(parsed.winProbability) ||
      typeof parsed.modelVersion !== "string"
    ) {
      console.warn("[ml] unexpected predict.py payload:", line.slice(0, 200));
      return null;
    }
    return {
      winProbability: parsed.winProbability,
      modelVersion: parsed.modelVersion,
    };
  } catch (err) {
    console.warn(
      "[ml] failed to parse predict.py stdout:",
      err instanceof Error ? err.message : String(err),
      line.slice(0, 200)
    );
    return null;
  }
}

/**
 * Display-only ML edge. Returns null on missing model, spawn failure, timeout,
 * or bad output — never throws to callers.
 */
export async function getMlEdge(
  features: MlFeatureVector
): Promise<MlEdge | null> {
  if (!existsSync(MODEL_PATH)) {
    console.warn("[ml] model missing, skipping edge:", MODEL_PATH);
    return null;
  }
  if (!existsSync(PREDICT_SCRIPT)) {
    console.warn("[ml] predict script missing:", PREDICT_SCRIPT);
    return null;
  }

  const python = resolvePythonInterpreter();
  if (!python) return null;

  return new Promise((resolve) => {
    let settled = false;
    let stdout = "";
    let stderr = "";

    const finish = (value: MlEdge | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    let child;
    try {
      child = spawn(python, [PREDICT_SCRIPT], {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        env: process.env,
      });
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      console.error("[ml] spawn threw:", {
        interpreter: python,
        code: e.code,
        message: e.message,
      });
      finish(null);
      return;
    }

    const timer = setTimeout(() => {
      console.warn(`[ml] predict timed out after ${TIMEOUT_MS}ms — killing`);
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
      finish(null);
    }, TIMEOUT_MS);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      console.error("[ml] child process error:", {
        interpreter: python,
        code: err.code,
        message: err.message,
      });
      finish(null);
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (stderr.trim()) {
        console.warn("[ml] predict.py stderr:", stderr.trim().slice(0, 500));
      }
      if (code !== 0) {
        console.warn("[ml] predict.py exited non-zero:", {
          code,
          signal,
          stdout: stdout.trim().slice(0, 300),
        });
        // Still try to parse JSON error line for logging
        parsePredictStdout(stdout);
        finish(null);
        return;
      }
      finish(parsePredictStdout(stdout));
    });

    try {
      child.stdin.write(JSON.stringify(features), "utf8");
      child.stdin.end();
    } catch (err) {
      clearTimeout(timer);
      console.error(
        "[ml] failed writing stdin:",
        err instanceof Error ? err.message : String(err)
      );
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
      finish(null);
    }
  });
}
