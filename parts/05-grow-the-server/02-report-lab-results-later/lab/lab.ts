// The Harrow Lane lab: it runs blood panels. It is fictional, and you never edit this file.
// A real panel takes about 40 minutes. Here it takes LAB_TURNAROUND_MS (3 seconds by default),
// so you can watch it finish.

export type PanelResult = { test: string; value: number; unit: string; normalRange: string };

type Order = { patientId: string; orderedAt: number; cancelled: boolean };

const orders = new Map<string, Order>();
let lastOrderNumber = 0;

const turnaroundMs = () => Number(process.env.LAB_TURNAROUND_MS ?? 3000);

// Every panel gives the same results, so a check can compare them.
const PANEL: PanelResult[] = [
  { test: "PCV", value: 45, unit: "%", normalRange: "37 to 55" },
  { test: "ALT", value: 52, unit: "U/L", normalRange: "10 to 100" },
  { test: "Creatinine", value: 98, unit: "umol/L", normalRange: "40 to 133" },
];

export const lab = {
  /** Sends a sample to the lab and returns the lab's order id at once. */
  orderBloodPanel(patientId: string): string {
    lastOrderNumber += 1;
    const orderId = `LAB-${String(lastOrderNumber).padStart(4, "0")}`;
    orders.set(orderId, { patientId, orderedAt: Date.now(), cancelled: false });
    return orderId;
  },

  /** "working" until the turnaround time has passed, then "completed". */
  status(orderId: string): "working" | "completed" | "cancelled" | "unknown" {
    const order = orders.get(orderId);
    if (!order) return "unknown";
    if (order.cancelled) return "cancelled";
    const isDone = Date.now() - order.orderedAt >= turnaroundMs();
    return isDone ? "completed" : "working";
  },

  /** The results of a completed panel, or undefined while it is still working. */
  results(orderId: string): PanelResult[] | undefined {
    if (lab.status(orderId) !== "completed") return undefined;
    return PANEL;
  },

  /** Stops a panel that has not finished. A finished one stays finished. */
  cancel(orderId: string) {
    const order = orders.get(orderId);
    if (order && lab.status(orderId) === "working") order.cancelled = true;
  },

  /** Waits until the panel is done. A tool that calls this keeps the model waiting. */
  async waitForResults(orderId: string): Promise<PanelResult[]> {
    while (lab.status(orderId) === "working") await Bun.sleep(100);
    return lab.results(orderId) ?? [];
  },
};
