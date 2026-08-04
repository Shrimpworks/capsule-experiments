import fs from "node:fs";

const buffer = Buffer.alloc(64);
try {
  const length = fs.readSync(9, buffer, 0, buffer.length, null);
  console.log(
    JSON.stringify({ inheritedFd: "allowed", value: buffer.subarray(0, length).toString() }),
  );
} catch (error) {
  console.log(
    JSON.stringify({
      inheritedFd: "denied",
      error: error instanceof Error ? `${error.name}:${error.message}` : typeof error,
    }),
  );
}
