const source = "postMessage({ workerExecuted: true });";
const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
const worker = new Worker(url, { type: "module" });
const result = await new Promise((resolve, reject) => {
  worker.onmessage = (event) => resolve(event.data);
  worker.onerror = reject;
});
worker.terminate();
URL.revokeObjectURL(url);
console.log(JSON.stringify(result));
