// Compares the text a vision read found on a generated poster with what the
// poster was supposed to say. AI image models can garble a price or a phone
// number, so every poster gets this check and mismatches are shown, never
// silently accepted.

export type ExpectedText = {
  price?: string | number;
  phone?: string;
  place?: string;
  lines?: string[];
};

export type FieldCheck = {
  key: "price" | "phone" | "place" | "line";
  label: string;
  expected: string;
  found: boolean;
};

export type PosterCheck = { ok: boolean; fields: FieldCheck[] };

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]/g, "");
}

export function comparePosterText(
  read: ReadonlyArray<string>,
  expected: ExpectedText,
): PosterCheck {
  const joinedDigits = digits(read.join(" "));
  const joinedFolded = fold(read.join(" "));
  const fields: FieldCheck[] = [];

  if (expected.price !== undefined && String(expected.price).trim()) {
    const wanted = digits(String(expected.price));
    const found =
      wanted.length > 0 &&
      (read.some((s) => digits(s).includes(wanted)) || joinedDigits.includes(wanted));
    fields.push({ key: "price", label: "Prix", expected: String(expected.price), found });
  }

  if (expected.phone) {
    // The last 8 digits identify a Burkina number, with or without +226.
    const wanted = digits(expected.phone).slice(-8);
    fields.push({
      key: "phone",
      label: "Téléphone",
      expected: expected.phone,
      found: wanted.length === 8 && joinedDigits.includes(wanted),
    });
  }

  if (expected.place) {
    const wanted = fold(expected.place);
    fields.push({
      key: "place",
      label: "Quartier",
      expected: expected.place,
      found: wanted.length > 0 && joinedFolded.includes(wanted),
    });
  }

  for (const line of expected.lines ?? []) {
    const wanted = fold(line);
    if (!wanted) continue;
    fields.push({
      key: "line",
      label: "Texte",
      expected: line,
      found: joinedFolded.includes(wanted),
    });
  }

  return { ok: fields.every((f) => f.found), fields };
}
