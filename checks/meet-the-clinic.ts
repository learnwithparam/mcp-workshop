// meet-the-clinic: three facts the learner can only get by running the finished system.
// The right answers are computed from a fresh copy of the diary, never typed into this file.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { rule } from "./lib/rules";
import { freshWorld } from "./lib/world";

/** The text after "label:" on its own line of answers.md, or "" when the line is missing. */
function answerAfter(label: string, answers: string): string {
  const line = answers.match(new RegExp(`^${label}:[ \\t]*(.*)$`, "m"));
  return line?.[1]?.trim() ?? "";
}

/** The learner's three answers from answers.md in their step folder. */
function readAnswers(dir: string) {
  const file = join(dir, "answers.md");
  const answers = existsSync(file) ? readFileSync(file, "utf8") : "";
  return {
    slots: answerAfter("Free 20-minute slots at Millbrook", answers),
    first: answerAfter("Dr Sam Reyes's first free slot", answers),
    ola: answerAfter("What Ola gets when she asks for clinical notes", answers),
  };
}

const world = freshWorld();
const slots = world.freeSlots({ site: "millbrook", length: 20 });
const reyesSlots = slots.filter((slot) => slot.vetId === "S-05");
const reyesFirst = reyesSlots.map((slot) => slot.start).sort()[0];

/** Ola's answer must say she was refused, not show Biscuit's notes. */
function saysOlaIsRefused(dir: string): boolean {
  const olaAnswer = readAnswers(dir).ola;
  const refused = /refus|denied|not allowed|no notes|cannot|can't|not found|no access|403/i;
  const showsNotes = /newest first|^biscuit'?s notes/i;
  return refused.test(olaAnswer) && !showsNotes.test(olaAnswer);
}

export default [
  rule(
    "answers.md has an answer on each of the three lines",
    (dir) => {
      const answers = readAnswers(dir);
      return Boolean(answers.slots && answers.first && answers.ola);
    },
    "run the finished system with the commands in this step's README, " +
      "then write each answer after its colon",
  ),
  rule(
    "The number of free 20-minute slots at Millbrook matches the diary",
    (dir) => Number(readAnswers(dir).slots.match(/\d+/)?.[0]) === slots.length,
    'run: bun run try find_free_slots \'{"site":"millbrook"}\' and count the start times it lists',
  ),
  rule(
    "Dr Sam Reyes's first free slot matches the diary",
    (dir) => readAnswers(dir).first.includes(reyesFirst),
    "look at the S-05 line of the same find_free_slots answer and copy its first time, as HH:MM",
  ),
  rule(
    "Ola's line says she is refused: a receptionist cannot read clinical notes",
    saysOlaIsRefused,
    'run: bun run ask "Show me Biscuit\'s clinical notes." ' +
      "and then the same with --as sam, and compare the two",
  ),
];
