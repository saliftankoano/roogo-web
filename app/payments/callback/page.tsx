"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Loader2, AlertCircle } from "lucide-react";
import { useAuth, useUser } from "@clerk/nextjs";
import {
  getPendingPhotos,
  type PendingPhoto,
  removePendingPhotos,
} from "@/lib/clientPendingPhotos";
import { uploadCompressedPropertyPhotos } from "@/lib/clientPropertyPhotoUpload";

function PaymentCallbackContent() {
  const searchParams = useSearchParams();
  const depositId = searchParams.get("depositId");

  return <PaymentStatusChecker depositId={depositId} />;
}

export default function PaymentCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center animate-pulse">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        </div>
      }
    >
      <PaymentCallbackContent />
    </Suspense>
  );
}

type PaymentContext = {
  transactionType: string | null;
  amount: number | null;
  currency: string;
  propertyId: string | null;
  propertyLabel: string | null;
  tierId: string | null;
  addOns: string[];
  description: string | null;
};

function PaymentStatusChecker({ depositId }: { depositId: string | null }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const [status, setStatus] = useState<
    "loading" | "success" | "failed" | "pending"
  >("loading");
  const [message, setMessage] = useState("Vérification du paiement...");
  const [attempts, setAttempts] = useState(0);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [paymentContext, setPaymentContext] = useState<PaymentContext | null>(
    null,
  );
  const [needsListingFinalization, setNeedsListingFinalization] =
    useState(false);
  const [listingFinalized, setListingFinalized] = useState(false);
  const finalizeOnceRef = useRef(false);

  const rawUserType =
    user?.publicMetadata?.userType || user?.publicMetadata?.user_type;
  const userType =
    typeof rawUserType === "string" ? rawUserType.toLowerCase() : "";
  const destination =
    userType === "staff" || userType === "founder"
      ? "/admin/annonces"
      : userType === "owner" || userType === "agent"
        ? "/mes-proprietes"
        : "/proprietes";

  useEffect(() => {
    if (!isLoaded) return;

    if (!depositId) {
      setStatus("failed");
      setMessage("Identifiant de paiement manquant.");
      return;
    }

    if (!isSignedIn) {
      // Mobile users have no Clerk session — handled in the render below.
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout>;

    const checkStatus = async () => {
      try {
        const token = await getToken();
        const response = await fetch("/api/payments/status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ depositId }),
        });

        const data = await response.json();

        if (response.ok && data.success) {
          const context = (data.context as PaymentContext | undefined) || null;
          setPaymentContext(context);

          if (data.status === "COMPLETED") {
            setStatus("success");
            setMessage("Paiement réussi !");
          } else if (
            data.status === "FAILED" ||
            data.status === "CANCELLED" ||
            data.status === "REJECTED"
          ) {
            setStatus("failed");
            setMessage("Le paiement a échoué ou a été annulé.");
          } else {
            if (attempts < 10) {
              setStatus("pending");
              setMessage("Paiement en cours de traitement...");
              setAttempts((prev) => prev + 1);
              timeoutId = setTimeout(checkStatus, 3000);
            } else {
              setStatus("pending");
              setMessage(
                "Le paiement prend plus de temps que prévu. Veuillez vérifier plus tard.",
              );
            }
          }
        } else {
          console.error("Status check failed:", data);
          if (attempts < 5) {
            setAttempts((prev) => prev + 1);
            timeoutId = setTimeout(checkStatus, 3000);
          } else {
            setStatus("failed");
            setMessage("Impossible de vérifier le statut du paiement.");
          }
        }
      } catch (error) {
        console.error("Error checking status:", error);
        if (attempts < 5) {
          setAttempts((prev) => prev + 1);
          timeoutId = setTimeout(checkStatus, 3000);
        }
      }
    };

    checkStatus();

    return () => clearTimeout(timeoutId);
  }, [depositId, isLoaded, isSignedIn, attempts, getToken]);

  useEffect(() => {
    if (status !== "success") return;

    const pendingDraft = window.sessionStorage.getItem("pendingAdminListing");
    const shouldFinalize =
      !!pendingDraft &&
      paymentContext?.transactionType === "listing_submission";

    setNeedsListingFinalization(shouldFinalize);
    if (!shouldFinalize) setListingFinalized(true);
  }, [status, paymentContext]);

  useEffect(() => {
    if (
      status !== "success" ||
      !depositId ||
      !needsListingFinalization ||
      finalizeOnceRef.current
    )
      return;

    const finalizedKey = `listingFinalized:${depositId}`;
    const finalizingKey = `listingFinalizing:${depositId}`;
    if (window.sessionStorage.getItem(finalizedKey) === "1") {
      setListingFinalized(true);
      return;
    }
    if (window.sessionStorage.getItem(finalizingKey) === "1") {
      return;
    }

    const finalizeListing = async () => {
      finalizeOnceRef.current = true;
      window.sessionStorage.setItem(finalizingKey, "1");

      try {
        const token = await getToken();
        if (!token) throw new Error("No token for listing finalization");

        const pendingRaw = window.sessionStorage.getItem("pendingAdminListing");
        if (!pendingRaw) {
          setListingFinalized(true);
          return;
        }

        const pending = JSON.parse(pendingRaw) as {
          formData: Record<string, unknown>;
          selectedTier: string;
          selectedAddOns: string[];
          pendingPhotos?: PendingPhoto[];
          pendingPhotosOverflow?: boolean;
          pendingPhotosCount?: number;
          pendingPhotosStoredInDb?: boolean;
          onBehalfOfClient?: boolean;
          selectedOwnerId?: string | null;
          isTestListing?: boolean;
        };

        const onBehalfOfClient = !!pending.onBehalfOfClient;
        const selectedOwnerId = pending.selectedOwnerId ?? null;
        const frequence =
          pending.formData.frequence === "journalier"
            ? "journalier"
            : "mensuel";

        const response = await fetch("/api/properties", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            listingData: {
              ...pending.formData,
              prixMensuel: Number(pending.formData.prixMensuel),
              chambres: Number(pending.formData.chambres),
              sdb: Number(pending.formData.sdb),
              superficie: Number(pending.formData.superficie),
              vehicules: Number(pending.formData.vehicules),
              cautionMois: Number(pending.formData.cautionMois),
              loyerAvanceMois: Number(pending.formData.loyerAvanceMois ?? 1),
              frequence,
              cautionType:
                frequence === "journalier"
                  ? (pending.formData.cautionType ?? "aucune")
                  : undefined,
              cautionValeur:
                frequence === "journalier" &&
                pending.formData.cautionValeur !== undefined &&
                pending.formData.cautionValeur !== ""
                  ? Number(pending.formData.cautionValeur)
                  : undefined,
              sejour_minimum:
                frequence === "journalier"
                  ? Number(pending.formData.sejour_minimum ?? 1)
                  : undefined,
              capacite_max:
                frequence === "journalier"
                  ? Number(pending.formData.capacite_max ?? 2)
                  : undefined,
              dosAndDonts: Array.isArray(pending.formData.dosAndDonts)
                ? pending.formData.dosAndDonts
                    .filter((rule): rule is string => typeof rule === "string")
                    .map((rule) => rule.trim())
                    .filter(Boolean)
                    .slice(0, 20)
                : [],
              tier_id: pending.selectedTier,
              add_ons: pending.selectedAddOns,
              payment_id: depositId,
              on_behalf_of_client: onBehalfOfClient,
              owner_id:
                onBehalfOfClient && selectedOwnerId
                  ? selectedOwnerId
                  : undefined,
              is_test: pending.isTestListing === true,
            },
          }),
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result?.message || "Listing finalization failed");
        }

        const propertyId =
          typeof result?.propertyId === "string" ? result.propertyId : null;
        let pendingPhotos = Array.isArray(pending.pendingPhotos)
          ? pending.pendingPhotos
          : [];
        if (
          pendingPhotos.length === 0 &&
          pending.pendingPhotosStoredInDb &&
          depositId
        ) {
          pendingPhotos = await getPendingPhotos(depositId);
        }
        window.sessionStorage.removeItem("pendingAdminListing");
        window.sessionStorage.setItem(finalizedKey, "1");

        let photoUploadFailed = false;
        if (propertyId && pendingPhotos.length > 0) {
          try {
            await uploadCompressedPropertyPhotos({
              propertyId,
              token,
              photos: pendingPhotos,
            });
          } catch (photoUploadError) {
            console.error(
              "Error uploading pending listing photos:",
              photoUploadError,
            );
            photoUploadFailed = true;
          } finally {
            if (depositId) await removePendingPhotos(depositId);
          }
        }

        if (pending.pendingPhotosOverflow || photoUploadFailed) {
          setMessage(
            "Paiement confirme et annonce creee. Ajoutez les photos depuis la fiche du bien.",
          );
        } else {
          setMessage("Paiement confirmé et annonce créée avec succès.");
        }
        setListingFinalized(true);
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Erreur lors de la création de l'annonce";
        setStatus("failed");
        setMessage(errorMessage);
      } finally {
        window.sessionStorage.removeItem(finalizingKey);
      }
    };

    finalizeListing();
  }, [status, depositId, needsListingFinalization, getToken]);

  useEffect(() => {
    if (!depositId || isRedirecting) return;

    if (
      (status === "success" &&
        (!needsListingFinalization || listingFinalized)) ||
      status === "failed"
    ) {
      setIsRedirecting(true);
      const paymentState = status === "success" ? "success" : "failed";
      const redirectTimer = setTimeout(() => {
        router.push(
          `${destination}?payment_status=${paymentState}&depositId=${depositId}`,
        );
      }, 5000);

      return () => clearTimeout(redirectTimer);
    }
  }, [
    status,
    depositId,
    destination,
    router,
    isRedirecting,
    needsListingFinalization,
    listingFinalized,
  ]);

  const transactionLabels: Record<string, string> = {
    listing_submission: "Publication de votre annonce",
    property_lock: "Verrouillage du bien",
    boost: "Boost de votre bien",
    photography: "Service photo",
  };

  const purchaseTitle = paymentContext?.description
    ? paymentContext.description
    : paymentContext?.transactionType
      ? transactionLabels[paymentContext.transactionType] ||
        paymentContext.transactionType
      : null;

  // Mobile app users come from PawaPay redirect — Safari has no Clerk session.
  // Show a branded "return to app" page instead of a login wall.
  if (isLoaded && !isSignedIn) {
    const appDeepLink = depositId
      ? `roogo://my-properties?payment_status=completed&depositId=${depositId}`
      : `roogo://my-properties`;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="flex justify-center mb-6">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: "#FBF0E8" }}
            >
              <CheckCircle2 className="w-8 h-8" style={{ color: "#C96A2E" }} />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Paiement terminé
          </h1>
          <p className="text-gray-500 mb-6">
            Retournez dans l&apos;application Roogo pour suivre votre annonce.
          </p>
          <a
            href={appDeepLink}
            style={{ backgroundColor: "#C96A2E" }}
            className="block w-full text-center text-white font-semibold py-3 px-4 rounded-xl hover:opacity-90 transition-opacity mb-3"
          >
            Retourner sur l&apos;application Roogo
          </a>
          <p className="text-xs text-gray-400">
            Si l&apos;application ne s&apos;ouvre pas automatiquement, ouvrez
            Roogo manuellement.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        <div className="flex justify-center mb-6">
          {status === "loading" || status === "pending" ? (
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center animate-pulse">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          ) : status === "success" ? (
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
          ) : (
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center">
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
          )}
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {status === "loading"
            ? "Chargement..."
            : status === "pending"
              ? "Paiement en cours"
              : status === "success"
                ? "Paiement Réussi"
                : "Échec du paiement"}
        </h1>

        <p className="text-gray-500 mb-4">{message}</p>

        {paymentContext && (status === "success" || status === "failed") && (
          <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-4 text-left space-y-2">
            {purchaseTitle && (
              <div className="text-sm text-gray-700">
                <span className="font-semibold text-gray-900">Objet:</span>{" "}
                {purchaseTitle}
              </div>
            )}
            {paymentContext.propertyLabel && (
              <div className="text-sm text-gray-700">
                <span className="font-semibold text-gray-900">
                  Bien concerné:
                </span>{" "}
                {paymentContext.propertyLabel}
              </div>
            )}
            {paymentContext.tierId && (
              <div className="text-sm text-gray-700">
                <span className="font-semibold text-gray-900">Pack:</span>{" "}
                {paymentContext.tierId}
              </div>
            )}
            {paymentContext.addOns.length > 0 && (
              <div className="text-sm text-gray-700">
                <span className="font-semibold text-gray-900">Options:</span>{" "}
                {paymentContext.addOns.join(", ")}
              </div>
            )}
            {paymentContext.amount !== null && (
              <div className="text-sm text-gray-700">
                <span className="font-semibold text-gray-900">Montant:</span>{" "}
                {paymentContext.amount.toLocaleString()}{" "}
                {paymentContext.currency}
              </div>
            )}
          </div>
        )}

        {(status === "success" || status === "failed") && (
          <p className="text-xs text-gray-400 mb-4">
            Redirection automatique dans quelques secondes...
          </p>
        )}

        <div className="space-y-3">
          {status === "success" && (
            <button
              onClick={() => {
                router.push(
                  `${destination}?payment_status=success&depositId=${depositId}`,
                );
              }}
              className="w-full bg-black text-white font-medium py-3 px-4 rounded-xl hover:bg-gray-800 transition-colors"
            >
              Continuer
            </button>
          )}

          {/* Deep link back to the Roogo mobile app (for users who came from the app) */}
          {status === "success" && (
            <a
              href={`roogo://my-properties?payment_status=success&depositId=${depositId ?? ""}`}
              style={{ backgroundColor: "#C75B3A" }}
              className="block w-full text-center text-white font-medium py-3 px-4 rounded-xl hover:opacity-90 transition-opacity"
            >
              Retourner sur l&apos;application Roogo
            </a>
          )}

          {(status === "failed" || status === "success") && (
            <button
              onClick={() => router.push(destination)}
              className="w-full bg-gray-100 text-gray-700 font-medium py-3 px-4 rounded-xl hover:bg-gray-200 transition-colors"
            >
              Retour à mes espaces
            </button>
          )}
        </div>

        {status === "pending" && (
          <div className="mt-6 flex items-center justify-center text-sm text-gray-400">
            <AlertCircle className="w-4 h-4 mr-2" />
            Ne fermez pas cette fenêtre
          </div>
        )}
      </div>
    </div>
  );
}
