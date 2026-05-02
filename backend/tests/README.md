# Financial Module E2E Tests

Comprehensive end-to-end test suite for the financial module (Income, Expense, Purchase).

## Overview

This test suite validates all CRUD operations and business logic for the financial module. It tests:

- **Income Management**: Create, read, update, delete income records with VAT calculations
- **Expense Tracking**: Create, read, update, delete expenses by category
- **Purchase Orders**: Create, read, update, delete purchases with auto-calculated totals
- **Data Validation**: Schema validation for all three entities
- **Authorization**: Role-based access control and business unit isolation
- **Filtering**: Date ranges, business units, categories, and types

## Prerequisites

1. Backend server running on `http://localhost:3001`
2. Database initialized with seed data
3. Test user credentials in the database (default: `test_admin` / `test123`)

## Setup

### 1. Start the backend server

```bash
cd backend
npm run dev
```

### 2. Initialize database (if needed)

```bash
npm run db:setup
```

### 3. Verify test user exists

Check that your seed data or database contains a test user with:
- Username: `kinderdog_admin`
- Password: `kinderdog123`
- Business Unit: `KINDERDOG`
- Role: `owner`

## Running Tests

### Run all financial tests

```bash
npm run test:financial
```

### Run directly with tsx

```bash
tsx tests/financial.e2e.ts
```

## Test Coverage

### Income CRUD (6 tests)
- ✓ Create income with VAT calculations
- ✓ Read single income
- ✓ Read all incomes with filters
- ✓ Update income details
- ✓ Prevent updates on paid invoices
- ✓ Soft delete income

### Expense CRUD (5 tests)
- ✓ Create expense with category
- ✓ Read single expense
- ✓ Read all expenses with filters
- ✓ Update expense
- ✓ Soft delete expense

### Purchase CRUD (5 tests)
- ✓ Create purchase with auto-calculated totals
- ✓ Read single purchase
- ✓ Read all purchases
- ✓ Update purchase with price recalculation
- ✓ Soft delete purchase

### Validation (3 tests)
- ✓ Reject income with missing required fields
- ✓ Reject income with negative amount
- ✓ Reject expense with invalid category

### Authorization (1 test)
- ✓ Reject requests without valid token

### Filtering (2 tests)
- ✓ Filter incomes by type
- ✓ Filter expenses by date range

## Test Output

Successful test run:

```
🚀 Starting Financial Module E2E Tests

============================================================

📋 Authentication...
✓ Login successful

📊 Testing Income CRUD...
✓ Income: Create
✓ Income: Read
✓ Income: Read All
✓ Income: Update
✓ Income: Cannot update paid
✓ Income: Delete

💰 Testing Expense CRUD...
✓ Expense: Create
✓ Expense: Read
✓ Expense: Read All
✓ Expense: Update
✓ Expense: Delete

🛒 Testing Purchase CRUD...
✓ Purchase: Create
✓ Purchase: Read
✓ Purchase: Read All
✓ Purchase: Update
✓ Purchase: Delete

✔️  Testing Validation...
✓ Validation: Income missing fields
✓ Validation: Income negative amount
✓ Validation: Expense invalid category

🔒 Testing Authorization...
✓ Authorization: Unauthorized access

🔍 Testing Filtering...
✓ Filter: Income by type
✓ Filter: Expense by date range

============================================================

📊 Test Summary:
   Passed: 22/22
   Failed: 0/22
   Total Time: 1234ms

✅ All tests passed!
```

## API Endpoints Tested

### Income Endpoints
- `POST /financial/incomes` - Create
- `GET /financial/incomes` - List with filters
- `GET /financial/incomes/:id` - Read single
- `PUT /financial/incomes/:id` - Update
- `DELETE /financial/incomes/:id` - Soft delete

### Expense Endpoints
- `POST /financial/expenses` - Create
- `GET /financial/expenses` - List with filters
- `GET /financial/expenses/:id` - Read single
- `PUT /financial/expenses/:id` - Update
- `DELETE /financial/expenses/:id` - Soft delete

### Purchase Endpoints
- `POST /financial/purchases` - Create
- `GET /financial/purchases` - List with filters
- `GET /financial/purchases/:id` - Read single
- `PUT /financial/purchases/:id` - Update
- `DELETE /financial/purchases/:id` - Soft delete

## Troubleshooting

### "Cannot find module 'axios'"
```bash
npm install axios
```

### "Failed to connect to localhost:3001"
Ensure backend is running:
```bash
npm run dev
```

### "Login failed"
Verify test user exists in database:
```bash
# Check user in your database
psql $DATABASE_URL -c "SELECT * FROM users WHERE username = 'test_admin';"
```

### "Unauthorized" or "Invalid token"
Check JWT_SECRET matches between frontend and backend environments.

## Implementation Details

The test suite uses:
- **Axios** for HTTP requests
- **Async/await** for clean async handling
- **Type-safe assertions** for validation
- **Automatic cleanup** of test data (soft delete)
- **Parallel execution** where safe

## Notes

- Tests create and clean up their own data
- All deletions use soft delete (isActive = false)
- Tests assume KINDERDOG as default business unit
- Date filters use ISO 8601 format
- VAT calculations: total = amount + vatAmount
- Purchase total: quantity × unitPrice

## Contributing

To add new tests:

1. Create a test function following the pattern:
   ```typescript
   async function testNewFeature(): Promise<void> {
     const client = createClient();
     // Test logic
   }
   ```

2. Add it to the test runner:
   ```typescript
   await test("Feature name", testNewFeature);
   ```

3. Run and verify:
   ```bash
   npm run test:financial
   ```

## License

Part of Pethijos backend test suite
