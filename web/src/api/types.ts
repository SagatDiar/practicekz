export type Role = "STUDENT" | "COMPANY" | "UNIVERSITY";

export interface Me {
  id: string;
  role: Role;
  email: string;
  photoFileId: string | null;
  city: string | null;
  accountStatus?: "ACTIVE" | "PENDING_VERIFICATION" | "UNCLAIMED";
  universityName: string | null;
  student: { firstName: string; lastName: string; faculty: string; specialty: string; course: number; skills: string; city: string } | null;
  company: { companyName: string; industry: string; city: string; bin: string | null; verified: boolean } | null;
  university: { universityName: string; shortName: string; city: string } | null;
}

export interface University { id: string; name: string; shortName: string; city: string }

export interface RegistryUniversity { id: string; registryId: string; name: string; shortName: string; city: string; onPlatform: boolean }
export interface LegalEntityRow { bin: string; name: string; legalForm: string | null; industry: string | null; city: string | null; status: "ACTIVE" | "LIQUIDATED"; registeredAt: string | null; onPlatform: boolean }
export interface EntityLookup { bin: string; name: string; legalForm: string | null; industry: string | null; city: string | null; active: boolean; registered: boolean }
export interface Paged<T> { items: T[]; total: number; page: number; pages: number; limit: number }
