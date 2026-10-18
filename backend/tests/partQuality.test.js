import test from 'node:test';
import assert from 'node:assert/strict';

import { qualityScore, qualityAxes, describeDifference } from '../utils/partQuality.js';
import { createPartRepository } from '../utils/partRepository.js';
import { createSpecInference } from '../utils/specInference.js';
import { createCacheManager } from '../utils/cacheManager.js';
import { part } from './helpers.js';

const score = (category, name, price = 10000) => qualityScore(category, part(category, name, price));
const better = (category, worseName, betterName, msg) =>
  assert.ok(score(category, betterName) > score(category, worseName), msg || `${betterName} should beat ${worseName}`);

test('PSU: wattage, efficiency and cabling each raise the score', () => {
  better('PSU', 'Antec 650W 80+ Bronze Non Modular', 'Antec 850W 80+ Bronze Non Modular', 'wattage');
  better('PSU', 'Antec 650W 80+ Bronze Non Modular', 'Antec 650W 80+ Gold Non Modular', 'efficiency');
  better('PSU', 'Antec 650W 80+ Gold Non Modular', 'Antec 650W 80+ Gold Fully Modular', 'cabling');
  better('PSU', 'Antec 650W 80+ Gold Semi Modular', 'Antec 650W 80+ Gold Full Modular', 'semi < full');
  better('PSU', 'Corsair 650W 80+ Platinum', 'Corsair 650W 80+ Titanium', 'platinum < titanium');
  better('PSU', 'Generic 750W Power Supply', 'Generic 750W 80+ White Power Supply', 'unrated < 80+');
});

test('PSU axes read what the name says', () => {
  const axes = Object.fromEntries(qualityAxes('PSU', part('PSU', 'MSI MPG A850G 850W 80 Plus Gold Fully Modular', 15000)).map((a) => [a.label, a.text]));
  assert.deepEqual(axes, { Wattage: '850W', Efficiency: '80+ Gold', Cabling: 'fully modular' });
  const plain = Object.fromEntries(qualityAxes('PSU', part('PSU', 'T-Wolf ATX 650W Power Supply Non Modular', 2950)).map((a) => [a.label, a.text]));
  assert.equal(plain.Cabling, 'non-modular');
  assert.equal(plain.Efficiency, 'unrated');
});

test('RAM: capacity, DDR generation and speed', () => {
  better('RAM', 'Netac 16GB DDR4 3200MHz Desktop RAM', 'Netac 32GB DDR4 3200MHz Desktop RAM');
  better('RAM', 'Netac 16GB DDR4 3200MHz Desktop RAM', 'Netac 16GB DDR5 5600MHz Desktop RAM');
  better('RAM', 'Netac 16GB DDR4 2666MHz Desktop RAM', 'Netac 16GB DDR4 3600MHz Desktop RAM');
});

test('Storage: capacity, type and PCIe generation', () => {
  better('Storage', 'Seagate Barracuda 2TB 7200rpm HDD', 'Netac 1TB SATA SSD');
  better('Storage', 'Netac 1TB SATA III SSD', 'Netac 1TB M.2 NVMe PCIe Gen3 SSD');
  better('Storage', 'Netac 1TB M.2 NVMe PCIe Gen3 SSD', 'Netac 1TB M.2 NVMe PCIe Gen4 SSD');
  better('Storage', 'Netac 1TB M.2 NVMe PCIe Gen4 SSD', 'Netac 2TB M.2 NVMe PCIe Gen4 SSD');
});

test('Monitor: resolution, refresh rate and panel', () => {
  better('Monitor', 'AOC 24" FHD 75Hz IPS Monitor', 'AOC 27" QHD 75Hz IPS Monitor');
  better('Monitor', 'AOC 27" QHD 165Hz IPS Monitor', 'AOC 27" 4K UHD 165Hz IPS Monitor');
  better('Monitor', 'AOC 24" FHD 75Hz IPS Monitor', 'AOC 24" FHD 144Hz IPS Monitor');
  better('Monitor', 'AOC 27" QHD 165Hz VA Monitor', 'AOC 27" QHD 165Hz IPS Monitor');
  better('Monitor', 'LG 27" QHD 165Hz IPS Monitor', 'LG 27" QHD 165Hz OLED Monitor');
});

test('Motherboard, cooler, UPS, GPU and keyboard have their own ladders', () => {
  better('Motherboard', 'Gigabyte A620M AM5 DDR5 Motherboard', 'Gigabyte B650M AM5 DDR5 Motherboard');
  better('Motherboard', 'Gigabyte B650M AM5 Motherboard', 'Gigabyte B650M WiFi AM5 Motherboard');
  better('CPU Cooler', 'Deepcool AK400 CPU Cooler', 'Deepcool AK620 Dual Tower CPU Cooler');
  better('CPU Cooler', 'Deepcool AK620 Dual Tower CPU Cooler', 'Deepcool LT520 240mm AIO Liquid Cooler');
  better('CPU Cooler', 'Deepcool LT520 240mm AIO Liquid Cooler', 'Deepcool LT720 360mm AIO Liquid Cooler');
  better('UPS', 'APC 650VA UPS', 'APC 1000VA UPS');
  better('UPS', 'Offline 1000VA UPS', 'Online 1000VA UPS');
  better('Graphics Card', 'Zotac GeForce RTX 3050 6GB', 'Zotac GeForce RTX 3060 12GB', 'vram');
  better('Keyboard', 'Generic Wired Keyboard', 'Redragon Mechanical Keyboard');
});

test('CPU, GPU and case fall back to price, other categories only use it to break ties', () => {
  assert.ok(score('Processor', 'Ryzen 5 5600', 15000) > score('Processor', 'Ryzen 5 5500', 11000));
  assert.ok(score('Casing', 'Case A', 9000) > score('Casing', 'Case B', 5000));
  // same PSU, dearer listing: tie-break only, far below one efficiency step
  const gap = score('PSU', 'Antec 650W 80+ Bronze', 9000) - score('PSU', 'Antec 650W 80+ Bronze', 5000);
  assert.ok(gap > 0 && gap < 1);
});

test('describeDifference lists only what differs, on the category terms', () => {
  const before = part('PSU', 'Antec 650W 80+ Bronze Non Modular', 5000);
  const after = part('PSU', 'Corsair 850W 80+ Gold Fully Modular', 12000);
  assert.deepEqual(describeDifference('PSU', before, after), [
    'Wattage 650W → 850W', 'Efficiency 80+ Bronze → 80+ Gold', 'Cabling non-modular → fully modular',
  ]);
  const sameWatts = part('PSU', 'Corsair 650W 80+ Gold Non Modular', 7000);
  assert.deepEqual(describeDifference('PSU', before, sameWatts), ['Efficiency 80+ Bronze → 80+ Gold']);
  assert.deepEqual(describeDifference('Casing', part('Casing', 'A', 1), part('Casing', 'B', 2)), []);
});

test('matchesStrategy honours better_than / worse_than on the category scale', () => {
  const repo = createPartRepository({ db: { execute: async () => ({ rows: [] }) }, specInference: createSpecInference(), cache: createCacheManager() });
  const current = part('PSU', 'Antec 650W 80+ Bronze Non Modular', 5000);
  const stronger = part('PSU', 'Corsair 850W 80+ Gold Fully Modular', 12000);
  const weaker = part('PSU', 'Generic 450W Power Supply', 1500);

  const up = { required: true, weight: 1, required_keywords: [], exclude_keywords: [], structured_reqs: { better_than: qualityScore('PSU', current) } };
  assert.equal(repo.matchesStrategy(stronger, up, 'PSU'), true);
  assert.equal(repo.matchesStrategy(weaker, up, 'PSU'), false);
  assert.equal(repo.matchesStrategy(current, up, 'PSU'), false, 'the same part is not "better"');

  const down = { ...up, structured_reqs: { worse_than: qualityScore('PSU', current) } };
  assert.equal(repo.matchesStrategy(weaker, down, 'PSU'), true);
  assert.equal(repo.matchesStrategy(stronger, down, 'PSU'), false);
});
