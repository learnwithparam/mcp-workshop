// confirm-before-cancel: cancel_appointment asks the person first, with input_required and a
// signed requestState, and cancels only on a yes that comes back with that same signed state.
import {
  connectClient,
  type RawAnswer,
  rawCall,
  tokenFor,
  withHttpServer,
} from "../parts/03-open-the-server-safely/http-check-kit";
import { failed, rule, scenario } from "./lib/rules";
import type { World } from "./lib/world";

const BISCUIT_AT_15_40 = "A-00981"; // Biscuit with Dr Reyes, booked
const BISCUIT_AT_16_10 = "A-01015"; // Biscuit with Dr Cole, booked
const OTHER_BOOKING = "A-00962"; // another Millbrook patient, booked, for the real client

type Answer = { confirm: boolean } | undefined;
type Attempt = { appointmentId: string; answer?: Answer; requestState?: string };

function statusOf(world: World, appointmentId: string): string {
  const rows = world.rows<{ status: string }>(
    "SELECT status FROM appointments WHERE id = ?",
    appointmentId,
  );
  return rows[0]?.status ?? "missing";
}

function cancel(url: string, token: string, attempt: Attempt): Promise<RawAnswer> {
  const params: Record<string, unknown> = {
    name: "cancel_appointment",
    arguments: { appointmentId: attempt.appointmentId },
  };
  if (attempt.answer) {
    params.inputResponses = { confirm: { action: "accept", content: attempt.answer } };
  }
  if (attempt.requestState) params.requestState = attempt.requestState;
  return rawCall(url, { method: "tools/call", token, params });
}

// Changes one character in the middle, the way a client could edit the state it was handed.
function tampered(requestState: string): string {
  const middle = Math.floor(requestState.length / 2);
  const swapped = requestState[middle] === "A" ? "B" : "A";
  return requestState.slice(0, middle) + swapped + requestState.slice(middle + 1);
}

async function rawRoundTrips(url: string, token: string, world: World) {
  const first = await cancel(url, token, { appointmentId: BISCUIT_AT_15_40 });
  const afterFirst = statusOf(world, BISCUIT_AT_15_40);
  const state = String(first.body.result?.requestState ?? "");
  const other = await cancel(url, token, { appointmentId: BISCUIT_AT_16_10 });
  const otherState = String(other.body.result?.requestState ?? "");
  const yes = { confirm: true };
  await cancel(url, token, {
    appointmentId: BISCUIT_AT_15_40,
    answer: { confirm: false },
    requestState: state,
  });
  const afterNo = statusOf(world, BISCUIT_AT_15_40);
  await cancel(url, token, { appointmentId: BISCUIT_AT_15_40, answer: yes });
  const afterYesAlone = statusOf(world, BISCUIT_AT_15_40);
  await cancel(url, token, {
    appointmentId: BISCUIT_AT_15_40,
    answer: yes,
    requestState: tampered(state),
  });
  const afterTampered = statusOf(world, BISCUIT_AT_15_40);
  await cancel(url, token, {
    appointmentId: BISCUIT_AT_15_40,
    answer: yes,
    requestState: otherState,
  });
  const afterOtherState = statusOf(world, BISCUIT_AT_15_40);
  await cancel(url, token, { appointmentId: BISCUIT_AT_15_40, answer: yes, requestState: state });
  const afterYes = statusOf(world, BISCUIT_AT_15_40);
  return {
    first: first.body.result,
    afterFirst,
    afterNo,
    afterYesAlone,
    afterTampered,
    afterOtherState,
    afterYes,
  };
}

// The real MCP client answers the question itself and sends the signed state back.
async function realClientCancels(url: string, token: string, world: World): Promise<boolean> {
  const client = await connectClient(url, { token, confirm: true });
  try {
    await client.callTool({
      name: "cancel_appointment",
      arguments: { appointmentId: OTHER_BOOKING },
    });
  } finally {
    await client.close();
  }
  return statusOf(world, OTHER_BOOKING) === "cancelled";
}

const run = scenario(async (dir) =>
  withHttpServer(dir, async ({ url, world }) => {
    const token = await tokenFor("ola", url);
    const roundTrips = await rawRoundTrips(url, token, world);
    const realClient = await realClientCancels(url, token, world).catch(() => false);
    return { ...roundTrips, realClient };
  }),
);

let lastError = "";
const ok = async (dir: string) => {
  const outcome = await run(dir);
  return failed(outcome) ? undefined : outcome;
};

function asksAboutBiscuit(first: Record<string, unknown> | undefined): boolean {
  const inputRequests = (first?.inputRequests ?? {}) as Record<
    string,
    { params?: { message?: string } }
  >;
  const messages = Object.values(inputRequests).map((request) => request.params?.message ?? "");
  const named = messages.some(
    (message) => message.includes("Biscuit") && message.includes("15:40"),
  );
  return first?.resultType === "input_required" && named && typeof first.requestState === "string";
}

export default [
  rule(
    "The first call asks the person, names Biscuit and 15:40, and changes nothing",
    async (dir) => {
      const outcome = await run(dir);
      lastError = failed(outcome) ? outcome.failed : "";
      if (failed(outcome)) return false;
      return asksAboutBiscuit(outcome.first) && outcome.afterFirst === "booked";
    },
    () =>
      "return inputRequired({ inputRequests: { confirm: inputRequired.elicit({ message, " +
      `requestedSchema }) }, requestState }) before you cancel anything. ${lastError}`,
  ),
  rule(
    "An answer of no keeps the appointment",
    async (dir) => (await ok(dir))?.afterNo === "booked",
    "read the answer with acceptedContent(context.mcpReq.inputResponses, 'confirm', schema) " +
      "and cancel only when confirm is true",
  ),
  rule(
    "A yes that skips the question, with no requestState, changes nothing",
    async (dir) => (await ok(dir))?.afterYesAlone === "booked",
    "a client can send inputResponses on the very first call. Only trust an answer that comes " +
      "back with the requestState you minted: context.mcpReq.requestState()",
  ),
  rule(
    "A yes with a tampered requestState changes nothing",
    async (dir) => (await ok(dir))?.afterTampered === "booked",
    "sign the state: createRequestStateCodec({ key }), mint it in the question, and pass " +
      "{ requestState: { verify: codec.verify } } to new McpServer",
  ),
  rule(
    "A yes that carries the state of another appointment changes nothing",
    async (dir) => (await ok(dir))?.afterOtherState === "booked",
    "put the appointmentId in the signed state, and refuse when it is not the one in the call",
  ),
  rule(
    "A yes with its own signed state cancels the appointment",
    async (dir) => {
      const outcome = await ok(dir);
      return outcome?.afterFirst === "booked" && outcome.afterYes === "cancelled";
    },
    "when the signed state matches and confirm is true, call clinic.cancelAppointment",
  ),
  rule(
    "The real MCP client confirms and the appointment is cancelled",
    async (dir) => Boolean((await ok(dir))?.realClient),
    "the SDK client answers the question and sends requestState back for you; " +
      "make sure the retry path reads both",
  ),
];
