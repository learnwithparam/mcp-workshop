// Reads the repo layout once. Every other script asks this file where things are.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const ROOT = join(import.meta.dir, "..");

export type Step = {
  name: string; // verb-the-thing, also the command argument
  dir: string;
  part: string;
  meta: { minutes: number; screen: boolean; solution: boolean };
};
export type Part = { name: string; dir: string; steps: Step[] };

// What a step.toml may hold. Every field is optional, so a missing file reads as empty.
type StepToml = { minutes?: unknown; screen?: unknown; solution?: unknown };

function subfolders(folder: string): string[] {
  if (!existsSync(folder)) return [];
  const entries = readdirSync(folder);
  const folders = entries.filter((entry) => statSync(join(folder, entry)).isDirectory());
  return folders.sort();
}

// Folders keep an order prefix for sorting only. Learners never type it.
export const bareName = (folder: string) => folder.replace(/^\d+-/, "");

function readStepToml(stepDir: string): StepToml {
  const metaPath = join(stepDir, "step.toml");
  if (!existsSync(metaPath)) return {};
  return Bun.TOML.parse(readFileSync(metaPath, "utf8")) as StepToml;
}

function readStep(partDir: string, partFolder: string, stepFolder: string): Step {
  const stepDir = join(partDir, stepFolder);
  const toml = readStepToml(stepDir);
  return {
    name: bareName(stepFolder),
    dir: stepDir,
    part: bareName(partFolder),
    meta: {
      minutes: Number(toml.minutes ?? 0),
      screen: Boolean(toml.screen),
      solution: Boolean(toml.solution),
    },
  };
}

export function parts(): Part[] {
  const root = join(ROOT, "parts");
  return subfolders(root).map((partFolder) => {
    const dir = join(root, partFolder);
    const steps = subfolders(dir).map((stepFolder) => readStep(dir, partFolder, stepFolder));
    return { name: bareName(partFolder), dir, steps };
  });
}

export const allSteps = () => parts().flatMap((part) => part.steps);

export function findStep(name: string): Step | undefined {
  return allSteps().find((step) => step.name === name);
}
