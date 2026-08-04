import { readFile } from "node:fs/promises";

const options = Object.fromEntries(
  process.argv.slice(2).map((entry) => {
    const separator = entry.indexOf("=");
    return separator < 0 ? [entry, true] : [entry.slice(0, separator), entry.slice(separator + 1)];
  }),
);

process.stdout.on("error", (error) => {
  if (error.code === "EPIPE") process.exit(73);
  throw error;
});

async function writeAll(bytes, chunkBytes) {
  let backpressure = false;
  for (let offset = 0; offset < bytes.length; offset += chunkBytes) {
    const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + chunkBytes));
    if (!process.stdout.write(chunk)) {
      backpressure = true;
      await new Promise((resolve) => process.stdout.once("drain", resolve));
    }
  }
  process.stderr.write(`backpressure=${backpressure}\n`);
}

let bytes;
if (options.file) bytes = await readFile(options.file);
else bytes = Buffer.alloc(Number(options.bytes ?? 0), Number(options.fill ?? 0xa5));
if (options.cut !== undefined) bytes = bytes.subarray(0, Number(options.cut));
await writeAll(bytes, Number(options.chunk ?? 4096));

if (options.stall) {
  process.stderr.write("stalled=true\n");
  setInterval(() => {}, 60_000);
} else {
  process.stdout.end();
  process.stderr.end();
  process.stdout.unref?.();
  process.stderr.unref?.();
  process.exitCode = Number(options.exit ?? 0);
}
