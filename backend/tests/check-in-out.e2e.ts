/**
 * End-to-End Test Suite for Check-in/Check-out Module
 *
 * Usage: tsx tests/check-in-out.e2e.ts
 */

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

// Test helper function
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
    businessUnit: "DAYCARE",
    username: "guarderia_admin",
    password: "guarderia123",
  });
  authToken = response.data.token;
}

let clientId: string;
let petId: string;
let roomId: string;
let checkInOutId: string;

async function prepareData(): Promise<void> {
  const client = createClient();

  // Create a test client
  const clientResponse = await client.post("/clients", {
    firstName: "Test",
    lastName: "User Check-in",
    email: `test.${Date.now()}@example.com`,
  });
  clientId = clientResponse.data.id;
  console.log(`✓ Created test client: ${clientId}`);

  // Create a test pet
  const petResponse = await client.post("/pets", {
    clientId,
    name: "Test Dog",
    species: "dog",
    sex: "M",
  });
  petId = petResponse.data.id;
  console.log(`✓ Created test pet: ${petId}`);

  // Get a room
  const rooms = await client.get("/rooms");
  if (rooms.data.length === 0) throw new Error("No rooms found in DB");
  roomId = rooms.data[0].id;
  console.log(`✓ Using room: ${rooms.data[0].name} (${roomId})`);
}

// ==================== CHECK-IN/OUT TESTS ====================

async function testCreateCheckInOut(): Promise<void> {
  const client = createClient();

  // Test with single petId (expected to work, now returns an array)
  const response = await client.post("/check-in-out", {
    clientId,
    petId,
    roomId,
    notes: "Ad-hoc check-in test",
  });

  if (response.status !== 201) throw new Error(`Expected status 201, got ${response.status}`);
  if (!Array.isArray(response.data)) throw new Error("Expected an array of records");
  if (response.data.length === 0) throw new Error("Empty array returned");
  if (!response.data[0].id) throw new Error("No ID returned in first record");
  checkInOutId = response.data[0].id;
}

async function testCreateCheckInOutPlural(): Promise<void> {
  const client = createClient();

  // Test with petIds array (what frontend sends, should now work)
  const response = await client.post("/check-in-out", {
    clientId,
    petIds: [petId],
    roomId,
    notes: "Ad-hoc check-in test with plural petIds",
  });

  if (response.status !== 201) throw new Error(`Expected status 201, got ${response.status}`);
  if (!Array.isArray(response.data)) throw new Error("Expected an array of records");
  if (response.data.length === 0) throw new Error("Empty array returned");
}

async function testGetActive(): Promise<void> {
  const client = createClient();

  // Register check-in first so it appears in active
  await client.post(`/check-in-out/${checkInOutId}/check-in`, {
    checkInTime: new Date().toISOString(),
  });

  const response = await client.get("/check-in-out/active");
  if (response.status !== 200) throw new Error(`Expected status 200, got ${response.status}`);

  // Note: active list might not be mapped yet, let's check structure
  const found = response.data.find((r: any) => r.id === checkInOutId);
  if (!found) throw new Error("Created record not found in active list");
}

async function testCheckOut(): Promise<void> {
  const client = createClient();

  const response = await client.post(`/check-in-out/${checkInOutId}/check-out`, {
    checkOutTime: new Date().toISOString(),
  });

  if (response.status !== 200) throw new Error(`Expected status 200, got ${response.status}`);
  if (!response.data.checkOutTime) throw new Error("checkOutTime was not updated");
}

async function testGetHistory(): Promise<void> {
  const client = createClient();

  const response = await client.get("/check-in-out/history");
  if (response.status !== 200) throw new Error(`Expected status 200, got ${response.status}`);

  const found = response.data.data.find((r: any) => r.id === checkInOutId);
  if (!found) throw new Error("Created record not found in history");
}

async function testGetBaseRoute(): Promise<void> {
  const client = createClient();

  // Test GET /check-in-out (what frontend calls, should now work)
  const response = await client.get("/check-in-out");
  if (response.status !== 200) throw new Error(`Expected status 200, got ${response.status}`);
  if (!Array.isArray(response.data)) throw new Error("Expected an array of records");
}

let reservationId: string;

async function testReservationCheckInOut(): Promise<void> {
  const client = createClient();

  // 1. Create a reservation
  const resResponse = await client.post("/reservations", {
    clientId,
    petIds: [petId],
    roomId,
    service: "GUARDERIA",
    checkIn: new Date().toISOString(),
    checkOut: new Date(Date.now() + 3600000).toISOString(),
    basePrice: 20,
  });

  if (resResponse.status !== 201) throw new Error("Failed to create reservation");
  reservationId = resResponse.data.id;
  console.log(`   Created reservation: ${reservationId}`);

  // 2. Verify CheckInOut records were created
  const historyResponse = await client.get(`/check-in-out/history?reservationId=${reservationId}`);
  if (historyResponse.data.data.length === 0)
    throw new Error("No CheckInOut records created for reservation");
  const linkedCheckInOutId = historyResponse.data.data[0].id;
  console.log(`   Found linked CheckInOut: ${linkedCheckInOutId}`);

  // 3. Check-in via reservations endpoint
  const checkInTime = new Date().toISOString();
  await client.post(`/reservations/${reservationId}/checkin`, { time: checkInTime });
  console.log("   Performed reservation check-in");

  // 4. Verify CheckInOut record was updated
  const updatedRecord = await client.get(`/check-in-out/${linkedCheckInOutId}`);
  if (!updatedRecord.data.checkInTime)
    throw new Error("Linked CheckInOut record was not updated with check-in time");
  console.log("   Verified linked CheckInOut check-in time");

  // 5. Check-out via reservations endpoint
  const checkOutTime = new Date(Date.now() + 1000).toISOString();
  await client.post(`/reservations/${reservationId}/checkout`, {
    time: checkOutTime,
    createIncome: true,
  });
  console.log("   Performed reservation check-out");

  // 6. Verify CheckInOut record was updated
  const finalRecord = await client.get(`/check-in-out/${linkedCheckInOutId}`);
  if (!finalRecord.data.checkOutTime)
    throw new Error("Linked CheckInOut record was not updated with check-out time");
  console.log("   Verified linked CheckInOut check-out time");
}

// ==================== RUNNER ====================

async function runTests() {
  console.log("🚀 Starting Check-in/Check-out E2E Tests\n");

  try {
    await login();
    console.log("✓ Authentication successful");

    await prepareData();
    console.log("✓ Data preparation successful\n");

    await test("Create CheckInOut (Single petId)", testCreateCheckInOut);
    await test("Create CheckInOut (Plural petIds - Frontend mismatch)", testCreateCheckInOutPlural);
    await test("Get Active Check-ins", testGetActive);
    await test("Register Check-out", testCheckOut);
    await test("Get History", testGetHistory);
    await test("Get Base Route (Missing route check)", testGetBaseRoute);
    await test("Reservation Check-in/out Unification", testReservationCheckInOut);

    console.log("\n============================================================");
    console.log(`📊 Test Summary:`);
    const passed = results.filter((r) => r.passed).length;
    console.log(`   Passed: ${passed}/${results.length}`);
    console.log(`   Failed: ${results.length - passed}/${results.length}`);
    console.log("============================================================\n");

    if (passed < results.length) {
      console.log("❌ Some tests failed (as expected if reproducing bugs)");
    } else {
      console.log("✅ All tests passed!");
    }
  } catch (error) {
    console.error("Critical error during test run:", error);
  }
}

runTests();
