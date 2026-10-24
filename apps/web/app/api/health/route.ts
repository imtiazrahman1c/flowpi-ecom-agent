export const dynamic = "force-dynamic";
export function GET() {
  return Response.json(
    {
      service: "flowpi-ecom-agent",
      version: "0.2.0",
      environment: "sandbox",
      live_sending: false,
      configured: !!(
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      ),
      ai_mode: process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL
        ? "model_configured_not_certified"
        : "offline_rules",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
