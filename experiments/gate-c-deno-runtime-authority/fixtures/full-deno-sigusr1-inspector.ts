await new Promise((resolve) => setTimeout(resolve, 750));
Deno.kill(Deno.pid, "SIGUSR1");
await new Promise((resolve) => setTimeout(resolve, 500));
console.log(JSON.stringify({ reachedCompletion: true }));
