import { NextRequest, NextResponse } from "next/server";
import { diagnoseCppError } from "@/utils/errorDiagnostic";
import { getUserFromRequest } from "@/lib/authStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PISTON_BASE_URL = process.env.PISTON_BASE_URL;
const CPP_RUNNER_URL = process.env.CPP_RUNNER_URL;

type RunnerResponse = {
  ok: boolean;
  phase?: "compile" | "run";
  output?: string;
  stdout?: string;
  stderr?: string;
  error?: string;
};

type PistonStage = {
  stdout?: string;
  stderr?: string;
  output?: string;
  code?: number | null;
  signal?: string | null;
};

type PistonExecuteResponse = {
  language?: string;
  version?: string;
  compile?: PistonStage;
  run?: PistonStage;
  message?: string;
};

type EngineType = "piston" | "cpp-runner";

type AvailableEngine = {
  engine: EngineType;
  baseUrl: string;
  runtime?: { language: string; version: string };
};

async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 20000
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await response.text();
    const parsed = text ? JSON.parse(text) : null;
    if (!response.ok)
      throw new Error(parsed?.message || parsed?.error || `Error ${response.status}`);
    return parsed as T;
  } finally {
    clearTimeout(timer);
  }
}

async function checkPistonHealth(): Promise<AvailableEngine | null> {
  if (!PISTON_BASE_URL) return null;

  try {
    const result = await fetchJson<any>(
      `${PISTON_BASE_URL}/api/v2/runtimes`,
      {},
      5000
    );
    
    const cppRuntime = Array.isArray(result)
      ? result.find(
          (r: any) =>
            r.language === "cpp" ||
            r.language === "c++" ||
            (r.aliases && r.aliases.includes("cpp"))
        )
      : null;

    if (cppRuntime) {
      return {
        engine: "piston",
        baseUrl: PISTON_BASE_URL,
        runtime: {
          language: "cpp",
          version: cppRuntime.version || "*",
        },
      };
    }
    return null;
  } catch (error) {
    console.error("Piston health check failed:", error);
    return null;
  }
}

async function checkCppRunnerHealth(): Promise<AvailableEngine | null> {
  if (!CPP_RUNNER_URL) return null;

  try {
    const endpoints = [
      `${CPP_RUNNER_URL}/health`,
      `${CPP_RUNNER_URL}/api/health`,
      `${CPP_RUNNER_URL}/`,
    ];
    
    for (const endpoint of endpoints) {
      try {
        const result = await fetchJson<any>(endpoint, {}, 5000);
        
        if (result && (
          result.status === "ok" || 
          result.status === "healthy" ||
          result.ok === true ||
          result.ready === true
        )) {
          return {
            engine: "cpp-runner",
            baseUrl: CPP_RUNNER_URL,
          };
        }
        
        if (result && Object.keys(result).length > 0) {
          return {
            engine: "cpp-runner",
            baseUrl: CPP_RUNNER_URL,
          };
        }
      } catch (e) {
        continue;
      }
    }
    
    return null;
  } catch (error) {
    console.error("CPP Runner health check failed:", error);
    return null;
  }
}

async function getAvailableEngine(): Promise<AvailableEngine | null> {
  const piston = await checkPistonHealth();
  if (piston) return piston;

  const cppRunner = await checkCppRunnerHealth();
  if (cppRunner) return cppRunner;

  return null;
}

async function executeWithPiston(
  baseUrl: string,
  runtime: { language: string; version: string },
  payload: any
) {
  const result = await fetchJson<PistonExecuteResponse>(
    `${baseUrl}/api/v2/execute`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: runtime.language,
        version: runtime.version,
        files: payload.files,
        stdin: payload.stdin,
        compile_timeout: 10000,
        run_timeout: 5000,
      }),
    },
    30000
  );

  const stdout = (result.run?.stdout || "") + (result.compile?.stdout || "");
  const stderr =
    (result.compile?.stderr || "") +
    (result.run?.stderr || "") +
    (result.message || "");

  return {
    ok: true,
    engine: "piston" as const,
    phase:
      result.compile?.code !== 0 && result.compile?.code !== undefined
        ? ("compile" as const)
        : ("run" as const),
    stdout,
    stderr,
    output: stdout || stderr || "Program selesai tanpa output.",
    diagnostic: diagnoseCppError(stderr),
  };
}

async function executeWithCppRunner(baseUrl: string, body: unknown) {
  const result = await fetchJson<RunnerResponse>(
    `${baseUrl}/execute`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    30000
  );

  const stderr = result.stderr?.trim() || result.error?.trim() || "";
  const stdout = result.stdout?.trim() || "";
  const output =
    result.output?.trim() || stdout || stderr || "Program selesai tanpa output.";

  return {
    ok: true,
    engine: "cpp-runner" as const,
    phase: result.phase ?? ("run" as const),
    stdout,
    stderr,
    output,
    diagnostic: diagnoseCppError(stderr),
  };
}

export async function GET() {
  try {
    const piston = await checkPistonHealth();
    const cppRunner = await checkCppRunnerHealth();
    const selected = piston ?? cppRunner ?? null;

    return NextResponse.json({
      ok: Boolean(selected),
      status: selected ? "connected" : "disconnected",
      selectedEngine: selected?.engine ?? null,
      available: {
        piston: piston
          ? {
              online: true,
              baseUrl: piston.baseUrl,
              runtime: piston.runtime,
            }
          : {
              online: false,
              baseUrl: PISTON_BASE_URL ?? null,
            },
        cppRunner: cppRunner
          ? {
              online: true,
              baseUrl: cppRunner.baseUrl,
            }
          : {
              online: false,
              baseUrl: CPP_RUNNER_URL ?? null,
            },
      },
      priority: ["piston", "cpp-runner"],
      message: selected
        ? `Engine aktif: ${selected.engine}`
        : "Tidak ada execution engine yang aktif.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown engine error",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Login dulu bos." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const engine = await getAvailableEngine();

    if (!engine) {
      return NextResponse.json(
        { 
          ok: false, 
          error: "Tidak ada execution engine yang tersedia. Silakan coba lagi nanti.",
          engines: {
            piston: {
              configured: !!PISTON_BASE_URL,
              url: PISTON_BASE_URL,
            },
            cppRunner: {
              configured: !!CPP_RUNNER_URL,
              url: CPP_RUNNER_URL,
            },
          }
        },
        { status: 503 }
      );
    }

    let result;
    if (engine.engine === "piston") {
      result = await executeWithPiston(engine.baseUrl, engine.runtime!, body);
    } else if (engine.engine === "cpp-runner") {
      result = await executeWithCppRunner(engine.baseUrl, body);
    } else {
      throw new Error(`Unknown engine type`);
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Execution error:", error);
    return NextResponse.json(
      { 
        ok: false, 
        error: error.message || "Internal server error",
        diagnostic: diagnoseCppError(error.message || "")
      },
      { status: 500 }
    );
  }
}