

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
        // 1. Verify the caller is authenticated and is an admin
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
            data: { user: caller },
            error: userError,
        } = await supabaseClient.auth.getUser();

        if (userError || !caller) {
            throw new Error("Unauthorized");
        }

        const { data: callerProfile, error: profileError } = await supabaseClient
            .from("user_profiles")
            .select("role")
            .eq("user_id", caller.id)
            .single();

        if (profileError || callerProfile?.role !== "admin") {
            throw new Error("Unauthorized: Admin access required");
        }

        // 2. Initialize Admin Client
        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // 3. Parse Request Body
        const {
            email,
            password,
            fullName,
            phoneNumber,
            businessName,
            businessId, // Optional: Link to existing business
            role = "user",
            logoUrl,
            currency = "USD",
            language = "en",
        } = await req.json() as {
            email?: string;
            password?: string;
            fullName?: string;
            phoneNumber?: string;
            businessName?: string;
            businessId?: string;
            role?: string;
            logoUrl?: string;
            currency?: string;
            language?: string;
        };

        if (!email || !password) {
            throw new Error("Email and password are required");
        }

        // 4. Create User in Supabase Auth
        const { data: newUser, error: createUserError } =
            await supabaseAdmin.auth.admin.createUser({
                email,
                password,
                email_confirm: true, // Auto-confirm for admin-created users
                user_metadata: {
                    full_name: fullName,
                },
            });

        if (createUserError) throw createUserError;
        if (!newUser.user) throw new Error("Failed to create user");

        const userId = newUser.user.id;

        // 5. Handle Business Logic
        let finalBusinessId = businessId;

        if (businessId) {
            // Linking to existing business (Staff)
            // Verify business exists
            const { data: business, error: businessCheckError } = await supabaseAdmin
                .from("business_profiles")
                .select("id")
                .eq("id", businessId)
                .single();

            if (businessCheckError || !business) {
                // Cleanup: delete the created user if business doesn't exist
                await supabaseAdmin.auth.admin.deleteUser(userId);
                throw new Error("Invalid Business ID");
            }
        } else {
            // Creating new business (Owner)
            const { data: newBusiness, error: createBusinessError } =
                await supabaseAdmin
                    .from("business_profiles")
                    .insert([
                        {
                            user_id: userId, // Owner
                            business_name: businessName || "My Business",
                            logo_url: logoUrl,
                            preferred_currency: currency,
                            preferred_language: language,
                        },
                    ])
                    .select()
                    .single();

            if (createBusinessError) {
                await supabaseAdmin.auth.admin.deleteUser(userId);
                throw createBusinessError;
            }
            finalBusinessId = newBusiness.id;
        }

        // 6. Create User Profile
        // Note: We try to insert business_id if the schema supports it.
        // If the schema for user_profiles doesn't have business_id, this might fail if we include it.
        // However, for "Staff" support, we MUST link them somehow.
        // Assuming user_profiles has business_id or we rely on business_profiles.user_id for owners.
        // For staff, we really need user_profiles.business_id.

        const userProfileData: Record<string, unknown> = {
            user_id: userId,
            full_name: fullName,
            phone_number: phoneNumber,
            role: role,
        };

        // Only add business_id if it's a staff member (linked to existing) OR if we want to denormalize for owners too.
        // Let's assume we want to store it if the column exists.
        // Since we can't check schema easily at runtime, we'll try to insert it.
        // If it fails, we might need a fallback, but for now we assume the requirement implies the column exists or we should use it.
        if (finalBusinessId) {
            userProfileData.business_id = finalBusinessId;
        }

        const { error: createProfileError } = await supabaseAdmin
            .from("user_profiles")
            .insert([userProfileData]);

        if (createProfileError) {
            // If error is about missing column business_id, we might want to retry without it?
            // But then we lose the link for staff.
            // For now, let's assume it works or fail hard so we know.
            console.error("Error creating profile:", createProfileError);
            // Cleanup
            await supabaseAdmin.auth.admin.deleteUser(userId);
            // If we created a business, we should maybe delete it too?
            if (!businessId) {
                await supabaseAdmin.from("business_profiles").delete().eq("id", finalBusinessId);
            }
            throw createProfileError;
        }

        return new Response(
            JSON.stringify({
                user: newUser.user,
                businessId: finalBusinessId,
            }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
            }
        );

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return new Response(JSON.stringify({ error: message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
        });
    }
});
