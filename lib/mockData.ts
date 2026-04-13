export const isDevelopment = () => {
  return process.env.NODE_ENV === "development";
};

export const getMockPropertyData = () => {
  return {
    type: "villa" as const,
    prixMensuel: "450000",
    quartier: "Ouaga 2000",
    ville: "ouaga" as const,
    latitude: 12.3714,
    longitude: -1.5197,
    description:
      "Magnifique villa située dans le quartier prisé de Ouaga 2000. Cette propriété offre un grand confort avec ses finitions modernes, son grand jardin et sa piscine privée. Idéale pour une famille ou des expatriés.",
    chambres: "4",
    sdb: "3",
    superficie: "350",
    vehicules: "2",
    cautionMois: "3",
    equipements: ["wifi", "securite", "piscine", "jardin"],
    interdictions: ["no_fumeurs", "no_animaux"],
  };
};

export const getMockPropertyPhotos = async (): Promise<File[]> => {
  const photoPaths = [
    "/mock-property/property-1.jpg",
    "/mock-property/property-2.jpg",
    "/mock-property/property-3.jpg",
  ];

  const files: File[] = [];

  for (const path of photoPaths) {
    try {
      const response = await fetch(path);
      const blob = await response.blob();
      const filename = path.split("/").pop() || "image.jpg";
      const file = new File([blob], filename, {
        type: blob.type,
        lastModified: new Date().getTime(),
      });
      files.push(file);
    } catch (error) {
      console.error(`Failed to load mock photo: ${path}`, error);
    }
  }

  return files;
};
