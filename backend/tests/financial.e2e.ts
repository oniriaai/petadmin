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
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  });
}

async function login(): Promise<void> {
  const client = axios.create({ baseURL: BASE_URL });
  const response = await client.post("/auth/login", {
    businessUnit: "DAYCARE",
    username: "kinderdog_admin",
    password: "kinderdog123",
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
  if (response.data.total !== 115) throw new Error(`Expected total 115, got ${response.data.total}`);
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
  if (response.data.total !== 115) throw new Error(`Expected total 115, got ${response.data.total}`);
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

async function cleanup(): Promise<void> {
  const client = createClient();

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

