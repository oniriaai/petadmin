-- Ending a user's sessions when their password is reset.
--
-- A token is stateless and valid for 12 hours. `requireAuth` already re-reads whether the user
-- is active and what role it holds, but nothing tied a token to the password it was issued
-- under: after a reset, whoever held the old token (the reason for most resets) kept working
-- until it expired. Each token now carries the epoch it was issued in, and a reset moves it on.
--
-- Existing rows start at 0, and a token with no epoch is read as 0, so nobody is signed out by
-- this migration.
ALTER TABLE "users" ADD COLUMN "sessionEpoch" INTEGER NOT NULL DEFAULT 0;
