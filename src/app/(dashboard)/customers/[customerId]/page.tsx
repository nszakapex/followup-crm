import { redirect, notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export default async function CustomerAliasPage(props: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await props.params;

  if (!isUuid(customerId)) notFound();

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect("/login");

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("business_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) redirect("/login");

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id")
    .eq("business_id", profile.business_id)
    .eq("id", customerId)
    .maybeSingle();

  if (leadError) {
    console.error("[customer_alias] Lead lookup failed", {
      customerId,
      businessId: profile.business_id,
      error: leadError.message,
    });
    throw new Error(
      process.env.NODE_ENV !== "production"
        ? `Customer lookup failed: ${leadError.message}`
        : "Customer lookup failed."
    );
  }

  if (!lead) notFound();

  redirect(`/leads/${lead.id}`);
}
