// bun run ask "<question>"     ask the front-desk agent, which uses the finished server (as Ola)
//   --as ola|sam|joon           ask as another member of staff
//   --record                    with a live provider, save this conversation to world/replays/
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadReplays,
  normalizedQuestion,
  REPLAY_DIR,
  type ReplayConversation,
  ReplayMissing,
} from "../config/llm";
import { provider } from "../config/models";
import { runAgent, type ToolCallSeen } from "./agent";
import { connectFinished } from "./connect";

const args = process.argv.slice(2);
const asPosition = args.indexOf("--as");
const staffName = asPosition >= 0 ? args.splice(asPosition, 2)[1] : "ola";
const record = args.includes("--record");
const questionWords = args.filter((word) => word !== "--record");
const question = questionWords.join(" ").trim();

function printRecordedQuestions() {
  console.log("Ask a question in quotes. Recorded questions you can ask with no key:");
  for (const conversation of loadReplays()) {
    const asFlag = conversation.as && conversation.as !== "ola" ? ` --as ${conversation.as}` : "";
    console.log(`  bun run ask "${conversation.question}"${asFlag}`);
  }
}

// Shows each tool call and the first four lines of what it returned, cut to fit the terminal.
function printToolCall(call: ToolCallSeen) {
  const errorMark = call.isError ? " (tool error)" : "";
  console.log(`  tool ${call.name} ${JSON.stringify(call.input)}${errorMark}`);
  const firstLines = call.text.split("\n").slice(0, 4);
  for (const line of firstLines) {
    const shortLine = line.length > 110 ? `${line.slice(0, 107)}...` : line;
    console.log(`    ${shortLine}`);
  }
}

// Replaces any earlier recording of the same question by the same person.
function saveConversation(steps: ReplayConversation["steps"]) {
  const replayFile = join(REPLAY_DIR, "front-desk.json");
  const data = JSON.parse(readFileSync(replayFile, "utf8")) as {
    conversations: ReplayConversation[];
  };
  data.conversations = data.conversations.filter(
    (conversation) =>
      !(
        normalizedQuestion(conversation.question) === normalizedQuestion(question) &&
        conversation.as === staffName
      ),
  );
  data.conversations.push({ question, as: staffName, steps });
  writeFileSync(replayFile, `${JSON.stringify(data, null, 2)}\n`);
  console.log("Saved to world/replays/front-desk.json.");
}

// A missing recording already has a helpful message, so it is shown as it is.
function failureMessage(error: unknown): string {
  const cause = (error as { cause?: unknown } | undefined)?.cause;
  if (error instanceof ReplayMissing || cause instanceof ReplayMissing)
    return (error as Error).message;
  return `The agent failed: ${(error as Error).message}`;
}

if (!question) {
  printRecordedQuestions();
  process.exit(1);
}
const connection = await connectFinished({ as: staffName });
try {
  const result = await runAgent(connection.client, question, { as: staffName });
  for (const call of result.calls) printToolCall(call);
  console.log(`Answer (as ${staffName}, provider ${provider()}): ${result.answer}`);
  if (record && provider() !== "replay") saveConversation(result.steps);
} catch (error) {
  console.log(failureMessage(error));
  process.exitCode = 1;
} finally {
  await connection.close();
}
