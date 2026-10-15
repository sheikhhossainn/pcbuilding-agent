import {
  Cpu, Layers, Database, HardDrive, Monitor, Zap, Fan, Box,
  Tv, MousePointer2, Keyboard, BatteryCharging,
  Gamepad2, Rocket, Clapperboard, Briefcase,
} from 'lucide-react';

export const CATEGORY_ICONS = {
  "Processor": Cpu,
  "Motherboard": Layers,
  "RAM": Database,
  "Storage": HardDrive,
  "Graphics Card": Monitor,
  "PSU": Zap,
  "CPU Cooler": Fan,
  "Casing": Box,
  "Monitor": Tv,
  "Mouse": MousePointer2,
  "Keyboard": Keyboard,
  "UPS": BatteryCharging,
};

export const CORE_CATEGORIES = ["Processor", "Graphics Card"];
export const PLATFORM_CATEGORIES = ["Motherboard", "RAM", "Storage", "PSU", "CPU Cooler", "Casing"];
export const PERIPHERAL_CATEGORIES = ["Monitor", "Mouse", "Keyboard", "UPS"];

export const REQUIRED_CATEGORIES = new Set(["Processor", "Motherboard", "RAM", "Storage", "PSU", "Casing"]);

// "Must match X" hints shown next to a category name.
export const CATEGORY_DEPENDENCIES = {
  "Motherboard": "CPU",
  "RAM": "Motherboard",
};

export const INITIAL_BUILD = Object.fromEntries(
  [...CORE_CATEGORIES, ...PLATFORM_CATEGORIES, ...PERIPHERAL_CATEGORIES].map((c) => [c, null])
);

export const TOTAL_PARTS = Object.keys(INITIAL_BUILD).length;

export const BUSY_STATES = ['analyzing', 'selecting', 'checking'];

export const PRESET_WORKLOADS = [
  { label: "1080p Gaming", prompt: "I need a budget 1080p gaming PC under 60,000 BDT with dedicated GPU", tag: "60k BDT", icon: Gamepad2 },
  { label: "1440p AAA Gaming", prompt: "I need a high-end 1440p gaming PC under 120,000 BDT with fast GPU and 32GB RAM", tag: "120k BDT", icon: Rocket },
  { label: "4K Video Editing", prompt: "I need a video editing and rendering PC under 90,000 BDT with fast multi-core CPU and 32GB RAM", tag: "90k BDT", icon: Clapperboard },
  { label: "Productivity & Office", prompt: "I need a fast office productivity PC under 35,000 BDT with fast SSD, no dedicated GPU", tag: "35k BDT", icon: Briefcase },
  { label: "High-End Workstation", prompt: "I need an extreme workstation PC under 180,000 BDT for 3D modeling and heavy multitasking", tag: "180k BDT", icon: Zap },
];

export const PROMPT_MODIFIERS = [
  { label: "+ AMD Ryzen", append: ", prefer AMD Ryzen CPU" },
  { label: "+ Intel Core", append: ", prefer Intel Core CPU" },
  { label: "+ No GPU (iGPU)", append: ", exclude dedicated GPU (use integrated graphics)" },
  { label: "+ Include Monitor", append: ", include a 1080p IPS monitor in the budget" },
  { label: "+ 32GB RAM", append: ", must have 32GB RAM" },
];

export const SITE_OPTIONS = [
  { value: "startech", label: "StarTech BD" },
  { value: "techland", label: "TechLand BD" },
  { value: "computermania", label: "CompMania BD" },
  { value: "custom", label: "Custom Site..." },
];
