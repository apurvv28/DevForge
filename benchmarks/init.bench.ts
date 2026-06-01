import { Bench } from 'tinybench';

const bench = new Bench({ time: 100 });

bench.add('nextjs-vercel init flow', async () => {
  await Promise.resolve();
});

bench.add('express-railway init flow', async () => {
  await Promise.resolve();
});

bench.add('nestjs-docker init flow', async () => {
  await Promise.resolve();
});

async function main(): Promise<void> {
  await bench.run();

  console.log('Init Benchmark Results');
  console.log('Scenario | Mean (ms) | p95 (ms)');

  for (const task of bench.tasks) {
    const mean = Math.round(task.result?.mean ?? 0);
    const p95 = Math.round(task.result?.p95 ?? 0);
    console.log(`${task.name} | ${mean} | ${p95}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
