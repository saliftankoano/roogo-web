"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import { 
  Building, MapPin, Upload, Check, AlertCircle, 
  CreditCard, Home, Loader2, Camera, Shield 
} from "lucide-react";
import { TIERS_CONFIG } from "@/lib/constants";

// Types
interface ListingFormData {
  titre: string;
  type: string;
  prixMensuel: string;
  quartier: string;
  ville: string;
  description: string;
  chambres: string;
  sdb: string;
  superficie: string;
  vehicules: string;
  cautionMois: string;
  equipements: string[];
  interdictions: string[];
}

interface AddOn {
  id: string;
  name: string;
  price: number;
  description: string;
}

export default function CreateListingPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { user } = useUser();
  
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Data
  const [formData, setFormData] = useState<ListingFormData>({
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
    equipements: [],
    interdictions: [],
  });
  
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);
  const [images, setImages] = useState<File[]>([]);
  const [addonsList, setAddonsList] = useState<AddOn[]>([]);

  // Load addons
  useEffect(() => {
    const fetchAddons = async () => {
      try {
        const res = await fetch("/api/pricing");
        if (res.ok) {
          const data = await res.json();
          setAddonsList(data.addons || []);
        }
      } catch (e) {
        console.error("Failed to load addons", e);
      }
    };
    fetchAddons();
  }, []);

  // Auth check
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push("/sign-in");
    } else if (isLoaded && user) {
      const userType = user.publicMetadata.user_type as string;
      if (!["owner", "agent", "staff", "founder"].includes(userType)) {
        router.push("/"); // Unauthorized
      }
    }
  }, [isLoaded, isSignedIn, user, router]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newImages = Array.from(e.target.files);
      setImages(prev => [...prev, ...newImages]);
    }
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const calculateTotal = () => {
    if (!selectedTier) return 0;
    const tier = TIERS_CONFIG[selectedTier as keyof typeof TIERS_CONFIG];
    const baseFee = tier.base_fee;
    
    // 5% commission on first month rent
    const rent = parseInt(formData.prixMensuel) || 0;
    const commission = rent * 0.05;
    
    // Add-ons
    const addonsTotal = selectedAddOns.reduce((sum, id) => {
      const addon = addonsList.find(a => a.id === id);
      return sum + (addon?.price || 0);
    }, 0);
    
    return baseFee + commission + addonsTotal;
  };

  const handleSubmit = async () => {
    if (!selectedTier) {
      setError("Veuillez sélectionner un pack");
      return;
    }
    
    setIsLoading(true);
    setError(null);

    try {
      // 1. Create Property (Draft)
      const propertyRes = await fetch("/api/properties", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          listingData: {
            ...formData,
            chambres: parseInt(formData.chambres),
            sdb: parseInt(formData.sdb),
            superficie: parseInt(formData.superficie),
            vehicules: parseInt(formData.vehicules),
            cautionMois: parseInt(formData.cautionMois),
            prixMensuel: parseInt(formData.prixMensuel),
            tier_id: selectedTier,
            add_ons: selectedAddOns,
            // No payment_id yet
          }
        }),
      });

      const propertyData = await propertyRes.json();
      
      if (!propertyRes.ok) {
        throw new Error(propertyData.error || "Erreur lors de la création de l'annonce");
      }

      const propertyId = propertyData.propertyId;

      // 2. Upload Images
      if (images.length > 0) {
        // We need an endpoint to upload images. 
        // roogo-web usually uses server actions or signed URLs.
        // For now, let's assume we can use the same endpoint as mobile app or similar.
        // Mobile uses: POST /api/properties/${propertyId}/upload-image
        
        for (let i = 0; i < images.length; i++) {
          const file = images[i];
          
          // Convert to base64
          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve) => {
            reader.onload = () => {
              const result = reader.result as string;
              // Remove prefix data:image/jpeg;base64,
              const base64 = result.split(',')[1];
              resolve(base64);
            };
            reader.readAsDataURL(file);
          });
          
          const base64 = await base64Promise;
          
          // Get dimensions (optional but good)
          const img = new Image();
          img.src = URL.createObjectURL(file);
          await new Promise(resolve => img.onload = resolve);
          
          await fetch(`/api/properties/${propertyId}/upload-image`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              data: base64,
              width: img.width,
              height: img.height,
              ext: file.name.split('.').pop() || 'jpg',
              index: i
            })
          });
        }
      }

      // 3. Initiate Payment
      const amount = calculateTotal();
      const paymentRes = await fetch("/api/payments/paymentpage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          description: `Publication ${formData.titre}`,
          transactionType: "listing_submission",
          propertyId,
          tier_id: selectedTier,
          add_ons: selectedAddOns,
          metadata: {
            tier_id: selectedTier,
            add_ons: selectedAddOns,
            commission: (parseInt(formData.prixMensuel) || 0) * 0.05
          }
        })
      });

      const paymentData = await paymentRes.json();
      
      if (!paymentRes.ok) {
        throw new Error(paymentData.error || "Erreur lors de l'initialisation du paiement");
      }

      // 4. Redirect to Payment Page
      if (paymentData.redirectUrl) {
        window.location.href = paymentData.redirectUrl;
      } else {
        throw new Error("URL de paiement manquante");
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Une erreur est survenue");
      setIsLoading(false);
    }
  };

  if (!isLoaded || !isSignedIn) {
    return <div className="flex items-center justify-center min-h-screen"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Publier une propriété</h1>
          <p className="mt-2 text-gray-600">Remplissez le formulaire ci-dessous pour mettre votre bien en ligne</p>
        </div>

        {/* Steps Indicator */}
        <div className="flex justify-center mb-8">
          <div className={`h-2 w-1/3 rounded-l-full ${step >= 1 ? 'bg-black' : 'bg-gray-200'}`} />
          <div className={`h-2 w-1/3 ${step >= 2 ? 'bg-black' : 'bg-gray-200'}`} />
          <div className={`h-2 w-1/3 rounded-r-full ${step >= 3 ? 'bg-black' : 'bg-gray-200'}`} />
        </div>

        <div className="bg-white shadow rounded-2xl p-6 sm:p-8">
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg flex items-center">
              <AlertCircle className="w-5 h-5 mr-2" />
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold flex items-center"><Home className="mr-2" /> Informations Générales</h2>
              
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Titre de l'annonce</label>
                  <input
                    type="text"
                    name="titre"
                    value={formData.titre}
                    onChange={handleInputChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border"
                    placeholder="Ex: Villa duplex à Ouaga 2000"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Type de bien</label>
                  <select
                    name="type"
                    value={formData.type}
                    onChange={handleInputChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border"
                  >
                    <option value="house">Maison</option>
                    <option value="apartment">Appartement</option>
                    <option value="villa">Villa</option>
                    <option value="studio">Studio</option>
                    <option value="commercial">Commercial</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Loyer Mensuel (FCFA)</label>
                  <input
                    type="number"
                    name="prixMensuel"
                    value={formData.prixMensuel}
                    onChange={handleInputChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Ville</label>
                  <select
                    name="ville"
                    value={formData.ville}
                    onChange={handleInputChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border"
                  >
                    <option value="ouaga">Ouagadougou</option>
                    <option value="bobo">Bobo-Dioulasso</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Quartier</label>
                  <input
                    type="text"
                    name="quartier"
                    value={formData.quartier}
                    onChange={handleInputChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Description</label>
                  <textarea
                    name="description"
                    rows={4}
                    value={formData.description}
                    onChange={handleInputChange}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-black focus:ring-black sm:text-sm p-2 border"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  onClick={() => setStep(2)}
                  className="bg-black text-white px-6 py-2 rounded-lg font-medium hover:bg-gray-800"
                >
                  Suivant
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold flex items-center"><Building className="mr-2" /> Détails & Photos</h2>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Chambres</label>
                  <input type="number" name="chambres" value={formData.chambres} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Douches</label>
                  <input type="number" name="sdb" value={formData.sdb} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Superficie (m²)</label>
                  <input type="number" name="superficie" value={formData.superficie} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Parking</label>
                  <input type="number" name="vehicules" value={formData.vehicules} onChange={handleInputChange} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Photos</label>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  {images.map((file, idx) => (
                    <div key={idx} className="relative aspect-square bg-gray-100 rounded-lg overflow-hidden">
                      <img src={URL.createObjectURL(file)} alt="Preview" className="w-full h-full object-cover" />
                      <button onClick={() => removeImage(idx)} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1">
                        <span className="sr-only">Supprimer</span>
                        ×
                      </button>
                    </div>
                  ))}
                  <label className="aspect-square bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100">
                    <Camera className="w-8 h-8 text-gray-400" />
                    <span className="text-xs text-gray-500 mt-2">Ajouter</span>
                    <input type="file" multiple accept="image/*" onChange={handleImageUpload} className="hidden" />
                  </label>
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <button onClick={() => setStep(1)} className="text-gray-600 font-medium">Retour</button>
                <button onClick={() => setStep(3)} className="bg-black text-white px-6 py-2 rounded-lg font-medium hover:bg-gray-800">Suivant</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold flex items-center"><Shield className="mr-2" /> Offre & Paiement</h2>
              
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {(Object.entries(TIERS_CONFIG) as [string, any][]).map(([key, tier]) => (
                  <div 
                    key={key}
                    onClick={() => setSelectedTier(key)}
                    className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${
                      selectedTier === key ? 'border-black bg-gray-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <h3 className="font-bold text-lg capitalize">{key}</h3>
                    <p className="text-2xl font-bold mt-2">{tier.base_fee.toLocaleString()} F</p>
                    <ul className="mt-4 space-y-2 text-sm text-gray-600">
                      <li>• {tier.photo_limit} photos</li>
                      <li>• {tier.slot_limit} candidats</li>
                      {tier.video_included && <li>• Vidéo incluse</li>}
                      {tier.has_badge && <li>• Badge Premium</li>}
                    </ul>
                  </div>
                ))}
              </div>

              {addonsList.length > 0 && (
                <div className="mt-6">
                  <h3 className="font-medium mb-3">Options supplémentaires</h3>
                  <div className="space-y-2">
                    {addonsList.map((addon) => (
                      <label key={addon.id} className="flex items-center p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedAddOns.includes(addon.id)}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedAddOns(prev => [...prev, addon.id]);
                            else setSelectedAddOns(prev => prev.filter(id => id !== addon.id));
                          }}
                          className="h-4 w-4 text-black border-gray-300 rounded focus:ring-black"
                        />
                        <div className="ml-3 flex-1">
                          <span className="font-medium">{addon.name}</span>
                          <span className="text-gray-500 text-sm ml-2">+{addon.price.toLocaleString()} F</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t pt-6 mt-6">
                <div className="flex justify-between items-center mb-6">
                  <span className="text-lg font-medium">Total à payer</span>
                  <span className="text-2xl font-bold">{calculateTotal().toLocaleString()} FCFA</span>
                </div>

                <div className="flex justify-between items-center">
                  <button onClick={() => setStep(2)} className="text-gray-600 font-medium">Retour</button>
                  <button
                    onClick={handleSubmit}
                    disabled={isLoading || !selectedTier}
                    className="bg-black text-white px-8 py-3 rounded-xl font-bold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                  >
                    {isLoading ? <Loader2 className="animate-spin mr-2" /> : <CreditCard className="mr-2" />}
                    Payer et Publier
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
