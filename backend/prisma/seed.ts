import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.count();
  if (existing > 0) {
    console.log("DB already seeded, skipping.");
    return;
  }

  const hash = (pw: string) => bcrypt.hashSync(pw, 10);

  await prisma.user.createMany({
    data: [
      { username: "kinderdog_admin", passwordHash: hash("kinderdog123"), name: "Admin Kinderdog", businessUnit: "KINDERDOG", role: "owner" },
      { username: "pethijos_admin", passwordHash: hash("pethijos123"), name: "Admin Pethijos", businessUnit: "PETHIJOS", role: "owner" },
    ],
  });

  await prisma.room.createMany({
    data: [
      { name: "Recepción", businessUnit: "KINDERDOG", capacity: 1, type: "reception" },
      { name: "Patio Principal", businessUnit: "KINDERDOG", capacity: 20, type: "daycare" },
      { name: "Zona Aromaterapia", businessUnit: "KINDERDOG", capacity: 5, type: "daycare" },
      { name: "Cuarto Entrenamiento", businessUnit: "KINDERDOG", capacity: 4, type: "daycare" },
      { name: "Terraza", businessUnit: "KINDERDOG", capacity: 10, type: "daycare" },
      { name: "Cuarto de Juegos", businessUnit: "KINDERDOG", capacity: 8, type: "daycare" },
      { name: "Sala Peluquería Canina", businessUnit: "PETHIJOS", capacity: 3, type: "grooming" },
      { name: "Sala Peluquería Felina", businessUnit: "PETHIJOS", capacity: 2, type: "grooming" },
    ],
  });

  const provider = await prisma.provider.create({
    data: {
      name: "Proveedor General",
      product: "Alimentos y suministros",
      city: "Quito",
      province: "Pichincha",
      isActive: true,
    },
  });

  const client = await prisma.client.create({
    data: {
      firstName: "María",
      lastName: "González",
      phone: "0991234567",
      email: "maria.gonzalez@email.com",
      city: "Quito",
      province: "Pichincha",
      isActive: true,
      firstServiceDate: new Date(),
    },
  });

  const pet = await prisma.pet.create({
    data: {
      clientId: client.id,
      name: "Max",
      species: "dog",
      breed: "Labrador",
      sex: "M",
      color: "Amarillo",
      weight: 25,
      isNeutered: true,
      isActive: true,
    },
  });

  const room = await prisma.room.findFirst({ where: { businessUnit: "KINDERDOG", type: "daycare" } });

  if (room) {
    const today = new Date();
    const checkin = new Date(today);
    checkin.setHours(8, 0, 0, 0);
    const checkout = new Date(today);
    checkout.setHours(18, 0, 0, 0);

    const reservation = await prisma.reservation.create({
      data: {
        businessUnit: "KINDERDOG",
        clientId: client.id,
        roomId: room.id,
        service: "GUARDERIA",
        status: "CONFIRMADA",
        checkIn: checkin,
        checkOut: checkout,
        basePrice: 25,
        vatPercent: 15,
        vatAmount: 3.75,
        totalAmount: 28.75,
        pendingAmount: 28.75,
        paymentMethod: "EFECTIVO",
        concept: "Guardería diaria",
      },
    });

    await prisma.reservationPet.create({
      data: { reservationId: reservation.id, petId: pet.id },
    });
  }

  await prisma.payable.create({
    data: {
      businessUnit: "KINDERDOG",
      providerId: provider.id,
      type: "GASTO",
      category: "renta",
      description: "Arriendo local mes de enero",
      subtotal: 800,
      vatPercent: 0,
      vatAmount: 0,
      total: 800,
      paid: 800,
      balance: 0,
      status: "PAGADO",
    },
  });

  await prisma.inventoryItem.createMany({
    data: [
      { businessUnit: "KINDERDOG", name: "Concentrado Premium", category: "alimentos", unit: "kg", minStock: 5, currentStock: 20, unitCost: 4.5 },
      { businessUnit: "KINDERDOG", name: "Shampoo Canino", category: "higiene", unit: "lt", minStock: 2, currentStock: 5, unitCost: 8 },
      { businessUnit: "PETHIJOS", name: "Tijeras de corte", category: "herramientas", unit: "unidad", minStock: 1, currentStock: 3, unitCost: 35 },
      { businessUnit: "PETHIJOS", name: "Máquina peladora", category: "herramientas", unit: "unidad", minStock: 1, currentStock: 2, unitCost: 120 },
    ],
  });

  console.log("Seed completed successfully.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
