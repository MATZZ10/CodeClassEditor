import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/authStore";
import { spawn } from "child_process";
import { writeFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Store active processes untuk cleanup
const activeProcesses = new Map<string, any>();

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { files } = await request.json();
    
    console.log("Starting execution for user:", user.id);
    console.log("Files to compile:", files.map((f: any) => f.name));

    // Create temp directory
    const tempDir = join(tmpdir(), `ccs-${Date.now()}-${Math.random().toString(36)}`);
    await mkdir(tempDir, { recursive: true });
    console.log("Temp directory created:", tempDir);

    // Write all files
    for (const file of files) {
      const filePath = join(tempDir, file.name);
      const dir = filePath.substring(0, filePath.lastIndexOf("/"));
      await mkdir(dir, { recursive: true });
      await writeFile(filePath, file.content);
      console.log("File written:", filePath);
    }

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (type: string, data: any) => {
          const message = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        };

        try {
          // Find main cpp file
          const mainFile = files.find((f: any) => f.name.endsWith(".cpp"))?.name;
          if (!mainFile) {
            sendEvent("error", { message: "No .cpp file found" });
            controller.close();
            return;
          }

          sendEvent("status", { message: "Compiling..." });

          // Compile
          const outputName = "program";
          const compileProcess = spawn("g++", [
            join(tempDir, mainFile),
            "-o",
            join(tempDir, outputName),
            "-std=c++17",
            "-Wall",
            "-Wextra"
          ]);

          let compileOutput = "";
          let compileError = "";

          compileProcess.stdout.on("data", (data) => {
            compileOutput += data.toString();
            if (data.toString().trim()) {
              sendEvent("compile_output", { output: data.toString() });
            }
          });

          compileProcess.stderr.on("data", (data) => {
            compileError += data.toString();
            sendEvent("compile_error", { error: data.toString() });
          });

          await new Promise((resolve) => {
            compileProcess.on("close", (code) => {
              if (code !== 0) {
                sendEvent("error", { 
                  message: "Compilation failed",
                  details: compileError || compileOutput 
                });
                controller.close();
                resolve(null);
              } else {
                sendEvent("status", { message: "Compilation successful, running..." });
                resolve(null);
              }
            });
          });

          if (compileProcess.exitCode !== 0) {
            // Cleanup
            await rm(tempDir, { recursive: true, force: true });
            controller.close();
            return;
          }

          // Run program
          const runProcess = spawn(join(tempDir, outputName));
          const processId = `${user.id}-${Date.now()}`;
          activeProcesses.set(processId, { process: runProcess, tempDir });

          sendEvent("status", { message: "Program running, waiting for input..." });
          sendEvent("ready", { message: "Program is ready" });

          // Handle stdout
          runProcess.stdout.on("data", (data) => {
            const output = data.toString();
            console.log("Program output:", output);
            sendEvent("output", { data: output });
          });

          // Handle stderr
          runProcess.stderr.on("data", (data) => {
            const error = data.toString();
            console.log("Program error:", error);
            sendEvent("error_output", { data: error });
          });

          // Handle process exit
          runProcess.on("close", async (code) => {
            console.log("Program exited with code:", code);
            sendEvent("exit", { code });
            sendEvent("done", { message: "Execution finished" });
            
            // Cleanup
            activeProcesses.delete(processId);
            await rm(tempDir, { recursive: true, force: true });
            controller.close();
          });

          // Store controller untuk input
          activeProcesses.set(processId, { 
            process: runProcess, 
            tempDir, 
            controller,
            sendEvent 
          });

        } catch (error: any) {
          console.error("Execution error:", error);
          sendEvent("error", { message: error.message });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
      },
    });

  } catch (error: any) {
    console.error("Request error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// Handle input ke program yang sedang berjalan
export async function PUT(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { input } = await request.json();
    console.log("Received input for user:", user.id, "Input:", input);

    // Find active process for this user
    for (const [id, data] of activeProcesses.entries()) {
      if (id.startsWith(user.id) && data.process) {
        console.log("Sending input to process:", id);
        data.process.stdin.write(input + "\n");
        
        // Send event that input was received
        if (data.sendEvent) {
          data.sendEvent("input_received", { input });
        }
        
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ error: "No active process" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Input error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}