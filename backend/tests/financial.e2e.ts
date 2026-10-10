import axios from "axios";

const BASE_URL = "http://localhost:3001/api/v1";
let authToken: string;

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const startTime = Date.now();
  try {
    await fn();
    results.push({ name, passed: true, duration: Date.now() - startTime });
    console.log(`✓ ${name}`);
  } catch (error) {
    let message = error instanceof Error ? error.message : "Unknown error";
    if (axios.isAxiosError(error) && error.response) {
      message = `${error.response.status} ${JSON.stringify(error.response.data)}`;
    }
    results.push({
      name,
      passed: false,
      error: message,
      duration: Date.now() - startTime,
    });
    console.error(`✗ ${name}: ${message}`);
  }
}

function createClient() {
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      "Content-Type": "application/json",
      "X-Business-Unit": "DAYCARE",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  });
}

// The tenant admin, narrowed to the daycare unit by header. The unit account no longer reaches
// the finances by default: that boundary is pinned in tests/permissions.e2e.ts.
async function login(): Promise<void> {
  const client = axios.create({ baseURL: BASE_URL });
  const response = await client.post("/auth/login", {
    username: "admin_global",
    password: "admin123",
  });
  authToken = response.data.token;
}

let incomeId: string;
let payableId: string;
let paymentId: string;

async function testIncomeCreate(): Promise<void> {
  const client = createClient();
  const response = await client.post("/incomes", {
    type: "OTRO",
    concept: `Ingreso E2E ${Date.now()}`,
    amount: 100,
    vatPercent: 15,
    paymentMethod: "EFECTIVO",
  });
  if (response.status !== 201) throw new Error(`Expected 201, got ${response.status}`);
  if (!response.data?.id) throw new Error("Income ID missing");
  if (response.data.total !== 115)
    throw new Error(`Expected total 115, got ${response.data.total}`);
  incomeId = response.data.id;
}

async function testIncomeListAndUpdate(): Promise<void> {
  const client = createClient();
  const list = await client.get("/incomes");
  if (list.status !== 200) throw new Error(`Expected 200, got ${list.status}`);
  if (!Array.isArray(list.data)) throw new Error("Expected array");
  const found = list.data.find((i: any) => i.id === incomeId);
  if (!found) throw new Error("Created income not found in list");

  const updated = await client.put(`/incomes/${incomeId}`, {
    concept: `Ingreso E2E Updated ${Date.now()}`,
    amount: 200,
    vatPercent: 10,
  });
  if (updated.status !== 200) throw new Error(`Expected 200, got ${updated.status}`);
  if (updated.data.total !== 220) throw new Error(`Expected total 220, got ${updated.data.total}`);
}

async function testPayableCreate(): Promise<void> {
  const client = createClient();
  const response = await client.post("/payables", {
    type: "GASTO",
    category: "SERVICIOS",
    description: `Documento E2E ${Date.now()}`,
    subtotal: 100,
    vatPercent: 15,
    isRecurring: false,
  });
  if (response.status !== 201) throw new Error(`Expected 201, got ${response.status}`);
  if (!response.data?.id) throw new Error("Payable ID missing");
  if (response.data.total !== 115)
    throw new Error(`Expected total 115, got ${response.data.total}`);
  payableId = response.data.id;
}

async function testPayablePaymentFlow(): Promise<void> {
  const client = createClient();

  const payment = await client.post(`/payables/${payableId}/payments`, {
    amount: 50,
    method: "TRANSFERENCIA",
    notes: "Pago parcial E2E",
  });
  if (payment.status !== 201) throw new Error(`Expected 201, got ${payment.status}`);
  paymentId = payment.data.id;

  const payableAfterPayment = await client.get(`/payables/${payableId}`);
  if (payableAfterPayment.data.paid !== 50) {
    throw new Error(`Expected paid 50, got ${payableAfterPayment.data.paid}`);
  }
  if (payableAfterPayment.data.status !== "PARCIAL") {
    throw new Error(`Expected status PARCIAL, got ${payableAfterPayment.data.status}`);
  }

  const removePayment = await client.delete(`/payables/${payableId}/payments/${paymentId}`);
  if (removePayment.status !== 200) throw new Error(`Expected 200, got ${removePayment.status}`);
}

// A month nothing else writes to, so the totals of the period are exactly these two rows.
const PERIOD = "from=2001-03-01&to=2001-03-31";
let filteredIncomeId: string;
let filteredPayableId: string;

function expectEqual(actual: unknown, expected: unknown, what: string): void {
  if (actual !== expected) throw new Error(`${what}: expected ${expected}, got ${actual}`);
}

async function testLedgerFilters(): Promise<void> {
  const client = createClient();
  const concept = `Filtro E2E ${Date.now()}`;
  const income = await client.post("/incomes", {
    type: "OTRO",
    concept,
    amount: 100,
    vatPercent: 15,
    paymentMethod: "TRANSFERENCIA",
    date: "2001-03-10T17:00:00Z",
  });
  filteredIncomeId = income.data.id;
  const payable = await client.post("/payables", {
    type: "GASTO",
    category: "servicios",
    description: concept,
    subtotal: 200,
    invoiceDate: "2001-03-12T17:00:00Z",
    dueDate: "2001-03-20T17:00:00Z",
  });
  filteredPayableId = payable.data.id;

  const page = await client.get(`/incomes?${PERIOD}&page=1`);
  expectEqual(page.data.total, 1, "incomes in the period");
  expectEqual(page.data.items[0].id, filteredIncomeId, "the income in the period");
  const totals = await client.get(`/incomes/summary?${PERIOD}&q=${encodeURIComponent(concept)}`);
  expectEqual(totals.data.total, 115, "income summary total");
  expectEqual(totals.data.vat, 15, "income summary vat");
  expectEqual(
    (await client.get(`/incomes/summary?${PERIOD}&paymentMethod=EFECTIVO`)).data.count,
    0,
    "incomes paid in cash",
  );
  // The last day of the range is inclusive, and the day after it is not.
  expectEqual(
    (await client.get("/incomes/summary?from=2001-03-10&to=2001-03-10")).data.count,
    1,
    "incomes on the day itself",
  );
  expectEqual(
    (await client.get("/incomes/summary?from=2001-03-11&to=2001-03-31")).data.count,
    0,
    "incomes after the day",
  );

  const overdue = await client.get(`/payables?${PERIOD}&status=VENCIDO&page=1`);
  expectEqual(overdue.data.total, 1, "overdue payables in the period");
  expectEqual(overdue.data.items[0].id, filteredPayableId, "the overdue payable");
  const owed = await client.get(`/payables/summary?${PERIOD}&q=${encodeURIComponent(concept)}`);
  expectEqual(owed.data.balance, 200, "payable summary balance");
  expectEqual(
    (await client.get(`/payables/summary?${PERIOD}&status=PAGADO`)).data.count,
    0,
    "paid payables",
  );

  const bad = await client.get("/incomes?from=2001-02-30", { validateStatus: () => true });
  expectEqual(bad.status, 400, "an impossible date");
}

async function testFinanceReport(): Promise<void> {
  const client = createClient();
  const report = (await client.get(`/reports/finance?${PERIOD}`)).data;
  expectEqual(report.period.income, 115, "income of the period");
  expectEqual(report.period.incomeVat, 15, "vat collected");
  expectEqual(report.period.expenses, 200, "expenses of the period");
  expectEqual(report.period.profit, -85, "profit of the period");
  expectEqual(report.previous.income, 0, "income of the previous period");
  expectEqual(report.monthly.length, 12, "months in the series");
  expectEqual(report.monthly[11].month, "2001-03", "last month of the series");
  expectEqual(report.monthly[11].income, 115, "income of the last month");
  expectEqual(report.monthly[11].expenses, 200, "expenses of the last month");
  expectEqual(report.byMethod[0].paymentMethod, "TRANSFERENCIA", "payment method");
  expectEqual(report.expensesByCategory[0].total, 200, "expenses by category");
  if (!report.payables.items.some((p: any) => p.id === filteredPayableId && p.overdue)) {
    throw new Error("the overdue payable is missing from the documents due");
  }
  // With no period it answers for the current month, where those rows do not count.
  const current = await client.get("/reports/finance");
  expectEqual(current.status, 200, "report with no period");
}

async function cleanup(): Promise<void> {
  const client = createClient();

  for (const id of [filteredIncomeId].filter(Boolean)) {
    await client.delete(`/incomes/${id}`).catch(() => undefined);
  }
  for (const id of [filteredPayableId].filter(Boolean)) {
    await client.delete(`/payables/${id}`).catch(() => undefined);
  }

  if (incomeId) {
    await client.delete(`/incomes/${incomeId}`).catch(() => undefined);
  }
  if (payableId) {
    await client.delete(`/payables/${payableId}`).catch(() => undefined);
  }
}

async function runTests() {
  console.log("🚀 Starting Financial E2E Tests\n");
  try {
    await login();
    console.log("✓ Authentication successful\n");

    await test("Income Create", testIncomeCreate);
    await test("Income List and Update", testIncomeListAndUpdate);
    await test("Payable Create", testPayableCreate);
    await test("Payable Payment Flow", testPayablePaymentFlow);
    await test("Ledger filters and totals", testLedgerFilters);
    await test("Finance report", testFinanceReport);
  } finally {
    await cleanup();
  }

  console.log("\n============================================================");
  console.log("📊 Test Summary:");
  const passed = results.filter((r) => r.passed).length;
  console.log(`   Passed: ${passed}/${results.length}`);
  console.log(`   Failed: ${results.length - passed}/${results.length}`);
  console.log("============================================================\n");

  if (passed < results.length) {
    process.exit(1);
  }
}

runTests().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
