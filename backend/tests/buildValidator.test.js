import test from 'node:test';
import assert from 'node:assert/strict';
import { collectBuildWarnings, estimatePower } from '../engine/buildValidator.js';
import { deps, part } from './helpers.js';

const gamingIntent = { use_case: 'gaming', budget_bdt: 80000, component_strategy: {} };

const am4Build = () => ({
  Processor: part('Processor', 'AMD Ryzen 5 5600 Processor AM4', 14200),
  Motherboard: part('Motherboard', 'Gigabyte B450M DS3H AM4 DDR4 Motherboard', 8000),
  RAM: part('RAM', 'Corsair Vengeance 16GB DDR4 3200MHz', 5200),
  PSU: part('PSU', 'Corsair CV650 650W', 7000),
});

test('compatible AM4 build produces no warnings', () => {
  assert.deepEqual(collectBuildWarnings({ build: am4Build(), intent: gamingIntent }, deps), []);
});

test('CPU/motherboard socket mismatch is flagged INCOMPATIBLE', () => {
  const build = am4Build();
  build.Motherboard = part('Motherboard', 'Gigabyte B650M Gaming AM5 DDR5 Motherboard', 17500);

  const warnings = collectBuildWarnings({ build, intent: gamingIntent }, deps);

  assert.ok(warnings.some((w) => w.includes('INCOMPATIBLE') && w.includes('socket')), warnings.join('\n'));
});

test('an unrecognised CPU socket is an unverified note, never a false INCOMPATIBLE', () => {
  const build = am4Build();
  // A name spec inference cannot place on any socket
  build.Processor = part('Processor', 'Contoso Quantum Processor QX-9', 6200);
  assert.equal(build.Processor.specs.socket, 'UNKNOWN');

  const warnings = collectBuildWarnings({ build, intent: gamingIntent }, deps);

  assert.ok(warnings.every((w) => !w.includes('INCOMPATIBLE')), warnings.join('\n'));
  assert.ok(warnings.some((w) => w.includes("Couldn't confirm")), warnings.join('\n'));
});

test('RAM type mismatch is flagged INCOMPATIBLE', () => {
  const build = am4Build();
  build.RAM = part('RAM', 'Kingston Fury 16GB DDR5 5200MHz', 9000);

  const warnings = collectBuildWarnings({ build, intent: gamingIntent }, deps);

  assert.ok(warnings.some((w) => w.includes('INCOMPATIBLE') && w.includes('RAM type')), warnings.join('\n'));
});

test('an undersized PSU for a high-end GPU is warned about', () => {
  const build = am4Build();
  build['Graphics Card'] = part('Graphics Card', 'ASUS GeForce RTX 4090 24GB', 300000);
  build.PSU = part('PSU', 'Generic 450W', 3000);

  const warnings = collectBuildWarnings({ build, intent: gamingIntent }, deps);

  assert.ok(warnings.some((w) => w.startsWith('PSU (450W) may be insufficient')), warnings.join('\n'));
});

test('requested storage that was not met is reported', () => {
  const build = am4Build();
  build.Storage = part('Storage', 'Kingston NV2 500GB NVMe SSD', 4500);
  const intent = { ...gamingIntent, component_strategy: { Storage: { structured_reqs: { min_tb: 2 } } } };

  const warnings = collectBuildWarnings({ build, intent }, deps);

  assert.ok(warnings.some((w) => w.includes('requested 2TB storage')), warnings.join('\n'));
});

test('estimatePower sums CPU + GPU + base draw and rounds PSU recommendation to 50W', () => {
  const build = am4Build();
  build['Graphics Card'] = part('Graphics Card', 'MSI GeForce RTX 4060 8GB', 38000);

  const power = estimatePower(build, gamingIntent, deps);

  // Ryzen 5 = 65W, RTX 4060 = 160W, motherboard baseline = 45W
  assert.equal(power.draw, 65 + 160 + 45);
  assert.equal(power.recommended % 50, 0);
  assert.ok(power.recommended >= power.draw);
  assert.equal(power.psuWattage, 650);
  assert.equal(power.loadPct, Math.round((270 / 650) * 100));
});

test('estimatePower without a PSU reports zero load instead of dividing by zero', () => {
  const build = am4Build();
  delete build.PSU;

  const power = estimatePower(build, gamingIntent, deps);

  assert.equal(power.psuWattage, 0);
  assert.equal(power.loadPct, 0);
});
