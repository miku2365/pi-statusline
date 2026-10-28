import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface ModelPricing {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

interface CcSwitchPricingFile {
  models?: Array<{
    modelId: string;
    inputCostPerMillion?: string;
    outputCostPerMillion?: string;
    cacheReadCostPerMillion?: string;
    cacheCreationCostPerMillion?: string;
  }>;
}

let cachedPricing: Map<string, ModelPricing> | undefined;
let lastLoadedAt = 0;
const CACHE_TTL_MS = 60_000;

export function getPricingFilePath(): string {
  return join(homedir(), ".cc-switch", "model-pricing.json");
}

export function loadCcSwitchPricing(): Map<string, ModelPricing> {
  const now = Date.now();
  if (cachedPricing && now - lastLoadedAt < CACHE_TTL_MS) {
    return cachedPricing;
  }

  const map = new Map<string, ModelPricing>();
  try {
    const raw = readFileSync(getPricingFilePath(), "utf8");
    const data = JSON.parse(raw) as CcSwitchPricingFile;
    if (Array.isArray(data.models)) {
      for (const m of data.models) {
        if (!m.modelId) continue;
        const input = parseFloat(m.inputCostPerMillion ?? "0") || 0;
        const output = parseFloat(m.outputCostPerMillion ?? "0") || 0;
        const cacheRead = parseFloat(m.cacheReadCostPerMillion ?? "0") || 0;
        const cacheWrite = parseFloat(m.cacheCreationCostPerMillion ?? "0") || 0;
        map.set(m.modelId.toLowerCase(), { input, output, cacheRead, cacheWrite });
      }
    }
  } catch {
    // File missing or invalid JSON
  }

  cachedPricing = map;
  lastLoadedAt = now;
  return map;
}

export function usablePricing(rates: ModelPricing | undefined): ModelPricing | undefined {
  if (!rates || !Object.values(rates).every((rate) => Number.isFinite(rate) && rate >= 0)) return undefined;
  if (rates.input <= 0 && rates.output <= 0 && rates.cacheRead <= 0 && rates.cacheWrite <= 0) {
    return undefined;
  }
  return rates;
}

export function findModelPricing(modelId?: string): ModelPricing | undefined {
  if (!modelId) return undefined;
  const map = loadCcSwitchPricing();
  const id = modelId.toLowerCase();
  if (map.has(id)) return usablePricing(map.get(id));

  const bare = id.includes("/") ? id.split("/").pop()! : id;
  if (map.has(bare)) return usablePricing(map.get(bare));

  return undefined;
}
