// A campaign's Launch Kit: a showcase's recorded kit from data/kits, else the store.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadCampaign } from "../store";
import type { Kit } from "./types";

export async function loadKit(id: string): Promise<Kit | null> {
  if (!/^[a-z0-9-]{4,64}$/.test(id)) return null;
  try {
    return JSON.parse(await readFile(join(process.cwd(), "data", "kits", `${id}.json`), "utf8")) as Kit;
  } catch {
    return loadCampaign(id).catch(() => null);
  }
}

/** Showcase kits are recorded examples; their launches are fictional. */
export async function isShowcaseKit(id: string) {
  try {
    await readFile(join(process.cwd(), "data", "kits", `${id}.json`), "utf8");
    return true;
  } catch {
    return false;
  }
}
