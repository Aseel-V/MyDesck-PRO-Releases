// ============================================================================
// WHATSAPP INTEGRATION - Supabase Edge Function
// Version: 1.0.0 | Production-Ready
// Deploy: supabase functions deploy send-whatsapp
// ============================================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WhatsAppRequest {
  business_id: string;
  template_name: string;
  phone_number: string;
  template_params: Record<string, string>;
  guest_id?: string;
}

interface WhatsAppMessagePayload {
  messaging_product: "whatsapp";
  to: string;
  type: "template";
  template: {
    name: string;
    language: { code: string };
    components?: Array<{
      type: "body";
      parameters: Array<{ type: "text"; text: string }>;
    }>;
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body: WhatsAppRequest = await req.json();
    const { business_id, template_name, phone_number, template_params, guest_id } = body;

    // Validate required fields
    if (!business_id || !template_name || !phone_number) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get WhatsApp settings for this business
    const { data: settings, error: settingsError } = await supabase
      .from("restaurant_whatsapp_settings")
      .select("*")
      .eq("business_id", business_id)
      .single();

    if (settingsError || !settings) {
      return new Response(
        JSON.stringify({ error: "WhatsApp not configured for this business" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!settings.is_enabled) {
      return new Response(
        JSON.stringify({ error: "WhatsApp is disabled for this business" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format phone number (remove spaces, ensure +972 for Israel)
    let formattedPhone = phone_number.replace(/[\s-]/g, "");
    if (formattedPhone.startsWith("0")) {
      formattedPhone = "+972" + formattedPhone.substring(1);
    }
    if (!formattedPhone.startsWith("+")) {
      formattedPhone = "+" + formattedPhone;
    }

    // Get template content
    const templates: Record<string, string> = settings.templates || {};
    const templateContent = templates[template_name];

    if (!templateContent) {
      return new Response(
        JSON.stringify({ error: `Template '${template_name}' not found` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Replace placeholders in template
    let messageContent = templateContent;
    for (const [key, value] of Object.entries(template_params)) {
      messageContent = messageContent.replace(new RegExp(`{${key}}`, "g"), value);
    }

    // Build WhatsApp API payload
    const whatsappPayload: WhatsAppMessagePayload = {
      messaging_product: "whatsapp",
      to: formattedPhone,
      type: "template",
      template: {
        name: template_name,
        language: { code: "he" }, // Hebrew default for Israel
        components: Object.keys(template_params).length > 0
          ? [{
              type: "body",
              parameters: Object.values(template_params).map(text => ({ type: "text", text })),
            }]
          : undefined,
      },
    };

    // Send via WhatsApp Business API
    const WHATSAPP_API_URL = `https://graph.facebook.com/v17.0/${settings.phone_number_id}/messages`;
    
    const whatsappResponse = await fetch(WHATSAPP_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${settings.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(whatsappPayload),
    });

    const whatsappResult = await whatsappResponse.json();

    // Log the message
    const messageStatus = whatsappResponse.ok ? "sent" : "failed";
    const { error: logError } = await supabase
      .from("restaurant_whatsapp_messages")
      .insert({
        business_id,
        guest_id,
        phone_number: formattedPhone,
        template_name,
        direction: "outbound",
        status: messageStatus,
        message_content: messageContent,
        error_message: whatsappResponse.ok ? null : JSON.stringify(whatsappResult),
        sent_at: whatsappResponse.ok ? new Date().toISOString() : null,
      });

    if (logError) {
      console.error("Failed to log WhatsApp message:", logError);
    }

    if (!whatsappResponse.ok) {
      return new Response(
        JSON.stringify({ 
          error: "Failed to send WhatsApp message", 
          details: whatsappResult 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message_id: whatsappResult.messages?.[0]?.id,
        status: "sent" 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("WhatsApp Edge Function error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
