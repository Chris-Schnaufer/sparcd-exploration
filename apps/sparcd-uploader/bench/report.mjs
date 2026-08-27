// Non-blocking timing report. `compare` renders this run's minimums against the
// rolling baseline of recent main-branch runs (markdown to results/report.md and
// $GITHUB_STEP_SUMMARY, a ::warning:: per clock that is >25% worse). `update`
// appends this run's minimums to the baseline, keeping the last 10 entries.
// The baseline file location comes from $BENCH_BASELINE_FILE (CI cache path).
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const benchDir = fileURLToPath(new URL('./', import.meta.url));
const summaryFile = path.join(benchDir, 'results', 'summary.json');
const baselineFile = process.env.BENCH_BASELINE_FILE || path.join(benchDir, 'results', 'baseline.json');
const WARN_PCT = 25;

const mode = process.argv[2];
if (mode !== 'compare' && mode !== 'update') {
  console.error('usage: report.mjs compare|update');
  process.exit(2);
}

const summary = JSON.parse(await readFile(summaryFile, 'utf8'));
const baseline = await readFile(baselineFile, 'utf8').then(JSON.parse).catch(() => ({ entries: [] }));

if (mode === 'update') {
  baseline.entries = [...baseline.entries, { sha: process.env.GITHUB_SHA ?? 'local', mins: summary.mins }].slice(-10);
  await writeFile(baselineFile, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`baseline updated: ${baseline.entries.length} entries`);
  process.exit(0);
}

const clocks = Object.keys(summary.mins);
const avg = (clock) => baseline.entries.reduce((sum, e) => sum + e.mins[clock], 0) / baseline.entries.length;
const lines = ['<!-- uploader-bench -->', '## Uploader timing (non-blocking)', ''];
if (baseline.entries.length === 0) {
  lines.push('No main-branch baseline available yet — timings shown without comparison.', '');
  lines.push('| Clock | This run (min of 3) |', '| --- | --- |');
  for (const clock of clocks) lines.push(`| ${clock} | ${summary.mins[clock]} ms |`);
} else {
  lines.push(`| Clock | This run (min of 3) | main avg (${baseline.entries.length} runs) | Δ |`, '| --- | --- | --- | --- |');
  for (const clock of clocks) {
    const base = avg(clock);
    const delta = ((summary.mins[clock] - base) / base) * 100;
    const flag = delta > WARN_PCT ? ' ⚠️' : '';
    lines.push(`| ${clock} | ${summary.mins[clock]} ms | ${Math.round(base)} ms | ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%${flag} |`);
    if (delta > WARN_PCT) {
      console.log(`::warning title=Uploader benchmark::${clock} is ${delta.toFixed(1)}% worse than the main-branch average (${summary.mins[clock]} ms vs ${Math.round(base)} ms). Timing on shared runners is noisy — treat as a signal, not proof.`);
    }
  }
}
lines.push('', 'Timings on shared runners are informational; the blocking gates are the exact object/request-profile checks and the catastrophic backstops.', '');

const markdown = lines.join('\n');
await writeFile(path.join(benchDir, 'results', 'report.md'), markdown);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown);
console.log(markdown);
