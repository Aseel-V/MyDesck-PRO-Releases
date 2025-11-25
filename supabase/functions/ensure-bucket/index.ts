// @ts-nocheck

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // عميل عادي مع توكن المستخدم من الـ Authorization Header
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: {
            Authorization: req.headers.get("Authorization") || "",
          },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError) {
      throw userError;
    }

    if (!user) {
      throw new Error("Unauthorized");
    }

    // عميل أدمن باستخدام SERVICE_ROLE_KEY
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // فحص وجود البَكِت logos
    const { data: buckets, error: bucketsError } =
      await supabaseAdmin.storage.listBuckets();

    if (bucketsError) throw bucketsError;

    const exists = buckets?.some((b) => b.name === "logos");

    // إنشاء البكت لو مش موجود
    if (!exists) {
      const { error: createError } = await supabaseAdmin.storage.createBucket(
        "logos",
        {
          public: true,
          fileSizeLimit: 2 * 1024 * 1024, // 2MB
          allowedMimeTypes: [
            "image/png",
            "image/jpeg",
            "image/jpg",
            "image/svg+xml",
          ],
        }
      );

      if (createError) throw createError;
    }

    return new Response(
      JSON.stringify({ message: "Bucket ensured", bucket: "logos" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    const message =
      error && typeof error.message === "string"
        ? error.message
        : "Unknown error";

    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
