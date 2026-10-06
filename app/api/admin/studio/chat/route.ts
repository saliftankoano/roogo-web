import { getStaffOrFounder } from "@/lib/api-auth";
import { errorResponse } from "@/lib/api-helpers";
import { checkRateLimit, studioChatLimiter } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildSystemPrompt, extractScript } from "@/lib/studio/chat-prompt";
import {
  canWriteConversation,
  loadConversation,
  loadPropertyRow,
  propertyLabels,
} from "@/lib/studio/conversations-server";
import { checkScript, normalizeScript } from "@/lib/studio/copy-rules";
import { buildPropertyFacts } from "@/lib/studio/property-context";
import { encodeSse, openAiDelta } from "@/lib/studio/sse";

export const maxDuration = 60;

const MAX_MESSAGE_CHARACTERS = 2000;
const HISTORY_LIMIT = 20;

// Streams the assistant's reply as server-sent events:
//   delta  { text }                       a piece of the reply
//   done   { messageId, artifact, warnings }
//   error  { message }
export async function POST(req: Request) {
  const staff = await getStaffOrFounder(req);
  if (!staff) return errorResponse("Forbidden", 403, req);

  const limit = await checkRateLimit(studioChatLimiter, staff.id);
  if (!limit.success) {
    return errorResponse("Trop de messages. Réessayez dans quelques minutes.", 429, req);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.STUDIO_SCRIPT_MODEL;
  if (!apiKey || !model) {
    console.error("Studio: chat model env is not configured");
    return errorResponse("L'assistant n'est pas configuré.", 503, req);
  }

  const body = await req.json().catch(() => null);
  const message =
    typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) return errorResponse("Message vide.", 400, req);
  if (message.length > MAX_MESSAGE_CHARACTERS) {
    return errorResponse(
      `Message trop long (${MAX_MESSAGE_CHARACTERS} caractères au maximum).`,
      400,
      req,
    );
  }

  const conv =
    typeof body?.conversation_id === "string"
      ? await loadConversation(body.conversation_id)
      : null;
  if (!conv || !canWriteConversation(staff, conv)) {
    return errorResponse("Conversation introuvable", 404, req);
  }

  const property = conv.property_id ? await loadPropertyRow(conv.property_id) : null;
  const facts = property ? buildPropertyFacts(property, propertyLabels) : null;

  const { data: history } = await supabaseAdmin
    .from("studio_messages")
    .select("role, content")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  const priorMessages = (history ?? []).reverse();

  await supabaseAdmin
    .from("studio_messages")
    .insert({ conversation_id: conv.id, role: "user", content: message });

  const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: "system", content: buildSystemPrompt(facts) },
        ...priorMessages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: message },
      ],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    console.error("Studio: chat model returned", upstream.status);
    return errorResponse("L'assistant n'a pas répondu. Réessayez.", 502, req);
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(encodeSse(event, data)));

      let full = "";
      let carry = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          carry += decoder.decode(value, { stream: true });
          const lines = carry.split("\n");
          carry = lines.pop() ?? "";
          for (const line of lines) {
            const delta = openAiDelta(line.trim());
            if (delta === null || delta === "[DONE]") continue;
            full += delta;
            send("delta", { text: delta });
          }
        }

        const reply = full.trim();
        if (!reply) {
          send("error", { message: "La réponse est vide. Réessayez." });
          return;
        }

        const { data: saved } = await supabaseAdmin
          .from("studio_messages")
          .insert({ conversation_id: conv.id, role: "assistant", content: reply })
          .select("id")
          .single();

        let artifact: { id: string; text: string; title: string } | null = null;
        let warnings: ReturnType<typeof checkScript> = [];
        const script = extractScript(reply);
        if (script) {
          const text = normalizeScript(script);
          warnings = checkScript(text);
          const { data: inserted } = await supabaseAdmin
            .from("studio_artifacts")
            .insert({
              conversation_id: conv.id,
              message_id: saved?.id ?? null,
              kind: "script",
              title: "Script de voix off",
              text,
              pinned: true,
            })
            .select("id, title, text")
            .single();
          artifact = inserted ?? null;
        }

        await supabaseAdmin
          .from("studio_conversations")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", conv.id);
        await supabaseAdmin.from("studio_generations").insert({
          user_id: staff.id,
          kind: "chat",
          provider: "openai",
          model,
          input: { conversation_id: conv.id },
          est_cost_usd: 0,
          status: "done",
          conversation_id: conv.id,
          property_id: conv.property_id,
        });

        send("done", { messageId: saved?.id ?? null, artifact, warnings });
      } catch (error) {
        console.error("Studio: chat stream failed", error);
        send("error", { message: "La réponse s'est interrompue. Réessayez." });
      } finally {
        controller.close();
      }
    },
    cancel() {
      void reader.cancel();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
