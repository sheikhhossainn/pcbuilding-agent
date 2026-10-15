import test from 'node:test';
import assert from 'node:assert/strict';
import { specInference } from './helpers.js';

// Names below are real listings that previously inferred as UNKNOWN.
const infer = (category, name) => specInference.inferSpecs(category, name);

test('Ryzen PRO APUs resolve to the right socket (previously UNKNOWN)', () => {
  const am4 = [
    'AMD Ryzen 5 Pro 2400GE Desktop Processor with Radeon RX Vega 11 Graphics',
    'AMD Ryzen 5 PRO 5650GE Processor with Radeon Graphics',
    'AMD Ryzen 5 PRO 5650G Processor with Radeon Graphics',
    'AMD Ryzen 7 PRO 5755G 3.8GHz Processor with Radeon Graphics',
  ];
  for (const name of am4) {
    const specs = infer('Processor', name);
    assert.equal(specs.socket, 'AM4', name);
    assert.equal(specs.ram_type, 'DDR4', name);
  }
});

test('non-PRO Ryzen detection is unchanged', () => {
  assert.equal(infer('Processor', 'AMD Ryzen 5 5600 Processor').socket, 'AM4');
  assert.equal(infer('Processor', 'AMD Ryzen 7 7700X Processor').socket, 'AM5');
  assert.equal(infer('Processor', 'AMD Ryzen 9 9950X Processor').socket, 'AM5');
});

test('newer and workstation motherboard chipsets are recognised', () => {
  assert.equal(infer('Motherboard', 'MSI PRO B840M-P WIFI6E AMD DDR5 mATX Motherboard').socket, 'AM5');
  assert.equal(infer('Motherboard', 'MSI PRO B840M-P WIFI6E AMD DDR5 mATX Motherboard').ram_type, 'DDR5');

  const h770 = infer('Motherboard', 'ASUS PRIME H770-PLUS DDR5 14th to 12th Gen ATX Motherboard');
  assert.equal(h770.socket, 'LGA1700');
  assert.equal(h770.ram_type, 'DDR5');

  assert.equal(infer('Motherboard', 'Asus TUF X299 MARK 2 LGA 2066 Motherboard').socket, 'LGA2066');
  assert.equal(infer('Motherboard', 'ASUS Pro WS TRX50-SAGE WIFI AMD sTR5 Workstation Motherboard').socket, 'sTR5');
  assert.equal(infer('Motherboard', 'MSI TRX40 Pro 10G sTRX4 ATX AMD Motherboard').socket, 'sTRX4');

  const old = infer('Motherboard', 'ARKTEK AK-G41M EL LGA775 Dual Channel DDR3 Micro-ATX Motherboard');
  assert.equal(old.socket, 'LGA775');
  assert.equal(old.ram_type, 'DDR3');
});

test('existing motherboard detection is unchanged', () => {
  assert.equal(infer('Motherboard', 'Gigabyte B450M DS3H AM4 DDR4 Motherboard').socket, 'AM4');
  assert.equal(infer('Motherboard', 'MSI PRO B760M-P LGA1700 DDR4 Motherboard').socket, 'LGA1700');
  assert.equal(infer('Motherboard', 'Some Unlabelled Board').socket, 'UNKNOWN');
});

test('RAM without a DDR keyword is classified from part number or speed', () => {
  assert.equal(infer('RAM', 'G.SKILL RIPJAWSV F4-3600C18D-16GVK 1.35V 8GB RAM 3600MHz').ram_type, 'DDR4');
  assert.equal(infer('RAM', 'G.SKILL Trident Z Neo 16GB 3600MHz RGB Ram').ram_type, 'DDR4');
  assert.equal(infer('RAM', 'APACER PANTHER-GOLDEN 8GB 3200MHZ GAMING DESKTOP RAM').ram_type, 'DDR4');
  assert.equal(infer('RAM', 'Some Kit 32GB 6000MHz').ram_type, 'DDR5');
  assert.equal(infer('RAM', 'G.SKILL F5-6000J3038F16GX2-TZ5RK 32GB').ram_type, 'DDR5');
});

test('explicit DDR keywords still win, and ambiguous RAM stays UNKNOWN', () => {
  assert.equal(infer('RAM', 'Corsair 16GB DDR5 3200MHz').ram_type, 'DDR5');
  assert.equal(infer('RAM', 'Old Kit 4GB 1333MHz').ram_type, 'UNKNOWN');
  assert.equal(infer('RAM', 'Mystery 16GB RAM').ram_type, 'UNKNOWN');
});

test('GPU brand: GT cards are NVIDIA, Intel Arc is its own brand', () => {
  assert.equal(infer('Graphics Card', 'MSI GT 710 2GD3H LP 2GB DDR3 Gaming Graphic Card').gpu_brand, 'nvidia');
  assert.equal(infer('Graphics Card', 'Asus GT710-SL-2GD5-BRK-EVO 2GB GDDR5 Graphics Card').gpu_brand, 'nvidia');
  assert.equal(infer('Graphics Card', 'GIGABYTE Intel Arc A380 GAMING OC 6G GDDR6 Graphics Card').gpu_brand, 'intel');
  assert.equal(infer('Graphics Card', 'SPARKLE INTEL ARC A380 ELF 6GB GDDR6 GRAPHICS CARD').gpu_brand, 'intel');
  assert.equal(infer('Graphics Card', 'MSI GeForce RTX 4060 8GB').gpu_brand, 'nvidia');
  assert.equal(infer('Graphics Card', 'Sapphire Radeon RX 7600 8GB').gpu_brand, 'amd');
});
