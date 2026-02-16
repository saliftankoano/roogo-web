"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "@clerk/nextjs";

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

function PaymentStatusChecker({ depositId }: { depositId: string | null }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "failed" | "pending">("loading");
  const [message, setMessage] = useState("Vérification du paiement...");
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (!isLoaded) return;

    if (!depositId) {
      setStatus("failed");
      setMessage("Identifiant de paiement manquant.");
      return;
    }

    if (!isSignedIn) {
      setStatus("failed");
      setMessage("Veuillez vous reconnecter pour vérifier le statut du paiement.");
      return;
    }

    let timeoutId: NodeJS.Timeout;

    const checkStatus = async () => {
      try {
        const token = await getToken();
        const response = await fetch("/api/payments/status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({ depositId }),
        });

        const data = await response.json();

        if (response.ok && data.success) {
          if (data.status === "COMPLETED") {
            setStatus("success");
            setMessage("Paiement réussi !");
          } else if (data.status === "FAILED" || data.status === "CANCELLED" || data.status === "REJECTED") {
            setStatus("failed");
            setMessage("Le paiement a échoué ou a été annulé.");
          } else {
            if (attempts < 10) {
              setStatus("pending");
              setMessage("Paiement en cours de traitement...");
              setAttempts(prev => prev + 1);
              timeoutId = setTimeout(checkStatus, 3000);
            } else {
              setStatus("pending");
              setMessage("Le paiement prend plus de temps que prévu. Veuillez vérifier plus tard.");
            }
          }
        } else {
          console.error("Status check failed:", data);
          if (attempts < 5) {
             setAttempts(prev => prev + 1);
             timeoutId = setTimeout(checkStatus, 3000);
          } else {
             setStatus("failed");
             setMessage("Impossible de vérifier le statut du paiement.");
          }
        }
      } catch (error) {
        console.error("Error checking status:", error);
        if (attempts < 5) {
           setAttempts(prev => prev + 1);
           timeoutId = setTimeout(checkStatus, 3000);
        }
      }
    };

    checkStatus();

    return () => clearTimeout(timeoutId);
  }, [depositId, isLoaded, isSignedIn, attempts, getToken]);

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
          {status === "loading" ? "Chargement..." : 
           status === "pending" ? "Paiement en cours" :
           status === "success" ? "Paiement Réussi" : "Échec du paiement"}
        </h1>
        
        <p className="text-gray-500 mb-8">
          {message}
        </p>

        <div className="space-y-3">
          {status === "success" && (
            <button
              onClick={() => {
                if (window.opener) {
                   window.close();
                } else {
                   router.push(`/admin/annonces?payment_success=true&depositId=${depositId}`);
                }
              }}
              className="w-full bg-black text-white font-medium py-3 px-4 rounded-xl hover:bg-gray-800 transition-colors"
            >
              Retourner a l&apos;annonce
            </button>
          )}

          {(status === "failed" || status === "success") && (
             <button
               onClick={() => router.push("/")}
               className="w-full bg-gray-100 text-gray-700 font-medium py-3 px-4 rounded-xl hover:bg-gray-200 transition-colors"
             >
               Retour a l&apos;accueil
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
