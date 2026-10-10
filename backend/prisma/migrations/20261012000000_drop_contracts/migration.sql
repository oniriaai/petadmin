-- Contracts were removed from the product: the API, the Herramientas tab and the table go
-- together. This deletes every tenant's contract rows; there is no way back but a backup.
DROP TABLE "contracts";
