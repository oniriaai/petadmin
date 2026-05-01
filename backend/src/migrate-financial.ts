import "dotenv/config";
import { prisma } from "./db";

const sql = `
-- Add isActive column to incomes if not exists
ALTER TABLE incomes ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Create expenses table
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  business_unit TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL DEFAULT 0,
  provider TEXT NOT NULL,
  date TIMESTAMP NOT NULL DEFAULT NOW(),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create purchases table
CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  business_unit TEXT NOT NULL,
  description TEXT NOT NULL,
  quantity DOUBLE PRECISION NOT NULL DEFAULT 1,
  unit_price DOUBLE PRECISION NOT NULL DEFAULT 0,
  total_price DOUBLE PRECISION NOT NULL DEFAULT 0,
  provider TEXT NOT NULL,
  date TIMESTAMP NOT NULL DEFAULT NOW(),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_expenses_business_unit ON expenses(business_unit);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_is_active ON expenses(is_active);
CREATE INDEX IF NOT EXISTS idx_purchases_business_unit ON purchases(business_unit);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(date);
CREATE INDEX IF NOT EXISTS idx_purchases_is_active ON purchases(is_active);
`;

(async () => {
  try {
    console.log("Starting financial module migration...");
    
    const statements = sql.split(';').filter(s => s.trim());
    for (const stmt of statements) {
      try {
        await prisma.$executeRawUnsafe(stmt);
        console.log('✓', stmt.trim().substring(0, 50) + '...');
      } catch(e: any) {
        if (e.message.includes('already exists') || e.message.includes('duplicate')) {
          console.log('✓ (already exists)', stmt.trim().substring(0, 50) + '...');
        } else {
          console.error('Error:', e.message);
        }
      }
    }
    
    console.log('\n✓ Migration completed successfully');
    await prisma.$disconnect();
  } catch(err) {
    console.error('Migration error:', err);
    await prisma.$disconnect();
    process.exit(1);
  }
})();
