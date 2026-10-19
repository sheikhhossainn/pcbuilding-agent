import test from 'node:test';
import assert from 'node:assert/strict';
import { compareParts, findCounterpart, modelTokens } from '../utils/productIdentity.js';
import { createSpecInference } from '../utils/specInference.js';

const specInference = createSpecInference();
const part = (category, name, price = 1000) => ({ name, price, specs: specInference.inferSpecs(category, name) });
const compare = (category, a, b) => compareParts(category, part(category, a), part(category, b));

// Real listings: the same product as StarTech, TechLand and Ryans name it.
const SAME = {
  Processor: [
    ['Intel 12th Gen Core i5-12400F Alder Lake Processor', 'INTEL CORE I5 12400F 6 CORE 12 THREAD 12TH GEN PROCESSOR'],
    ['Intel 12th Gen Core i5-12400F Alder Lake Processor', 'Intel 12th Gen Alder Lake Core i5 12400F Processor (Without GPU-OEM/Tray)'],
    ['AMD Ryzen 5 5600 Processor', 'AMD Ryzen 5 5600 3.5GHz-4.4GHz 6 Core 35MB Cache AM4 Socket Processor (OEM/Tray)'],
    ['AMD Ryzen 5 5600GT AM4 Processor with Radeon Graphics', 'AMD Ryzen 5 5600GT 6 Core 12 Thread AM4 Processor With Radeon Graphics'],
  ],
  Motherboard: [
    ['Asus PRIME B760M-K D4 mATX Motherboard', 'ASUS PRIME B760M-K D4 DDR4 Intel Motherboard'],
    ['Asus PRIME B760M-K D4 mATX Motherboard', 'Asus PRIME B760M-K D4 LGA1700 mATX 14th intel Motherboard'],
    ['ASUS B760M-AYW WIFI D4 mATX Motherboard', 'ASUS B760M-AYW (Wi-Fi 6) DDR4 Intel Motherboard #B760M-AYW WIFI D4'],
    ['MSI PRO A620M-E AMD AM5 mATX Motherboard', 'MSI PRO A620M-E DDR5 AMD Motherboard'],
  ],
  RAM: [
    ['Netac Basic 16GB DDR4 3200MHz Desktop RAM', 'Netac Basic 16GB DDR4 3200MHz Desktop RAM #NTBSD4P32SP-16'],
    ['OCPC XT II DDR4 3200MHz 8GB Desktop RAM', 'OCPC XT II 8GB DDR4 3200MHz White Desktop RAM with Heatsink #MMX8GD432C16W'],
  ],
  'Graphics Card': [
    ['AFOX NVIDIA GeForce GTX 1050 Ti 4GB GDDR5 Graphics Card', 'AFOX GeForce GTX 1050 Ti Dual Fan 4GB GDDR5 Graphics Card #AF1050Ti-4096D5H7-V8'],
    ['GIGABYTE Intel Arc A310 WINDFORCE 4G GDDR6 Graphics Card', 'Gigabyte Intel Arc A310 WINDFORCE 4G 4GB GDDR6 Graphics Card #GV-IA310WF2-4GD'],
  ],
  Storage: [
    ['Netac N535S 120GB 2.5-inch SATAIII SSD', 'Netac N535S 120GB 2.5 Inch SATAIII SSD #NT01N535S-120G-S3X'],
    ['OCPC XTL-200 128GB SATA III SSD', 'OCPC XTL-200 128GB 2.5 Inch SATAIII SSD #SSD25S3T128GLT'],
    ['Netac N930ES 256GB M.2 NVMe PCIe 2242 SSD', 'Netac N930ES 256GB M.2 2242 PCIe 3.0 x2 NVMe SSD'],
  ],
  PSU: [
    ['MSI MAG A650BN 650W 80 Plus Bronze Power Supply', 'MSI MAG Series A650BN 650W ATX Non-Modular Power Supply'],
    ['T-Wolf PHANTOM P650 ATX 650W Power Supply', 'T-WOLF Phantom P650 650W ATX Black Power Supply'],
  ],
  Casing: [
    ['MaxGreen H6 M-ATX Case with 200W Standard PSU', 'MaxGreen H6 Mid Tower Black Micro-ATX Desktop Casing with Standard PSU'],
  ],
  Monitor: [
    ['PC Power PCGMX24F165B 23.8" 165Hz FHD IPS Gaming Monitor', 'PC Power PCGMX24F165B 23.8 Inch FHD IPS Display HDMI, DP Gaming Monitor'],
  ],
  'CPU Cooler': [
    ['Deepcool AG300 Single Tower Air CPU Cooler', 'DeepCool AG300 Single Tower Black Air CPU Cooler #R-AG300-BKNNMN-G'],
  ],
  UPS: [
    ['MaxGreen MG-LI-KSP 1200VA Offline UPS', 'MaxGreen MG-LI-KSP 1200VA Offline UPS'],
  ],
};

for (const [category, pairs] of Object.entries(SAME)) {
  test(`exact: the same ${category} named by different stores`, () => {
    for (const [a, b] of pairs) {
      assert.equal(compare(category, a, b), 'exact', `${a}  vs  ${b}`);
      assert.equal(compare(category, b, a), 'exact', `${b}  vs  ${a}`);
    }
  });
}

test('tricky CPU pairs are different processors', () => {
  assert.equal(compare('Processor', 'Intel Core i5-12400 Processor', 'Intel Core i5-12400F Processor'), null);
  assert.equal(compare('Processor', 'AMD Ryzen 5 5600 Processor', 'AMD Ryzen 5 5600X Processor'), null);
  assert.equal(compare('Processor', 'AMD Ryzen 7 5700X3D Processor', 'AMD Ryzen 7 5700X Processor'), null);
  assert.equal(compare('Processor', 'Intel Core Ultra 5 245K Processor', 'Intel Core Ultra 5 Processor 245K'), 'exact');
});

test('GPU: same chip and VRAM from another brand is equivalent; Ti or another VRAM size is not', () => {
  assert.equal(compare('Graphics Card',
    'Manli GeForce RTX 3050 6GB Nebula Twin V2 GDDR6 Graphics Card',
    'ZOTAC Gaming GeForce RTX 3050 Twin Edge OC 6GB GDDR6 Graphics Card'), 'equivalent');
  assert.equal(compare('Graphics Card', 'MSI GeForce RTX 4060 Ventus 2X 8GB', 'MSI GeForce RTX 4060 Ti Ventus 2X 8GB'), null);
  assert.equal(compare('Graphics Card', 'ASUS Dual RTX 3060 12GB', 'ASUS Dual RTX 3060 8GB'), null);
});

test('RAM: same size and generation at least as fast is equivalent; a different kit size of a model is not exact', () => {
  assert.equal(compare('RAM', 'Netac Basic 16GB DDR4 3200MHz', 'Kingston FURY Beast 16GB 3600MHz DDR4'), 'equivalent');
  assert.equal(compare('RAM', 'Netac Basic 16GB DDR4 3200MHz', 'Kingston FURY Beast 16GB 2666MHz DDR4'), null);
  assert.equal(compare('RAM', 'Netac Basic 16GB DDR4 3200MHz', 'Netac Basic 8GB DDR4 3200MHz'), null);
  assert.equal(compare('RAM', 'Corsair Vengeance 16GB (2x8GB) DDR4 3200MHz', 'Netac Basic 16GB DDR4 3200MHz'), 'equivalent');
  assert.equal(compare('RAM', 'Netac Shadow III 16GB DDR4 3200MHz', 'Netac Shadow 16GB DDR4 3200MHz'), 'equivalent');
});

test('storage: 500GB and 512GB are one tier, but NVMe is not swapped for SATA or an HDD', () => {
  assert.equal(compare('Storage', 'Lexar NM620 512GB M.2 2280 NVMe SSD', 'Samsung 980 500GB M.2 NVMe SSD'), 'equivalent');
  assert.equal(compare('Storage', 'Lexar NM620 512GB M.2 2280 NVMe SSD', 'Lexar NS100 512GB 2.5 inch SATA III SSD'), null);
  assert.equal(compare('Storage', 'Lexar NS100 512GB 2.5 inch SATA III SSD', 'Transcend 425S 512GB M.2 2242 SATAIII SSD'), null);
  assert.equal(compare('Storage', 'WD Blue 1TB 7200RPM HDD', 'Lexar NM620 1TB M.2 NVMe SSD'), null);
});

test('PSU: same or a bit more wattage at the same rating or better is equivalent', () => {
  assert.equal(compare('PSU', 'Antec CSK650 650W 80 Plus Bronze', 'Corsair CX650 650W 80 Plus Bronze'), 'equivalent');
  assert.equal(compare('PSU', 'Antec CSK650 650W 80 Plus Bronze', 'Corsair RM750e 750W 80 Plus Gold'), 'equivalent');
  assert.equal(compare('PSU', 'Antec CSK650 650W 80 Plus Bronze', 'Corsair CV550 550W 80 Plus Bronze'), null);
  assert.equal(compare('PSU', 'Antec CSK650 650W 80 Plus Bronze', 'Corsair HX1000 1000W 80 Plus Platinum'), null);
  assert.equal(compare('PSU', 'Antec G650 650W 80 Plus Gold', 'Antec CSK650 650W 80 Plus Bronze'), null);
});

test('boards: same chipset and memory generation is equivalent, a Wi-Fi board needs Wi-Fi', () => {
  assert.equal(compare('Motherboard', 'MSI PRO B760M-E DDR4 Motherboard', 'Gigabyte B760M DS3H DDR4 Motherboard'), 'equivalent');
  assert.equal(compare('Motherboard', 'MSI PRO B760M-E DDR4 Motherboard', 'Gigabyte B760M DS3H DDR5 Motherboard'), null);
  assert.equal(compare('Motherboard', 'ASUS B760M-AYW WIFI D4 Motherboard', 'Gigabyte B760M DS3H DDR4 Motherboard'), null);
  assert.equal(compare('Motherboard', 'MSI PRO H610M-S DDR4 Motherboard', 'MSI PRO H610M-E DDR4 Motherboard'), 'equivalent');
});

test('monitor: same size class and resolution, at least the refresh rate', () => {
  assert.equal(compare('Monitor', 'PC Power 23.8" 165Hz FHD IPS', 'Lenovo G24-20 24-Inch FHD 165Hz IPS Gaming Monitor'), 'equivalent');
  assert.equal(compare('Monitor', 'PC Power 23.8" 165Hz FHD IPS', 'Lenovo 24-Inch FHD 100Hz IPS Monitor'), null);
  assert.equal(compare('Monitor', 'PC Power 23.8" 165Hz FHD IPS', 'MSI 27 Inch QHD 165Hz Monitor'), null);
});

test('mouse and keyboard only ever match the same model', () => {
  assert.equal(compare('Mouse', 'Logitech G102 Lightsync Gaming Mouse', 'Logitech G102 LIGHTSYNC Wired Gaming Mouse Black'), 'exact');
  assert.equal(compare('Mouse', 'Logitech G102 Lightsync Gaming Mouse', 'Logitech G304 Wireless Gaming Mouse'), null);
});

test('modelTokens drops specs, colours and shop wording', () => {
  assert.deepEqual(modelTokens('Netac Shadow III 16GB DDR4 3200MHz Black Desktop RAM #NTSHD4P32SP-16K'), ['netac', 'shadow', 'iii']);
  assert.deepEqual(modelTokens('Asus PRIME B760M-K D4 LGA1700 mATX 14th intel Motherboard'), ['asus', 'prime', 'b760mk']);
});

test('findCounterpart: cheapest exact match wins; otherwise the equivalent nearest in price', () => {
  const ref = part('Processor', 'AMD Ryzen 5 5600 Processor', 12200);
  const exact = findCounterpart('Processor', ref, [
    part('Processor', 'AMD Ryzen 5 5600X Processor', 12000),
    part('Processor', 'AMD Ryzen 5 5600 Tray Processor', 13900),
    part('Processor', 'AMD Ryzen 5 5600 Boxed Processor', 13500),
  ]);
  assert.equal(exact.match, 'exact');
  assert.equal(exact.part.price, 13500);

  const ram = part('RAM', 'Netac Basic 16GB DDR4 3200MHz', 12000);
  const near = findCounterpart('RAM', ram, [
    part('RAM', 'Kingston FURY Beast 16GB DDR4 3200MHz', 16500),
    part('RAM', 'Hiksemi Armor 16GB DDR4 3200MHz', 11800),
    part('RAM', 'Lexar 8GB DDR4 3200MHz', 6000),
  ]);
  assert.equal(near.match, 'equivalent');
  assert.equal(near.part.price, 11800);

  assert.equal(findCounterpart('RAM', ram, [part('RAM', 'Lexar 8GB DDR4 3200MHz', 6000)]), null);
});

test('the Wi-Fi version of a board is not the same part', () => {
  assert.equal(compare('Motherboard', 'Gigabyte B450M DS3H AM4 AMD Micro ATX Motherboard', 'Gigabyte B450M DS3H WIFI AM4 AMD Micro ATX Motherboard'), 'equivalent');
  assert.equal(compare('Motherboard', 'Gigabyte B450M DS3H WIFI AM4 Motherboard', 'Gigabyte B450M DS3H AM4 Motherboard'), null);
});
