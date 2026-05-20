import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Use service-role client for webhook processing (bypasses RLS)
function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Missing Supabase service role configuration");
  }

  return createClient(url, serviceKey);
}

export async function POST(
  request: Request,
  props: { params: Promise<{ businessId: string; secret: string }> }
) {
  const { businessId, secret } = await props.params;

  try {
    const supabase = createServiceClient();

    // Validate the webhook secret
    const { data: business, error: bizError } = await supabase
      .from("businesses")
      .select("id, webhook_secret, name")
      .eq("id", businessId)
      .single();

    if (bizError || !business) {
      return NextResponse.json(
        { error: "Business not found" },
        { status: 404 }
      );
    }

    if (business.webhook_secret !== secret) {
      return NextResponse.json(
        { error: "Invalid webhook secret" },
        { status: 401 }
      );
    }

    // Parse the payload
    let payload: Record<string, unknown>;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    // Store raw webhook event
    await supabase.from("webhook_events").insert({
      business_id: businessId,
      source: (payload.source as string) || "webhook",
      payload_json: payload,
      processed: false,
    });

    // Extract lead fields
    const firstName =
      (payload.first_name as string) ||
      (payload.name as string)?.split(" ")[0] ||
      "Unknown";
    const lastName =
      (payload.last_name as string) ||
      (payload.name as string)?.split(" ").slice(1).join(" ") ||
      null;
    const phone = (payload.phone as string) || null;
    const email = (payload.email as string) || null;
    const source = (payload.source as string) || "webhook";
    const message = (payload.message as string) || null;
    const notes = (payload.notes as string) || message || null;
    const externalCrmId = (payload.external_crm_id as string) || null;
    const externalCrmName = (payload.external_crm_name as string) || null;

    if (!phone && !email) {
      // Mark webhook event as processed with error
      await supabase
        .from("webhook_events")
        .update({
          processed: true,
          error_message: "No phone or email provided",
        })
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(1);

      return NextResponse.json(
        { error: "A phone number or email is required" },
        { status: 400 }
      );
    }

    // Check for existing lead by phone or email
    let existingLead = null;
    if (phone) {
      const { data } = await supabase
        .from("leads")
        .select("id")
        .eq("business_id", businessId)
        .eq("phone", phone)
        .limit(1)
        .single();
      existingLead = data;
    }
    if (!existingLead && email) {
      const { data } = await supabase
        .from("leads")
        .select("id")
        .eq("business_id", businessId)
        .eq("email", email)
        .limit(1)
        .single();
      existingLead = data;
    }

    let leadId: string;

    if (existingLead) {
      // Update existing lead
      await supabase
        .from("leads")
        .update({
          status: "needs_reply",
          notes: notes
            ? `${notes}`
            : undefined,
          external_crm_id: externalCrmId || undefined,
          external_crm_name: externalCrmName || undefined,
        })
        .eq("id", existingLead.id);

      leadId = existingLead.id;
    } else {
      // Create new lead
      const { data: newLead, error: leadError } = await supabase
        .from("leads")
        .insert({
          business_id: businessId,
          first_name: firstName,
          last_name: lastName,
          phone,
          email,
          source,
          notes,
          status: "new",
          external_crm_id: externalCrmId,
          external_crm_name: externalCrmName,
          sync_status: externalCrmId ? "synced" : "not_connected",
        })
        .select("id")
        .single();

      if (leadError) {
        return NextResponse.json(
          { error: "Failed to create lead: " + leadError.message },
          { status: 500 }
        );
      }

      leadId = newLead.id;
    }

    // Log inbound message if there's a message body
    if (message) {
      await supabase.from("messages").insert({
        business_id: businessId,
        lead_id: leadId,
        channel: "manual_note",
        direction: "inbound",
        body: message,
        status: "received",
        received_at: new Date().toISOString(),
      });
    }

    // Mark webhook event as processed
    await supabase
      .from("webhook_events")
      .update({ processed: true })
      .eq("business_id", businessId)
      .eq("processed", false)
      .order("created_at", { ascending: false })
      .limit(1);

    return NextResponse.json({
      success: true,
      lead_id: leadId,
      is_new: !existingLead,
    });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
