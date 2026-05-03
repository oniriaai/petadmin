import { prisma } from "../db";

const DEFAULT_TIMEZONE = "America/Guayaquil";

export async function getBusinessUnitTimezone(businessUnit: string): Promise<string> {
  const setting = await prisma.businessUnitSetting.findUnique({
    where: { businessUnit },
    select: { timezone: true },
  });
  return setting?.timezone || DEFAULT_TIMEZONE;
}

