export const dynamic = "force-dynamic";

/** Uptime/keep-alive ping: touches neither the database nor the AI. */
export function GET(): Response {
  return Response.json({ ok: true });
}

export function HEAD(): Response {
  return new Response(null, { status: 200 });
}
