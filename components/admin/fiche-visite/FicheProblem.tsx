import Link from "next/link";
import { urbanist } from "@/components/admin/team/font";

export function FicheProblem({ text }: { text: string }) {
  return (
    <div className={`${urbanist.className} mx-auto flex max-w-xl flex-col gap-3 text-[#1F1A16]`}>
      <p role="alert" className="m-0 rounded-2xl bg-[#FBE3DF] px-4 py-3 text-sm font-semibold text-[#8E2A1E]">
        {text}
      </p>
      <Link href="/admin" className="text-sm font-bold text-[#8A4924]">
        Retour au briefing
      </Link>
    </div>
  );
}
