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
    // عميل عادي مع توكن المستخدم القادم من الـ Authorization Header
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: {
            Authorization: req.headers.get("Authorization")!,
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

    // التأكد إنه أدمن
    const { data: profile, error: profileError } = await supabaseClient
      .from("user_profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (profileError) {
      throw profileError;
    }

    if (profile?.role !== "admin") {
      throw new Error("Unauthorized: Admin access required");
    }

    // عميل أدمن باستخدام SERVICE_ROLE_KEY
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // نقرأ body (page / perPage) بشكل آمن
    let page = 1;
    let perPage = 20;

    try {
      const body = await req.json();
      if (typeof body.page === "number") page = body.page;
      if (typeof body.perPage === "number") perPage = body.perPage;
    } catch {
      // لو ما فيه body نخلي الديفولت
    }

    // جلب المستخدمين من Auth
    const {
      data: listData,
      error: listError,
    } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (listError) throw listError;

    const authUsers = listData?.users ?? [];

    // جلب profiles لهؤلاء المستخدمين
    const userIds = authUsers.map((u) => u.id);

    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("user_profiles")
      .select("*")
      .in("user_id", userIds);

    if (profilesError) throw profilesError;

    const { data: businessProfiles, error: businessError } =
      await supabaseAdmin
        .from("business_profiles")
        .select("*")
        .in("user_id", userIds);

    if (businessError) throw businessError;

    // بناء Maps للربط السريع
    const profileMap = new Map(
      (profiles ?? []).map((p: any) => [p.user_id, p])
    );
    const businessMap = new Map(
      (businessProfiles ?? []).map((b: any) => [b.user_id, b])
    );

    const combinedUsers = authUsers.map((authUser: any) => {
      const profile = profileMap.get(authUser.id) ?? {};
      const business = businessMap.get(authUser.id) ?? {};

      return {
        id: authUser.id,
        email: authUser.email,
        full_name: profile.full_name || "—",
        phone_number: profile.phone_number || "—",
        business_name: business.business_name || "—",
        business_id: business.id || null,
        role: profile.role || "user",
        created_at: authUser.created_at,
      };
    });

    return new Response(JSON.stringify({ users: combinedUsers }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
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
