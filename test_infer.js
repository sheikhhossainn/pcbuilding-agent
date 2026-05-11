const inferSpecs = (category, name) => {
    const specs = {};
    const n = name.toLowerCase();
    
    if (category === 'Processor') {
        if (n.includes('amd') || n.includes('ryzen') || n.includes('athlon') || n.includes('threadripper')) specs.brand = 'amd';
        else if (n.includes('intel') || n.includes('core i') || n.includes('pentium') || n.includes('celeron')) specs.brand = 'intel';
        else specs.brand = 'unknown';
    }

    if (category === 'Processor' || category === 'Motherboard') {
        if (n.includes('am5') || n.includes('b650') || n.includes('x670') || n.includes('a620') || n.includes('x870') || n.match(/ryzen [579] (7|8|9)\d{3}/)) {
            specs.socket = 'AM5';
            specs.ram_type = 'DDR5';
        } else if (n.includes('am4') || n.includes('b450') || n.includes('b550') || n.includes('x570') || n.includes('a320') || n.includes('a520') || n.match(/ryzen [3579] (3|4|5)\d{3}/) || n.includes('4600g') || n.includes('5600g') || n.includes('5700g')) {
            specs.socket = 'AM4';
            specs.ram_type = 'DDR4';
        } else if (n.includes('lga1700') || n.includes('lga 1700') || n.includes('h610') || n.includes('b660') || n.includes('b760') || n.includes('z690') || n.includes('z790') || n.match(/1[234][14679]00/)) {
            specs.socket = 'LGA1700';
          // Many Intel board listings don't clearly state DDR4/DDR5 in the title.
          // Avoid forcing a wrong type; treat as UNKNOWN unless explicitly present.
          specs.ram_type = (n.includes('ddr4')) ? 'DDR4' : (n.includes('ddr5') ? 'DDR5' : 'UNKNOWN');
        } else if (n.includes('lga1200') || n.includes('lga 1200') || n.includes('h410') || n.includes('b460') || n.includes('h510') || n.includes('b560') || n.includes('z490') || n.includes('z590') || n.match(/1[01][1479]00/) || n.includes('10105')) {
            specs.socket = 'LGA1200';
            specs.ram_type = 'DDR4';
        } else if (n.includes('lga1151') || n.includes('lga 1151') || n.includes('h310') || n.includes('b360') || n.includes('b365') || n.includes('z390') || n.match(/[89][1479]00/)) {
            specs.socket = 'LGA1151';
            specs.ram_type = 'DDR4';
        } else {
            specs.socket = 'UNKNOWN'; // Fallback
            specs.ram_type = (n.includes('ddr5')) ? 'DDR5' : (n.includes('ddr3') ? 'DDR3' : 'UNKNOWN');
        }
    }
    
    if (category === 'Processor') {
        if (n.includes('i9') || n.includes('ryzen 9')) specs.tdp = 125;
        else if (n.includes('i7') || n.includes('ryzen 7')) specs.tdp = 105;
        else specs.tdp = 65;
    }

    if (category === 'RAM') {
        if (n.includes('ddr5')) specs.ram_type = 'DDR5';
        else if (n.includes('ddr3')) specs.ram_type = 'DDR3';
        else specs.ram_type = 'DDR4';
    }

    if (category === 'Graphics Card') {
        if (n.includes('nvidia') || n.includes('geforce') || n.includes('rtx') || n.includes('gtx')) specs.gpu_brand = 'nvidia';
        else if (n.includes('radeon') || n.includes('rx ')) specs.gpu_brand = 'amd';
        else specs.gpu_brand = 'unknown';

      if (n.includes('4090')) specs.tdp = 450;
      else if (n.includes('5090')) specs.tdp = 450;
      else if (n.includes('4080') || n.includes('7900') || n.includes('5080')) specs.tdp = 320;
      else if (n.includes('4070') || n.includes('7800') || n.includes('5070')) specs.tdp = 220;
      else if (n.includes('4060') || n.includes('7600')) specs.tdp = 160;
      else if (n.includes('5060')) specs.tdp = 180;
      else specs.tdp = 180;
    }

    if (category === 'PSU') {
        const match = n.match(/(\d+)\s*(w\b|watt)/i);
        if (match) specs.wattage = parseInt(match[1]);
        else specs.wattage = 500;
    }

    return specs;
}

const names = [
    "ASUS TUF GAMING X670E-PLUS WIFI Motherboard",
    "MSI MAG B650 TOMAHAWK WIFI Motherboard",
    "GIGABYTE X870 AORUS ELITE WIFI7 ICE Motherboard",
    "ASRock B650M Pro RS AM5 Motherboard",
    "AMD Ryzen 7 7800X3D Processor",
    "AMD Ryzen 5 9600X Processor",
    "MSI PRO A620M-E Motherboard"
];

for (const name of names) {
    console.log(name, inferSpecs("Motherboard", name));
}
