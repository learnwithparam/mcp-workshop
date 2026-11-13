// add-records-as-resources: each patient's summary is a resource the host can read by its URI,
// find_patient links to it, and a prompt drafts a discharge note. The check reads the template
// list, reads a summary for a fixture patient and for an unknown one, and looks for owner contact
// details that must not be there.
import type { Client } from "@modelcontextprotocol/client";
import { withServer } from "./lib/mcp";
import { failed, rule, scenario } from "./lib/rules";

const TEMPLATE = /^clinic:\/\/patients\/\{[A-Za-z]+\}\/summary$/;
const BISCUIT_SUMMARY = "clinic://patients/P-0001/summary";
const UNKNOWN_SUMMARY = "clinic://patients/P-9999/summary";
const BISCUIT_OWNER = { phone: "07700 900000", email: "maya.collins1@example.net" };
const INVALID_PARAMS = -32602;

type Summary = { species?: string; alerts?: unknown; vaccinesDue?: { vaccine: string }[] };
type ContentBlock = { type: string; uri?: string };

/** Runs one request and keeps either its answer or the error code it failed with. */
async function attempt<Answer>(request: () => Promise<Answer>) {
  try {
    return { answer: await request() };
  } catch (error) {
    return { errorCode: (error as { code?: number }).code };
  }
}

async function readSummaryText(client: Client): Promise<string> {
  const read = await attempt(() => client.readResource({ uri: BISCUIT_SUMMARY }));
  const first = read.answer?.contents[0] as { text?: string } | undefined;
  return first?.text ?? "";
}

async function promptText(client: Client): Promise<string> {
  const prompt = await attempt(() =>
    client.getPrompt({ name: "prepare_discharge_note", arguments: { patientId: "P-0001" } }),
  );
  return JSON.stringify(prompt.answer?.messages ?? []);
}

// A server without resources or prompts says so up front; asking anyway only prints a warning.
async function listTemplates(client: Client) {
  if (!client.getServerCapabilities()?.resources) return [];
  const templates = await attempt(() => client.listResourceTemplates());
  return templates.answer?.resourceTemplates ?? [];
}

async function listPrompts(client: Client) {
  if (!client.getServerCapabilities()?.prompts) return [];
  const prompts = await attempt(() => client.listPrompts());
  return prompts.answer?.prompts ?? [];
}

const run = scenario(async (dir) =>
  withServer(dir, async ({ client }) => {
    const templates = await listTemplates(client);
    const summaryText = await readSummaryText(client);
    const unknown = await attempt(() => client.readResource({ uri: UNKNOWN_SUMMARY }));
    const found = await client.callTool({ name: "find_patient", arguments: { name: "Biscuit" } });
    return {
      templates,
      summaryText,
      unknownErrorCode: unknown.errorCode,
      findPatientContent: (found.content ?? []) as ContentBlock[],
      prompts: await listPrompts(client),
      promptText: await promptText(client),
    };
  }),
);

async function outcome(dir: string) {
  const result = await run(dir);
  return failed(result) ? undefined : result;
}

function parsedSummary(text: string): Summary {
  try {
    return JSON.parse(text) as Summary;
  } catch {
    return {};
  }
}

export default [
  rule(
    "The server starts and answers an MCP client",
    async (dir) => (await outcome(dir)) !== undefined,
    'run "bun server.ts" in the problem folder and fix the first error it prints',
  ),
  rule(
    "resources/templates/list has clinic://patients/{patientId}/summary",
    async (dir) => {
      const templates = (await outcome(dir))?.templates ?? [];
      return templates.some((template) => TEMPLATE.test(template.uriTemplate));
    },
    'register new ResourceTemplate("clinic://patients/{patientId}/summary", { list: undefined })',
  ),
  rule(
    "Reading Biscuit's summary gives JSON with species, alerts and the vaccines due",
    async (dir) => {
      const summary = parsedSummary((await outcome(dir))?.summaryText ?? "");
      const vaccines = (summary.vaccinesDue ?? []).map((due) => due.vaccine);
      return summary.species === "dog" && "alerts" in summary && vaccines.includes("DHP");
    },
    'return contents: [{ uri, mimeType: "application/json", text: JSON.stringify(summary) }]',
  ),
  rule(
    "The summary holds no owner phone number or email",
    async (dir) => {
      const text = (await outcome(dir))?.summaryText ?? "";
      const hasContact = text.includes(BISCUIT_OWNER.phone) || text.includes(BISCUIT_OWNER.email);
      return text.length > 0 && !hasContact;
    },
    "build the summary from the patient record only; leave clinic.owner(...) out",
  ),
  rule(
    "An unknown patient id gets error -32602",
    async (dir) => (await outcome(dir))?.unknownErrorCode === INVALID_PARAMS,
    "throw new ResourceNotFoundError(uri.toString()) when clinic.patient(...) finds nobody",
  ),
  rule(
    "find_patient for Biscuit returns a resource_link to her summary",
    async (dir) => {
      const content = (await outcome(dir))?.findPatientContent ?? [];
      return content.some(
        (block) => block.type === "resource_link" && block.uri === BISCUIT_SUMMARY,
      );
    },
    'add { type: "resource_link", uri, name } to content for each patient found',
  ),
  rule(
    "prompts/list has prepare_discharge_note, and its messages name Biscuit",
    async (dir) => {
      const found = await outcome(dir);
      const prompt = found?.prompts.find(
        (candidate) => candidate.name === "prepare_discharge_note",
      );
      const takesPatientId = prompt?.arguments?.some((argument) => argument.name === "patientId");
      return Boolean(takesPatientId && found?.promptText.includes("Biscuit"));
    },
    "register the prompt with argsSchema: z.object({ patientId: z.string() }) and say the pet's " +
      "name in the message",
  ),
];
