// Data the rental-agreement PDF route hands to the documents. The route
// resolves labels (interdictions, city, amenities) before building this, so
// the documents and the field builder never touch the database or lookups.

export interface AgreementPdfParty {
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface AgreementPdfProperty {
  address?: string | null;
  quartier?: string | null;
  /** Display label ("Ouagadougou"), not the picker id ("ouaga"). */
  city?: string | null;
  price?: number | null;
  property_type?: string | null;
  /** Surface in m2 (properties.area). */
  area?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  /** Amenity display names from property_amenities. */
  amenities?: string[];
}

export interface AgreementPdfData {
  id: string;
  monthly_rent: number;
  caution_mois: number | null;
  loyer_avance_mois?: number | null;
  property_frequence?: string | null;
  start_date: string | null;
  end_date: string | null;
  dos_and_donts: string[];
  /** Already resolved to labels ("Pas d'animaux"). */
  interdictions: string[];
  terms_text: string | null;
  owner_signed_at: string | null;
  renter_signed_at: string | null;
  payment_metadata?: Record<string, unknown> | null;
  property?: AgreementPdfProperty | null;
  owner?: AgreementPdfParty | null;
  renter?: AgreementPdfParty | null;
}
