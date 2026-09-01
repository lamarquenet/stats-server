// tests/benchmarkText.test.js — valida el input largo del benchmark
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const TEXT_FILE = path.join(__dirname, '..', 'assets', 'benchmark-text.txt');

test('el texto del benchmark existe y tiene exactamente 5000 palabras', () => {
  assert.ok(fs.existsSync(TEXT_FILE), `falta ${TEXT_FILE}`);
  const words = fs.readFileSync(TEXT_FILE, 'utf8').trim().split(/\s+/);
  assert.strictEqual(words.length, 5000, `tiene ${words.length} palabras, esperaba 5000`);
});

test('benchmarkService usa ese texto como prompt y expone un resumen compacto', () => {
  const service = require('../services/benchmarkService');
  const fileContent = fs.readFileSync(TEXT_FILE, 'utf8').trim();
  assert.strictEqual(service.BENCHMARK_PROMPT, fileContent);
  // El resumen es lo que viaja en resultados/config — no los 30KB del texto
  assert.ok(service.BENCHMARK_PROMPT_SUMMARY.length < 200, 'resumen demasiado largo');
  assert.match(service.BENCHMARK_PROMPT_SUMMARY, /5000/);
  assert.ok(!service.BENCHMARK_PROMPT_SUMMARY.includes(fileContent.slice(0, 80)));
});
