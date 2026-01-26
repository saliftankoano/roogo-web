"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import {
  DotsThreeVerticalIcon,
  CaretDownIcon,
  CheckIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  UploadSimpleIcon,
  HouseIcon,
  MapPinIcon,
  InfoIcon,
  ImageIcon,
  XIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { Property, fetchProperties } from "@/lib/data";
import { PropertyCard } from "@/components/PropertyCard";
import { motion, AnimatePresence } from "framer-motion";
import {
  ExpandableScreen,
  ExpandableScreenContent,
  ExpandableScreenTrigger,
  useExpandableScreen,
} from "@/components/ui/expandable-screen";
import { useAuth } from "@clerk/nextjs";
import Image from "next/image";

// Helper component to access expand/collapse context
function PropertyFormFooter({ isSubmitting }: { isSubmitting: boolean }) {
  const { collapse } = useExpandableScreen();

  return (
    <div className="pt-12 border-t border-neutral-100 flex flex-col sm:flex-row gap-4">
      <button
        type="button"
        onClick={collapse}
        className="flex-1 py-5 bg-neutral-100 text-neutral-600 rounded-full font-bold text-xl hover:bg-neutral-200 transition-all active:scale-[0.98]"
      >
        Annuler
      </button>
      <button
        type="submit"
        disabled={isSubmitting}
        className="flex-2 py-5 bg-primary text-white rounded-full font-bold text-xl shadow-xl shadow-primary/20 hover:bg-primary/90 transition-all active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-70"
      >
        {isSubmitting ? (
          <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-white"></div>
        ) : (
          <>
            <UploadSimpleIcon size={28} weight="bold" />
            <span>Publier Immédiatement</span>
          </>
        )}
      </button>
    </div>
  );
}

export default function AdminListingsPage() {
  const { getToken } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  // Form state for new property
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    titre: "",
    type: "house",
    prixMensuel: "",
    quartier: "",
    ville: "ouaga",
    description: "",
    chambres: "",
    sdb: "",
    superficie: "",
    vehicules: "",
    cautionMois: "3",
  });

  // Image state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadProperties() {
      const { properties: data } = await fetchProperties();
      setProperties(data);
      setLoading(false);
    }
    loadProperties();
  }, []);

  const filteredListings = useMemo(() => {
    return properties.filter((listing) => {
      const matchesSearch =
        listing.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        listing.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesLocation =
        locationFilter === "all" ||
        listing.city?.toLowerCase() === locationFilter.toLowerCase() ||
        listing.quartier?.toLowerCase() === locationFilter.toLowerCase();
      const matchesType =
        typeFilter === "all" ||
        listing.propertyType.toLowerCase() === typeFilter.toLowerCase();
      const matchesCategory =
        categoryFilter === "all" || listing.category === categoryFilter;

      return matchesSearch && matchesLocation && matchesType && matchesCategory;
    });
  }, [properties, searchQuery, locationFilter, typeFilter, categoryFilter]);

  // Extract unique values for filters
  const locations = useMemo(
    () =>
      Array.from(
        new Set(
          properties
            .map((p) => p.city)
            .filter((city): city is string => !!city),
        ),
      ),
    [properties],
  );
  const propertyTypes = useMemo(
    () =>
      Array.from(
        new Set(
          properties
            .map((p) => p.propertyType)
            .filter((type): type is string => !!type),
        ),
      ),
    [properties],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setSelectedFiles((prev) => [...prev, ...files]);

      const newPreviews = files.map((file) => URL.createObjectURL(file));
      setPreviews((prev) => [...prev, ...newPreviews]);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = reader.result as string;
        // Remove the data:image/jpeg;base64, prefix
        resolve(base64String.split(",")[1]);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleCreateProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const token = await getToken();
      if (!token) throw new Error("No token found");

      // 1. Create the property
      const response = await fetch("/api/properties", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          listingData: {
            ...formData,
            prixMensuel: Number(formData.prixMensuel),
            chambres: Number(formData.chambres),
            sdb: Number(formData.sdb),
            superficie: Number(formData.superficie),
            vehicules: Number(formData.vehicules),
            cautionMois: Number(formData.cautionMois),
            equipements: [],
            interdictions: [],
            add_ons: [],
          },
        }),
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || "Failed to create property");
      }

      const propertyId = result.propertyId;

      // 2. Upload images if any
      if (selectedFiles.length > 0) {
        const base64Images = await Promise.all(
          selectedFiles.map(async (file) => {
            const base64 = await fileToBase64(file);
            const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
            return { data: base64, ext };
          }),
        );

        const uploadResponse = await fetch(
          `/api/properties/${propertyId}/upload-images`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ images: base64Images }),
          },
        );

        const uploadResult = await uploadResponse.json();
        if (!uploadResult.success) {
          console.error("Image upload failed:", uploadResult.error);
          alert("Propriété créée mais l&apos;upload des images a échoué.");
        }
      }

      alert("Propriété ajoutée avec succès !");
      window.location.reload();
    } catch (error) {
      console.error("Error creating property:", error);
      alert(
        error instanceof Error
          ? error.message
          : "Erreur lors de la création de la propriété.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Customer Filter Section */}
      <div className="bg-white p-8 sm:p-10 rounded-[40px] border border-neutral-100 shadow-sm relative">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold text-neutral-900 tracking-tight">
            Filtres des propriétés
          </h2>
          <div className="flex items-center gap-3">
            <ExpandableScreen
              layoutId="add-property-staff"
              contentRadius="32px"
            >
              <ExpandableScreenTrigger>
                <div className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-full font-bold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all active:scale-95 cursor-pointer">
                  <PlusIcon size={20} weight="bold" />
                  <span>Nouveau Bien</span>
                </div>
              </ExpandableScreenTrigger>

              <ExpandableScreenContent
                className="bg-neutral-50"
                closeButtonClassName="text-neutral-400 hover:bg-neutral-200"
              >
                <div className="max-w-5xl mx-auto py-12 px-6">
                  <div className="mb-10 text-center">
                    <h2 className="text-4xl font-bold text-neutral-900 mb-4">
                      Ajouter une propriété (Staff)
                    </h2>
                    <p className="text-neutral-500 text-lg max-w-2xl mx-auto">
                      En tant que membre du staff, vous pouvez ajouter des biens
                      gratuitement. Ils seront vérifiés et mis en ligne
                      immédiatement.
                    </p>
                  </div>

                  <form
                    onSubmit={handleCreateProperty}
                    className="space-y-8 bg-white p-10 rounded-[40px] border border-neutral-100 shadow-xl"
                  >
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                      {/* Left Column: Info */}
                      <div className="space-y-8">
                        {/* Basic Info */}
                        <div className="space-y-6">
                          <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                            <HouseIcon size={20} className="text-primary" />
                            Informations de base
                          </h3>

                          <div className="space-y-2">
                            <label className="text-sm font-bold text-neutral-700 ml-1">
                              Titre de l&apos;annonce
                            </label>
                            <input
                              required
                              placeholder="Ex: Villa moderne avec piscine"
                              className="w-full px-6 py-4 bg-neutral-50 rounded-2xl border border-neutral-100 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                              value={formData.titre}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  titre: e.target.value,
                                })
                              }
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="text-sm font-bold text-neutral-700 ml-1">
                                Type
                              </label>
                              <select
                                className="w-full px-6 py-4 bg-neutral-50 rounded-2xl border border-neutral-100 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none appearance-none"
                                value={formData.type}
                                onChange={(e) =>
                                  setFormData({
                                    ...formData,
                                    type: e.target.value,
                                  })
                                }
                              >
                                <option value="house">Maison</option>
                                <option value="apartment">Appartement</option>
                                <option value="villa">Villa</option>
                                <option value="studio">Studio</option>
                                <option value="commercial">Commerce</option>
                              </select>
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-bold text-neutral-700 ml-1">
                                Prix (CFA/mois)
                              </label>
                              <input
                                required
                                type="number"
                                placeholder="500000"
                                className="w-full px-6 py-4 bg-neutral-50 rounded-2xl border border-neutral-100 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                                value={formData.prixMensuel}
                                onChange={(e) =>
                                  setFormData({
                                    ...formData,
                                    prixMensuel: e.target.value,
                                  })
                                }
                              />
                            </div>
                          </div>
                        </div>

                        {/* Location */}
                        <div className="space-y-6">
                          <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                            <MapPinIcon size={20} className="text-primary" />
                            Localisation
                          </h3>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="text-sm font-bold text-neutral-700 ml-1">
                                Ville
                              </label>
                              <select
                                className="w-full px-6 py-4 bg-neutral-50 rounded-2xl border border-neutral-100 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none appearance-none"
                                value={formData.ville}
                                onChange={(e) =>
                                  setFormData({
                                    ...formData,
                                    ville: e.target.value,
                                  })
                                }
                              >
                                <option value="ouaga">Ouagadougou</option>
                                <option value="bobo">Bobo-Dioulasso</option>
                              </select>
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-bold text-neutral-700 ml-1">
                                Quartier
                              </label>
                              <input
                                required
                                placeholder="Ex: Ouaga 2000"
                                className="w-full px-6 py-4 bg-neutral-50 rounded-2xl border border-neutral-100 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                                value={formData.quartier}
                                onChange={(e) =>
                                  setFormData({
                                    ...formData,
                                    quartier: e.target.value,
                                  })
                                }
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-bold text-neutral-700 ml-1">
                              Caution (mois)
                            </label>
                            <input
                              type="number"
                              className="w-full px-6 py-4 bg-neutral-50 rounded-2xl border border-neutral-100 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                              value={formData.cautionMois}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  cautionMois: e.target.value,
                                })
                              }
                            />
                          </div>
                        </div>

                        {/* Details */}
                        <div className="space-y-6">
                          <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                            <InfoIcon size={20} className="text-primary" />
                            Détails du bien
                          </h3>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider ml-1">
                                Chambres
                              </label>
                              <input
                                type="number"
                                placeholder="0"
                                className="w-full px-6 py-4 bg-neutral-50 rounded-2xl border border-neutral-100 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                                value={formData.chambres}
                                onChange={(e) =>
                                  setFormData({
                                    ...formData,
                                    chambres: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider ml-1">
                                SDB
                              </label>
                              <input
                                type="number"
                                placeholder="0"
                                className="w-full px-6 py-4 bg-neutral-50 rounded-2xl border border-neutral-100 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                                value={formData.sdb}
                                onChange={(e) =>
                                  setFormData({
                                    ...formData,
                                    sdb: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider ml-1">
                                m²
                              </label>
                              <input
                                type="number"
                                placeholder="0"
                                className="w-full px-6 py-4 bg-neutral-50 rounded-2xl border border-neutral-100 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                                value={formData.superficie}
                                onChange={(e) =>
                                  setFormData({
                                    ...formData,
                                    superficie: e.target.value,
                                  })
                                }
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider ml-1">
                                Parkings
                              </label>
                              <input
                                type="number"
                                placeholder="0"
                                className="w-full px-6 py-4 bg-neutral-50 rounded-2xl border border-neutral-100 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                                value={formData.vehicules}
                                onChange={(e) =>
                                  setFormData({
                                    ...formData,
                                    vehicules: e.target.value,
                                  })
                                }
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-bold text-neutral-700 ml-1">
                              Description
                            </label>
                            <textarea
                              rows={4}
                              placeholder="Décrivez le bien en quelques lignes..."
                              className="w-full px-6 py-4 bg-neutral-50 rounded-3xl border border-neutral-100 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none resize-none"
                              value={formData.description}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  description: e.target.value,
                                })
                              }
                            />
                          </div>
                        </div>
                      </div>

                      {/* Right Column: Photos */}
                      <div className="space-y-6">
                        <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                          <ImageIcon size={20} className="text-primary" />
                          Photos du bien
                        </h3>

                        <div
                          onClick={() => fileInputRef.current?.click()}
                          className="border-2 border-dashed border-neutral-200 rounded-[32px] p-12 flex flex-col items-center justify-center gap-4 hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer group"
                        >
                          <div className="w-16 h-16 bg-neutral-50 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                            <UploadSimpleIcon
                              size={32}
                              className="text-neutral-400 group-hover:text-primary"
                            />
                          </div>
                          <div className="text-center">
                            <p className="text-lg font-bold text-neutral-900">
                              Cliquez pour ajouter des photos
                            </p>
                            <p className="text-neutral-500">
                              PNG, JPG ou WEBP jusqu&apos;à 10MB
                            </p>
                          </div>
                          <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            multiple
                            accept="image/*"
                            className="hidden"
                          />
                        </div>

                        {previews.length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6">
                            {previews.map((preview, index) => (
                              <div
                                key={index}
                                className="relative aspect-square rounded-2xl overflow-hidden group border border-neutral-100"
                              >
                                <Image
                                  src={preview}
                                  alt={`Preview ${index}`}
                                  fill
                                  className="object-cover"
                                />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeFile(index);
                                  }}
                                  className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                                >
                                  <XIcon size={14} weight="bold" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <PropertyFormFooter isSubmitting={isSubmitting} />
                  </form>
                </div>
              </ExpandableScreenContent>
            </ExpandableScreen>

            <button className="p-2.5 hover:bg-neutral-50 rounded-full transition-colors border border-neutral-100 shadow-sm">
              <DotsThreeVerticalIcon
                size={24}
                weight="bold"
                className="text-neutral-400"
              />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="space-y-3">
            <label className="text-[13px] font-bold text-neutral-900 ml-4 uppercase tracking-wider opacity-60">
              Mot-clé
            </label>
            <div className="relative group">
              <input
                type="text"
                placeholder="Entrez un mot-clé..."
                className="w-full pl-12 pr-6 py-4 bg-neutral-50/50 rounded-full border border-neutral-100 focus:bg-white focus:ring-4 focus:ring-primary/5 focus:border-primary/20 transition-all text-[15px] placeholder:text-neutral-300 font-medium"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <div className="absolute left-5 top-1/2 -translate-y-1/2 text-neutral-300 group-focus-within:text-primary transition-colors">
                <MagnifyingGlassIcon size={20} weight="bold" />
              </div>
            </div>
          </div>

          <FilterSelect
            label="Localisation"
            value={locationFilter}
            onChange={setLocationFilter}
            options={locations}
            placeholder="Toutes les zones"
          />

          <FilterSelect
            label="Type de bien"
            value={typeFilter}
            onChange={setTypeFilter}
            options={propertyTypes}
            placeholder="Tous les types"
          />

          <FilterSelect
            label="Catégorie"
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={["Residential", "Business"]}
            placeholder="Toutes catégories"
          />
        </div>
      </div>

      {/* Property Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          <p className="text-neutral-400 font-medium">
            Chargement des biens...
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredListings.map((listing) => (
            <Link
              href={`/admin/listings/${listing.id}`}
              key={listing.id}
              className="block relative group"
            >
              <div className="absolute top-7 right-7 z-10">
                <span
                  className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm border backdrop-blur-sm ${
                    listing.status === "en_ligne"
                      ? "bg-green-100/90 text-green-800 border-green-200"
                      : listing.status === "locked"
                        ? "bg-primary/90 text-white border-primary/20"
                        : listing.status === "finalized"
                          ? "bg-neutral-900 text-white border-neutral-800"
                          : listing.status === "en_attente"
                            ? "bg-yellow-100 text-yellow-900 border-yellow-300"
                            : "bg-neutral-100/90 text-neutral-600 border-neutral-200"
                  }`}
                >
                  {listing.status === "en_ligne"
                    ? "En ligne"
                    : listing.status === "locked"
                      ? "Réservé"
                      : listing.status === "finalized"
                        ? "Loué"
                        : listing.status === "en_attente"
                          ? "En attente"
                          : listing.status === "expired"
                            ? "Expiré"
                            : listing.status}
                </span>
              </div>
              <PropertyCard property={listing} />
            </Link>
          ))}
        </div>
      )}

      {!loading && filteredListings.length === 0 && (
        <div className="flex flex-col items-center justify-center py-32 text-center bg-white rounded-[40px] border border-neutral-100 shadow-sm">
          <div className="w-20 h-20 bg-neutral-50 rounded-full flex items-center justify-center mb-6">
            <MagnifyingGlassIcon size={40} className="text-neutral-300" />
          </div>
          <h3 className="text-xl font-bold text-neutral-900 mb-2">
            Aucun résultat trouvé
          </h3>
          <p className="text-neutral-500 max-w-sm mx-auto font-medium">
            Nous n&apos;avons trouvé aucune propriété correspondant à vos
            critères.
          </p>
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedLabel = value === "all" ? placeholder : value;

  return (
    <div className="space-y-3" ref={dropdownRef}>
      <label className="text-[13px] font-bold text-neutral-900 ml-4 uppercase tracking-wider opacity-60">
        {label}
      </label>
      <div className="relative group">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full flex items-center justify-between pl-6 pr-5 py-4 bg-neutral-50/50 rounded-full border transition-all text-[15px] font-bold text-left ${
            isOpen
              ? "bg-white ring-4 ring-primary/5 border-primary/20 text-primary"
              : "border-neutral-100 text-neutral-900 hover:border-neutral-200"
          }`}
        >
          <span className="truncate">{selectedLabel}</span>
          <div
            className={`transition-transform duration-300 ${
              isOpen ? "rotate-180 text-primary" : "text-neutral-300"
            }`}
          >
            <CaretDownIcon size={20} weight="bold" />
          </div>
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute top-full left-0 right-0 mt-3 bg-white rounded-[24px] p-2 shadow-2xl border border-neutral-100 z-50 max-h-[300px] overflow-y-auto"
            >
              <button
                onClick={() => {
                  onChange("all");
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                  value === "all"
                    ? "bg-primary/10 text-primary"
                    : "text-neutral-600 hover:bg-neutral-50"
                }`}
              >
                {placeholder}
                {value === "all" && <CheckIcon size={16} weight="bold" />}
              </button>
              <div className="h-px bg-neutral-50 my-1 mx-2" />
              {options.map((opt) => (
                <button
                  key={opt}
                  onClick={() => {
                    onChange(opt);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                    value === opt
                      ? "bg-primary/10 text-primary"
                      : "text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  {opt}
                  {value === opt && <CheckIcon size={16} weight="bold" />}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
