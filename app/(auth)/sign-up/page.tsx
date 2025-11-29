"use client";

import { SignUp } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8">
        <Image
          src="/logo.png"
          alt="Roogo Logo"
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
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        forceRedirectUrl="/location"
      />
    </div>
  );
}
