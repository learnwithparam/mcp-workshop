// meet-the-clinic: three facts the learner can only get by running the finished system.
// The right answers are computed from a fresh copy of the diary, never typed into this file.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { rule } from "./lib/rules";
import { freshWorld } from "./lib/world";

const read = (dir: string) => {
  const f = join(dir, "answers.md");
  const t = existsSync(f) ? readFileSync(f, "utf8") : "";
  const line = (label: string) => t.match(new RegExp(`^${label}:[ \\t]*(.*)$`, "m"))?.[1]?.trim() ?? "";
  return { slots: line("Free 20-minute slots at Millbrook"), first: line("Dr Sam Reyes's first free slot"), ola: line("What Ola gets when she asks for clinical notes") };
};
const world = freshWorld();
const slots = world.freeSlots({ site: "millbrook", length: 20 });
const reyesFirst = slots.filter((s) => s.vet_id === "S-05").map((s) => s.start).sort()[0];

export default [
  rule("answers.md has an answer on each of the three lines", (dir) => { const a = read(dir); return Boolean(a.slots && a.first && a.ola); },
    "run the finished system with the commands in this step's README, then write each answer after its colon"),
  rule("The number of free 20-minute slots at Millbrook matches the diary", (dir) => Number(read(dir).slots.match(/\d+/)?.[0]) === slots.length,
    "run: bun run try find_free_slots '{\"site\":\"millbrook\"}' and count the start times it lists"),
  rule("Dr Sam Reyes's first free slot matches the diary", (dir) => read(dir).first.includes(reyesFirst),
    "look at the S-05 line of the same find_free_slots answer and copy its first time, as HH:MM"),
  rule("Ola's line says she is refused: a receptionist cannot read clinical notes", (dir) =>
    /refus|denied|not allowed|no notes|cannot|can't|not found|no access|403/i.test(read(dir).ola) && !/newest first|^biscuit'?s notes/i.test(read(dir).ola),
    "run: bun run ask \"Show me Biscuit's clinical notes.\" and then the same with --as sam, and compare the two"),
];
