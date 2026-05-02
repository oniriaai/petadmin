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

  const client1 = await prisma.client.create({
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

  const client2 = await prisma.client.create({
    data: {
      firstName: "Juan",
      lastName: "Pérez",
      phone: "0987654321",
      email: "juan.perez@email.com",
      city: "Quito",
      province: "Pichincha",
      isActive: true,
      firstServiceDate: new Date(),
    },
  });

  const pet1 = await prisma.pet.create({
    data: {
      clientId: client1.id,
      name: "Max",
      species: "dog",
      breed: "Labrador",
      sex: "M",
      color: "Negro",
      weight: 25,
      isNeutered: true,
      isActive: true,
      photoUrl: "https://s3.us-east-005.backblazeb2.com/pethijos-kinderdog/pets/Max_Mar_a_Gonz_lez/1777675172163-08143f74-f495-42a9-92c1-e476bbb89adb.jpeg",
    },
  });

  const pet2 = await prisma.pet.create({
    data: {
      clientId: client2.id,
      name: "Buddy",
      species: "dog",
      breed: "Golden Retriever",
      sex: "M",
      color: "Dorado",
      weight: 28.5,
      height: 62,
      isNeutered: true,
      isActive: true,
      photoUrl: "https://s3.us-east-005.backblazeb2.com/pethijos-kinderdog/pets/Buddy_Juan_P_rez/1777674775376-cheems_.jpg",
    },
  });

  const room = await prisma.room.findFirst({ where: { businessUnit: "KINDERDOG", type: "daycare" } });

  if (room) {
    const today = new Date();
    const checkin = new Date(today);
    checkin.setHours(8, 0, 0, 0);
    const checkout = new Date(today);
    checkout.setHours(18, 0, 0, 0);

    // Reservation for Max
    const res1 = await prisma.reservation.create({
      data: {
        businessUnit: "KINDERDOG",
        clientId: client1.id,
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
        concept: "Guardería diaria - Max",
      },
    });

    await prisma.reservationPet.create({
      data: { reservationId: res1.id, petId: pet1.id },
    });

    // Reservation for Buddy
    const res2 = await prisma.reservation.create({
      data: {
        businessUnit: "KINDERDOG",
        clientId: client2.id,
        roomId: room.id,
        service: "GUARDERIA",
        status: "PENDIENTE",
        checkIn: checkin,
        checkOut: checkout,
        basePrice: 25,
        vatPercent: 15,
        vatAmount: 3.75,
        totalAmount: 28.75,
        pendingAmount: 28.75,
        paymentMethod: "EFECTIVO",
        concept: "Guardería diaria - Buddy",
      },
    });

    await prisma.reservationPet.create({
      data: { reservationId: res2.id, petId: pet2.id },
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
