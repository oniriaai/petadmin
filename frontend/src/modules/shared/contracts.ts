export type BusinessUnit = "KINDERDOG" | "PETHIJOS";
export type UserRole = "admin" | "kinderdog" | "pethijos";

export interface ClientSummary {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  whatsapp?: string | null;
}

export interface PetSummary {
  id: string;
  name: string;
  species: string;
  breed?: string | null;
  photoUrl?: string | null;
}

export interface ClientWithPets extends ClientSummary {
  pets: PetSummary[];
}
