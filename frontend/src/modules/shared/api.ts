import { api } from "../../lib/api";
import type { ClientSummary, ClientWithPets, PetSummary } from "./contracts";

export interface ClientListRecord extends ClientWithPets {
  email?: string | null;
  isActive?: boolean;
}

export interface PetListRecord extends PetSummary {
  client?: ClientSummary;
  sex?: string;
  isActive?: boolean;
}

export const clientsApi = {
  list: (query = "") => api.get<ClientListRecord[]>(`/clients${query}`),
  /** One tutor with its pets. Needed wherever a pet picker must be scoped to its owner. */
  get: (id: string) => api.get<ClientListRecord>(`/clients/${id}`),
  create: (body: unknown) => api.post<ClientListRecord>("/clients", body),
  update: (id: string, body: unknown) => api.put<ClientListRecord>(`/clients/${id}`, body),
};

export const petsApi = {
  list: (query = "") => api.get<PetListRecord[]>(`/pets${query}`),
  create: (body: unknown) => api.post<PetListRecord>("/pets", body),
  update: (id: string, body: unknown) => api.put<PetListRecord>(`/pets/${id}`, body),
};
