#!/usr/bin/env node

import { spawn } from "node:child_process";
import { once } from "node:events";

const DEFAULT_PORT = 3210;
const port = Number(process.env.SMOKE_PORT ?? DEFAULT_PORT);
const baseUrl = `http://127.0.0.1:${port}`;
const startupTimeoutMs = 30_000;

const checks = [
  {
    label: "login page loads",
    path: "/login",
    expect: (response) => response.status === 200,
  },
  {
    label: "signup page loads",
    path: "/signup",
    expect: (response) => response.status === 200,
  },
  {
    label: "forgot password page loads",
    path: "/forgot-password",
    expect: (response) => response.status === 200,
  },
  {
    label: "update password page loads or safely redirects",
    path: "/update-password",
    expect: (response) => response.status === 200 || isLoginRedirect(response),
  },
  {
    label: "dashboard requires auth",
    path: "/dashboard",
    expect: isLoginRedirect,
  },
  {
    label: "setup requires auth",
    path: "/setup",
    expect: isLoginRedirect,
  },
  {
    label: "leads requires auth",
    path: "/leads",
    expect: isLoginRedirect,
  },
  {
    label: "billing requires auth",
    path: "/billing",
    expect: isLoginRedirect,
  },
];

function isLoginRedirect(response) {
  if (![302, 303, 307, 308].includes(response.status)) return false;

  const location = response.headers.get("location") ?? "";
  return location.includes("/login");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < startupTimeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/login`, { redirect: "manual" });
      if (response.status > 0) return;
    } catch {
      await wait(500);
    }
  }

  throw new Error(`Timed out waiting for ${baseUrl}. Run npm run build before npm run test:smoke.`);
}

function startServer() {
  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", `npm run start -- -p ${port}`]
      : ["run", "start", "--", "-p", String(port)];

  return spawn(command, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
}

async function runChecks() {
  for (const check of checks) {
    const response = await fetch(`${baseUrl}${check.path}`, {
      redirect: "manual",
      headers: {
        "user-agent": "FollowUpCRM-Smoke/1.0",
      },
    });

    if (!check.expect(response)) {
      const location = response.headers.get("location");
      throw new Error(
        `${check.label} failed: ${check.path} returned ${response.status}` +
          (location ? ` with location ${location}` : "")
      );
    }

    console.log(`PASS ${check.label}`);
  }
}

async function main() {
  console.log(`Starting production smoke server on ${baseUrl}`);
  const server = startServer();
  let stderr = "";

  server.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForServer();
    await runChecks();
    console.log("Smoke route checks passed. No provider sends were attempted.");
  } finally {
    await Promise.race([stopServer(server), wait(10_000)]);
  }

  void stderr;
}

async function stopServer(server) {
  if (!server.pid || server.exitCode !== null) return;

  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(server.pid), "/t", "/f"], {
      stdio: "ignore",
    });
    await Promise.race([once(killer, "close"), wait(5_000)]);
  } else {
    server.kill("SIGTERM");
  }

  await Promise.race([once(server, "close"), wait(5_000)]);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
  });
