import test from 'node:test';
import assert from 'node:assert/strict';
import { findAlternatives } from '../engine/alternatives.js';
import { compatibilityChecker, budgetAllocator, part } from './helpers.js';

const intent = { use_case: 'gaming', budget_bdt: 80000 };

const baseBuild = () => ({
  Processor: part('Processor', 'AMD Ryzen 5 5600 Processor AM4', 14200),
  Motherboard: part('Motherboard', 'Gigabyte B450M DS3H AM4 DDR4 Motherboard', 8000),
  RAM: part('RAM', 'Corsair Vengeance 16GB DDR4 3200MHz', 5200),
  PSU: part('PSU', 'Corsair CV650 650W', 7000),
});

const repoReturning = (catalog) => ({
  query: async (_site, category) => catalog.filter((p) => p.category === category),
});

const run = (category, build, catalog, extra = {}) =>
  findAlternatives(
    { category, site: 'startech', build, intent, ...extra },
    { partRepository: repoReturning(catalog), compatibilityChecker, budgetAllocator }
  );

test('motherboard alternatives keep the CPU socket and RAM type, and exclude the current board', async () => {
  const build = baseBuild();
  const catalog = [
    build.Motherboard,
    part('Motherboard', 'MSI B550M Pro AM4 DDR4 Motherboard', 11000),
    part('Motherboard', 'ASRock A520M AM4 DDR4 Motherboard', 6500),
    part('Motherboard', 'Gigabyte B650M Gaming AM5 DDR5 Motherboard', 17500),
    part('Motherboard', 'MSI PRO B760M LGA1700 DDR4 Motherboard', 12000),
  ];

  const result = await run('Motherboard', build, catalog);

  assert.deepEqual(result.map((p) => p.name), [
    'ASRock A520M AM4 DDR4 Motherboard',
    'MSI B550M Pro AM4 DDR4 Motherboard',
  ]);
});

test('results are sorted cheapest first and carry the price delta vs the current part', async () => {
  const build = baseBuild();
  const catalog = [
    build.Motherboard,
    part('Motherboard', 'MSI B550M Pro AM4 DDR4 Motherboard', 11000),
    part('Motherboard', 'ASRock A520M AM4 DDR4 Motherboard', 6500),
  ];

  const result = await run('Motherboard', build, catalog);

  assert.deepEqual(result.map((p) => p.delta), [-1500, 3000]);
});

test('RAM alternatives must match the motherboard memory type', async () => {
  const build = baseBuild();
  const catalog = [
    build.RAM,
    part('RAM', 'G.Skill Ripjaws 16GB DDR4 3600MHz', 5800),
    part('RAM', 'Kingston Fury 16GB DDR5 5200MHz', 9000),
  ];

  const result = await run('RAM', build, catalog);

  assert.deepEqual(result.map((p) => p.name), ['G.Skill Ripjaws 16GB DDR4 3600MHz']);
});

test('PSU alternatives must cover the build power target', async () => {
  const build = baseBuild();
  build['Graphics Card'] = part('Graphics Card', 'ASUS GeForce RTX 4080 16GB', 180000);
  const catalog = [
    build.PSU,
    part('PSU', 'Tiny 350W', 2500),
    part('PSU', 'Seasonic 850W Gold', 14000),
  ];

  const result = await run('PSU', build, catalog);

  assert.deepEqual(result.map((p) => p.name), ['Seasonic 850W Gold']);
});

test('limit caps the number of alternatives, keeping the nearest in price', async () => {
  const build = baseBuild();
  const catalog = [build.Motherboard];
  for (let i = 1; i <= 6; i++) {
    catalog.push(part('Motherboard', `Board ${i} B450 AM4 DDR4 Motherboard`, 8000 + i * 1000));
  }

  const result = await run('Motherboard', build, catalog, { limit: 3 });

  assert.deepEqual(result.map((p) => p.price), [9000, 10000, 11000]);
});

test('with no current part there is no delta and the cheapest candidates are returned', async () => {
  const build = baseBuild();
  delete build.RAM;
  const catalog = [
    part('RAM', 'Corsair 16GB DDR4 3200MHz', 5200),
    part('RAM', 'Corsair 8GB DDR4 3200MHz', 3000),
  ];

  const result = await run('RAM', build, catalog);

  assert.deepEqual(result.map((p) => p.price), [3000, 5200]);
  assert.ok(result.every((p) => p.delta === null));
});
