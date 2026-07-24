/**
 * Server-only ML win-probability for display.
 * Primary path: ONNX in-process (works on Vercel Node).
 * Optional fallback: Python spawn (local only).
 * Never persists — callers must not write the result to the DB.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { env, InferenceSession, Tensor } from "onnxruntime-web";
import {
  MODEL_FEATURE_COLUMNS,
  type ModelFeatureColumn,
} from "./encoding";
import type { MlFeatureVector } from "./build-feature-vector";

export type MlEdge = {
  winProbability: number;
  modelVersion: string;
};

// Vercel serverless tracing often drops ort-wasm*.mjs — load WASM from CDN.
env.wasm.numThreads = 1;
env.wasm.wasmPaths =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";


const MODELS_DIR = join(
  /* turbopackIgnore: true */ process.cwd(),
  "ml",
  "models"
);
const ONNX_PATH = join(MODELS_DIR, "baseline_classifier.onnx");
const MEDIANS_PATH = join(MODELS_DIR, "feature_medians.json");
const COLUMNS_PATH = join(MODELS_DIR, "feature_columns.json");
const PREDICT_SCRIPT = join(
  /* turbopackIgnore: true */ process.cwd(),
  "ml",
  "predict.py"
);
const PYTHON_TIMEOUT_MS = 10_000;

type ModelMeta = {
  feature_columns: string[];
  modelVersion: string;
};

let sessionPromise: Promise<InferenceSession | null> | null = null;
let medians: Record<string, number> | null = null;
let meta: ModelMeta | null = null;
let resolvedInterpreter: string | null | undefined;

function loadSidecars(): boolean {
  if (medians && meta) return true;
  if (!existsSync(ONNX_PATH) || !existsSync(MEDIANS_PATH) || !existsSync(COLUMNS_PATH)) {
    console.warn("[ml] ONNX artifacts missing:", {
      onnx: existsSync(ONNX_PATH),
      medians: existsSync(MEDIANS_PATH),
      columns: existsSync(COLUMNS_PATH),
      dir: MODELS_DIR,
    });
    return false;
  }
  try {
    medians = JSON.parse(readFileSync(MEDIANS_PATH, "utf8")) as Record<
      string,
      number
    >;
    meta = JSON.parse(readFileSync(COLUMNS_PATH, "utf8")) as ModelMeta;
    return true;
  } catch (err) {
    console.error(
      "[ml] failed reading ONNX sidecars:",
      err instanceof Error ? err.message : String(err)
    );
    return false;
  }
}

async function getSession(): Promise<InferenceSession | null> {
  if (!loadSidecars()) return null;
  if (!sessionPromise) {
    sessionPromise = InferenceSession.create(ONNX_PATH, {
      executionProviders: ["wasm"],
    }).catch((err) => {
      console.error(
        "[ml] ONNX session create failed:",
        err instanceof Error ? err.message : String(err)
      );
      sessionPromise = null;
      return null;
    });
  }
  return sessionPromise;
}

function vectorToFloat32(features: MlFeatureVector): Float32Array {
  const cols = meta?.feature_columns?.length
    ? meta.feature_columns
    : [...MODEL_FEATURE_COLUMNS];
  const out = new Float32Array(cols.length);
  for (let i = 0; i < cols.length; i++) {
    const col = cols[i]!;
    const raw = features[col as ModelFeatureColumn];
    if (raw == null || !Number.isFinite(raw)) {
      out[i] = medians?.[col] ?? 0;
    } else {
      out[i] = raw;
    }
  }
  return out;
}

function extractWinProbability(outputs: Tensor[]): number | null {
  // zipmap=False → typically [labels, probabilities] with probs shape [1, 2]
  for (const t of outputs) {
    const data = t.data;
    if (!(data instanceof Float32Array) && !Array.isArray(data)) continue;
    const arr = Array.from(data as ArrayLike<number>);
    if (arr.length >= 2 && arr.every((n) => Number.isFinite(n))) {
      // class-1 probability is usually index 1
      const p = arr.length === 2 ? arr[1]! : arr[arr.length - 1]!;
      if (p >= 0 && p <= 1) return p;
    }
  }
  return null;
}

async function predictOnnx(features: MlFeatureVector): Promise<MlEdge | null> {
  const session = await getSession();
  if (!session || !meta) return null;

  try {
    const inputName = session.inputNames[0] ?? "float_input";
    const floats = vectorToFloat32(features);
    const tensor = new Tensor("float32", floats, [1, floats.length]);
    const results = await session.run({ [inputName]: tensor });
    const tensors = session.outputNames.map((n) => results[n]!);
    const winProbability = extractWinProbability(tensors);
    if (winProbability == null) {
      console.warn(
        "[ml] could not parse ONNX outputs:",
        session.outputNames,
        tensors.map((t) => ({ dims: t.dims, len: t.data.length }))
      );
      return null;
    }
    return {
      winProbability,
      modelVersion: meta.modelVersion || "baseline_onnx",
    };
  } catch (err) {
    console.error(
      "[ml] ONNX predict failed:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

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
    } catch (err) {
      console.warn(
        `[ml] interpreter probe threw for "${cmd}":`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  resolvedInterpreter = null;
  return null;
}

function predictPython(features: MlFeatureVector): Promise<MlEdge | null> {
  const python = resolvePythonInterpreter();
  if (!python || !existsSync(PREDICT_SCRIPT)) return Promise.resolve(null);

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
      console.warn(`[ml] python predict timed out after ${PYTHON_TIMEOUT_MS}ms`);
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
      finish(null);
    }, PYTHON_TIMEOUT_MS);

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
        code: err.code,
        message: err.message,
      });
      finish(null);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (stderr.trim()) {
        console.warn("[ml] predict.py stderr:", stderr.trim().slice(0, 500));
      }
      if (code !== 0) {
        finish(null);
        return;
      }
      try {
        const line = stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);
        if (!line) {
          finish(null);
          return;
        }
        const parsed = JSON.parse(line) as {
          winProbability?: number;
          modelVersion?: string;
        };
        if (
          typeof parsed.winProbability === "number" &&
          Number.isFinite(parsed.winProbability) &&
          typeof parsed.modelVersion === "string"
        ) {
          finish({
            winProbability: parsed.winProbability,
            modelVersion: parsed.modelVersion,
          });
        } else {
          finish(null);
        }
      } catch {
        finish(null);
      }
    });

    try {
      child.stdin.write(JSON.stringify(features), "utf8");
      child.stdin.end();
    } catch {
      clearTimeout(timer);
      finish(null);
    }
  });
}

/**
 * Display-only ML edge. Returns null on failure — never throws to callers.
 * Prefers ONNX (Vercel-safe); falls back to Python spawn when available.
 */
export async function getMlEdge(
  features: MlFeatureVector
): Promise<MlEdge | null> {
  const onnx = await predictOnnx(features);
  if (onnx) return onnx;

  // Local/dev fallback only — Vercel Node has no Python.
  if (process.env.VERCEL) {
    console.warn("[ml] ONNX unavailable on Vercel — mlEdge skipped");
    return null;
  }
  return predictPython(features);
}
