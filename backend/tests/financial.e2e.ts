/**
 * End-to-End Test Suite for Financial Module
 * Tests all CRUD operations for Income, Expense, and Purchase
 * 
 * Usage: npm run test:financial
 * Or: tsx tests/financial.e2e.ts
 */

import axios, { AxiosError } from "axios";

const BASE_URL = "http://localhost:3001/api/v1";
let authToken: string;

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

// Test helper function
async function test(
  name: string,
  fn: () => Promise<void>
): Promise<void> {
  const startTime = Date.now();
  try {
    await fn();
    results.push({ name, passed: true, duration: Date.now() - startTime });
    console.log(`✓ ${name}`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    results.push({
      name,
      passed: false,
      error: message,
      duration: Date.now() - startTime,
    });
    console.error(`✗ ${name}: ${message}`);
  }
}

// Initialize axios client with token
function createClient() {
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      "Content-Type": "application/json",
      ...(authToken && { Authorization: `Bearer ${authToken}` }),
    },
  });
}

// ==================== SETUP ====================

async function login(): Promise<void> {
  const client = axios.create({ baseURL: BASE_URL });
  const response = await client.post("/auth/login", {
    businessUnit: "KINDERDOG",
    username: "kinderdog_admin",
    password: "kinderdog123",
  });
  authToken = response.data.token;
}

// ==================== INCOME TESTS ====================

let incomeId: string;

async function testIncomeCreate(): Promise<void> {
  const client = createClient();
  const response = await client.post("/financial/incomes", {
    businessUnit: "KINDERDOG",
    type: "RESERVA",
    concept: "Daycare reservation",
    amount: 150,
    vatPercent: 21,
    vatAmount: 31.5,
    paymentMethod: "TARJETA",
    invoiceNumber: "INV-001",
    date: new Date(),
  });

  if (response.status !== 201) throw new Error("Expected status 201");
  if (!response.data.id) throw new Error("No income ID returned");
  if (response.data.amount !== 150) throw new Error("Amount mismatch");
  if (response.data.total !== 181.5) throw new Error("Total calculation error");

  incomeId = response.data.id;
}

async function testIncomeRead(): Promise<void> {
  const client = createClient();
  const response = await client.get(`/financial/incomes/${incomeId}`);

  if (response.status !== 200) throw new Error("Expected status 200");
  if (response.data.id !== incomeId) throw new Error("ID mismatch");
  if (response.data.amount !== 150) throw new Error("Amount mismatch");
}

async function testIncomeReadAll(): Promise<void> {
  const client = createClient();
  const response = await client.get("/financial/incomes?businessUnit=KINDERDOG");

  if (response.status !== 200) throw new Error("Expected status 200");
  if (!Array.isArray(response.data)) throw new Error("Expected array response");
  if (!response.data.find((i: any) => i.id === incomeId)) {
    throw new Error("Created income not found in list");
  }
}

async function testIncomeUpdate(): Promise<void> {
  const client = createClient();
  const response = await client.put(`/financial/incomes/${incomeId}`, {
    concept: "Updated daycare reservation",
    amount: 200,
    vatAmount: 42,
  });

  if (response.status !== 200) throw new Error("Expected status 200");
  if (response.data.concept !== "Updated daycare reservation") {
    throw new Error("Concept not updated");
  }
  if (response.data.amount !== 200) throw new Error("Amount not updated");
}

async function testIncomeCannotUpdatePaid(): Promise<void> {
  const client = createClient();

  // Update status to PAGADO
  await client.put(`/financial/incomes/${incomeId}`, {
    invoiceStatus: "PAGADO",
  });

  // Try to update amount (should fail)
  try {
    await client.put(`/financial/incomes/${incomeId}`, {
      amount: 300,
    });
    throw new Error("Should not allow updating paid income amount");
  } catch (error) {
    if (error instanceof AxiosError) {
      if (error.response?.status !== 400) {
        throw new Error("Expected status 400");
      }
    } else {
      throw error;
    }
  }

  // Reset to PENDIENTE for other tests
  await client.put(`/financial/incomes/${incomeId}`, {
    invoiceStatus: "PENDIENTE",
  });
}

async function testIncomeDelete(): Promise<void> {
  const client = createClient();
  const response = await client.delete(`/financial/incomes/${incomeId}`);

  if (response.status !== 200) throw new Error("Expected status 200");
  if (response.data.isActive !== false) throw new Error("Not soft deleted");

  // Verify it's not returned in listings
  const listResponse = await client.get("/financial/incomes?businessUnit=KINDERDOG");
  const found = listResponse.data.find((i: any) => i.id === incomeId && i.isActive);
  if (found) throw new Error("Deleted income still appears in active list");
}

// ==================== EXPENSE TESTS ====================

let expenseId: string;

async function testExpenseCreate(): Promise<void> {
  const client = createClient();
  const response = await client.post("/financial/expenses", {
    businessUnit: "KINDERDOG",
    category: "SUMINISTROS",
    description: "Dog food supplies",
    amount: 250,
    provider: "PetSupply Co",
    date: new Date(),
  });

  if (response.status !== 201) throw new Error("Expected status 201");
  if (!response.data.id) throw new Error("No expense ID returned");
  if (response.data.amount !== 250) throw new Error("Amount mismatch");

  expenseId = response.data.id;
}

async function testExpenseRead(): Promise<void> {
  const client = createClient();
  const response = await client.get(`/financial/expenses/${expenseId}`);

  if (response.status !== 200) throw new Error("Expected status 200");
  if (response.data.id !== expenseId) throw new Error("ID mismatch");
  if (response.data.category !== "SUMINISTROS") throw new Error("Category mismatch");
}

async function testExpenseReadAll(): Promise<void> {
  const client = createClient();
  const response = await client.get(
    "/financial/expenses?businessUnit=KINDERDOG&category=SUMINISTROS"
  );

  if (response.status !== 200) throw new Error("Expected status 200");
  if (!Array.isArray(response.data)) throw new Error("Expected array response");
  if (!response.data.find((e: any) => e.id === expenseId)) {
    throw new Error("Created expense not found in list");
  }
}

async function testExpenseUpdate(): Promise<void> {
  const client = createClient();
  const response = await client.put(`/financial/expenses/${expenseId}`, {
    description: "Premium dog food",
    amount: 300,
  });

  if (response.status !== 200) throw new Error("Expected status 200");
  if (response.data.description !== "Premium dog food") {
    throw new Error("Description not updated");
  }
  if (response.data.amount !== 300) throw new Error("Amount not updated");
}

async function testExpenseDelete(): Promise<void> {
  const client = createClient();
  const response = await client.delete(`/financial/expenses/${expenseId}`);

  if (response.status !== 200) throw new Error("Expected status 200");
  if (response.data.isActive !== false) throw new Error("Not soft deleted");
}

// ==================== PURCHASE TESTS ====================

let purchaseId: string;

async function testPurchaseCreate(): Promise<void> {
  const client = createClient();
  const response = await client.post("/financial/purchases", {
    businessUnit: "KINDERDOG",
    description: "Cleaning supplies",
    quantity: 10,
    unitPrice: 25.5,
    provider: "CleanCo",
    date: new Date(),
  });

  if (response.status !== 201) throw new Error("Expected status 201");
  if (!response.data.id) throw new Error("No purchase ID returned");
  if (response.data.quantity !== 10) throw new Error("Quantity mismatch");
  if (response.data.unitPrice !== 25.5) throw new Error("Unit price mismatch");
  if (response.data.totalPrice !== 255) throw new Error("Total price calculation error");

  purchaseId = response.data.id;
}

async function testPurchaseRead(): Promise<void> {
  const client = createClient();
  const response = await client.get(`/financial/purchases/${purchaseId}`);

  if (response.status !== 200) throw new Error("Expected status 200");
  if (response.data.id !== purchaseId) throw new Error("ID mismatch");
  if (response.data.totalPrice !== 255) throw new Error("Total price mismatch");
}

async function testPurchaseReadAll(): Promise<void> {
  const client = createClient();
  const response = await client.get("/financial/purchases?businessUnit=KINDERDOG");

  if (response.status !== 200) throw new Error("Expected status 200");
  if (!Array.isArray(response.data)) throw new Error("Expected array response");
  if (!response.data.find((p: any) => p.id === purchaseId)) {
    throw new Error("Created purchase not found in list");
  }
}

async function testPurchaseUpdate(): Promise<void> {
  const client = createClient();
  const response = await client.put(`/financial/purchases/${purchaseId}`, {
    quantity: 15,
    unitPrice: 30,
  });

  if (response.status !== 200) throw new Error("Expected status 200");
  if (response.data.quantity !== 15) throw new Error("Quantity not updated");
  if (response.data.unitPrice !== 30) throw new Error("Unit price not updated");
  if (response.data.totalPrice !== 450) throw new Error("Total price not recalculated");
}

async function testPurchaseDelete(): Promise<void> {
  const client = createClient();
  const response = await client.delete(`/financial/purchases/${purchaseId}`);

  if (response.status !== 200) throw new Error("Expected status 200");
  if (response.data.isActive !== false) throw new Error("Not soft deleted");
}

// ==================== VALIDATION TESTS ====================

async function testIncomeValidationMissingFields(): Promise<void> {
  const client = createClient();

  try {
    await client.post("/financial/incomes", {
      businessUnit: "KINDERDOG",
      // Missing required fields: concept, amount
    });
    throw new Error("Should have failed validation");
  } catch (error) {
    if (error instanceof AxiosError) {
      if (error.response?.status !== 400) {
        throw new Error(`Expected status 400, got ${error.response?.status}`);
      }
    } else {
      throw error;
    }
  }
}

async function testIncomeValidationNegativeAmount(): Promise<void> {
  const client = createClient();

  try {
    await client.post("/financial/incomes", {
      businessUnit: "KINDERDOG",
      concept: "Test",
      amount: -50, // Negative amount
    });
    throw new Error("Should have failed validation");
  } catch (error) {
    if (error instanceof AxiosError) {
      if (error.response?.status !== 400) {
        throw new Error("Expected status 400");
      }
    } else {
      throw error;
    }
  }
}

async function testExpenseValidationInvalidCategory(): Promise<void> {
  const client = createClient();

  try {
    await client.post("/financial/expenses", {
      businessUnit: "KINDERDOG",
      category: "INVALID_CATEGORY",
      description: "Test",
      amount: 100,
      provider: "Test",
    });
    throw new Error("Should have failed validation");
  } catch (error) {
    if (error instanceof AxiosError) {
      if (error.response?.status !== 400) {
        throw new Error("Expected status 400");
      }
    } else {
      throw error;
    }
  }
}

// ==================== AUTHORIZATION TESTS ====================

async function testUnauthorizedAccess(): Promise<void> {
  const unauthorizedClient = axios.create({
    baseURL: BASE_URL,
    headers: { "Content-Type": "application/json" },
  });

  try {
    await unauthorizedClient.get("/financial/incomes");
    throw new Error("Should require authentication");
  } catch (error) {
    if (error instanceof AxiosError) {
      if (error.response?.status !== 401) {
        throw new Error("Expected status 401");
      }
    } else {
      throw error;
    }
  }
}

// ==================== FILTERING TESTS ====================

async function testIncomeFilterByType(): Promise<void> {
  const client = createClient();

  // Create income with type "OTRO"
  const createResp = await client.post("/financial/incomes", {
    businessUnit: "KINDERDOG",
    type: "OTRO",
    concept: "Other income",
    amount: 100,
    paymentMethod: "EFECTIVO",
  });

  const otherIncomeId = createResp.data.id;

  // Filter by type
  const response = await client.get("/financial/incomes?type=OTRO");

  if (!response.data.find((i: any) => i.id === otherIncomeId)) {
    throw new Error("Type filter not working");
  }

  // Cleanup
  await client.delete(`/financial/incomes/${otherIncomeId}`);
}

async function testExpenseFilterByDateRange(): Promise<void> {
  const client = createClient();

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Create expense
  const createResp = await client.post("/financial/expenses", {
    businessUnit: "KINDERDOG",
    category: "SERVICIOS",
    description: "Today's service",
    amount: 100,
    provider: "Service Provider",
    date: today,
  });

  const expenseId = createResp.data.id;

  // Filter by date range (should include today)
  const response = await client.get(
    `/financial/expenses?businessUnit=KINDERDOG&startDate=${today.toISOString().split("T")[0]}&endDate=${tomorrow.toISOString().split("T")[0]}`
  );

  if (!response.data.find((e: any) => e.id === expenseId)) {
    throw new Error("Date filter not working");
  }

  // Cleanup
  await client.delete(`/financial/expenses/${expenseId}`);
}

// ==================== MAIN TEST RUNNER ====================

async function runTests(): Promise<void> {
  console.log("🚀 Starting Financial Module E2E Tests\n");
  console.log("=".repeat(60));

  try {
    // Setup
    console.log("\n📋 Authentication...");
    await login();
    console.log("✓ Login successful\n");

    // Income tests
    console.log("📊 Testing Income CRUD...");
    await test("Income: Create", testIncomeCreate);
    await test("Income: Read", testIncomeRead);
    await test("Income: Read All", testIncomeReadAll);
    await test("Income: Update", testIncomeUpdate);
    await test("Income: Cannot update paid", testIncomeCannotUpdatePaid);
    await test("Income: Delete", testIncomeDelete);

    // Expense tests
    console.log("\n💰 Testing Expense CRUD...");
    await test("Expense: Create", testExpenseCreate);
    await test("Expense: Read", testExpenseRead);
    await test("Expense: Read All", testExpenseReadAll);
    await test("Expense: Update", testExpenseUpdate);
    await test("Expense: Delete", testExpenseDelete);

    // Purchase tests
    console.log("\n🛒 Testing Purchase CRUD...");
    await test("Purchase: Create", testPurchaseCreate);
    await test("Purchase: Read", testPurchaseRead);
    await test("Purchase: Read All", testPurchaseReadAll);
    await test("Purchase: Update", testPurchaseUpdate);
    await test("Purchase: Delete", testPurchaseDelete);

    // Validation tests
    console.log("\n✔️  Testing Validation...");
    await test("Validation: Income missing fields", testIncomeValidationMissingFields);
    await test("Validation: Income negative amount", testIncomeValidationNegativeAmount);
    await test("Validation: Expense invalid category", testExpenseValidationInvalidCategory);

    // Authorization tests
    console.log("\n🔒 Testing Authorization...");
    await test("Authorization: Unauthorized access", testUnauthorizedAccess);

    // Filtering tests
    console.log("\n🔍 Testing Filtering...");
    await test("Filter: Income by type", testIncomeFilterByType);
    await test("Filter: Expense by date range", testExpenseFilterByDateRange);
  } catch (error) {
    console.error("\n❌ Test setup failed:", error);
    process.exit(1);
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`\n📊 Test Summary:`);
  console.log(`   Passed: ${passed}/${results.length}`);
  console.log(`   Failed: ${failed}/${results.length}`);
  console.log(`   Total Time: ${totalDuration}ms`);

  if (failed > 0) {
    console.log("\n❌ Failed Tests:");
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`   • ${r.name}: ${r.error}`);
      });
    process.exit(1);
  } else {
    console.log("\n✅ All tests passed!");
    process.exit(0);
  }
}

// Run tests
runTests().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
