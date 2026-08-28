"use client";

import { SignUp } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8">
        <Image
          src="/logo.png?v=2"
          alt="Logo Roogo"
          width={160}
          height={160}
          className="object-contain"
        />
      </Link>
      <SignUp
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "shadow-lg",
            headerTitle: "text-2xl font-bold text-neutral-900",
            headerSubtitle: "text-neutral-600",
            formButtonPrimary: "bg-primary hover:bg-primary-hover",
            footerActionLink: "text-primary hover:text-primary-hover",
            socialButtonsBlockButton: "border-neutral-200 hover:bg-neutral-50",
          },
        }}
        routing="hash"
        signInUrl="/connexion"
        forceRedirectUrl="/onboarding"
      />
      <Link
        href="/tutoriels/comment-s-inscrire-roogo-proprietaire"
        className="mt-6 max-w-sm text-center text-sm font-bold text-primary hover:text-primary-hover hover:underline"
      >
        Besoin d&apos;aide ? Voir comment créer un compte propriétaire avec Google
      </Link>
    </div>
  );
}
