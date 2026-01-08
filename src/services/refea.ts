// src/services/refea.ts
import refeaRaw from "../data/tableconvert.com_38zydy copy.json";

export type RefEARow = {
  formacertif_libusage: string;
  fil_libusage?: string;
  adresse_ville?: string;
  adresse_codepostal?: string;
  dep_libusage?: string;
  uai_insee_dep?: string;

  uai_libadmin?: string;
  uai_libcom?: string;
  etablissement_niveau_1?: string;

  site_internet?: string;
  adresse_ligne1?: string;

  latitude?: string;
  longitude?: string;

  public_apprenti?: string;
  public_adulte?: string;
  public_eleve?: string;
  public_etudiant?: string;
};

function norm(s: any) {
  return (s ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function loadRefEA(): RefEARow[] {
  const arr = Array.isArray(refeaRaw) ? (refeaRaw as RefEARow[]) : [];
  // On garde uniquement les lignes qui ont un intitulé et une geo exploitable
  return arr.filter((r) => r?.formacertif_libusage && r?.latitude && r?.longitude);
}

export function refeaCityOf(r: RefEARow) {
  return norm(r.adresse_ville);
}

export function refeaTitleOf(r: RefEARow) {
  return norm(r.formacertif_libusage);
}

export function toNumberOrNull(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
