-- Add password column to restaurant_staff if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'restaurant_staff' AND column_name = 'password') THEN
        ALTER TABLE restaurant_staff ADD COLUMN password TEXT;
    END IF;
    
    -- Add email constraint if not unique per business (though we might want global unique or unique per business)
    -- Ideally email is unique. The user said "kitchen@MagicRestaurant.com", which implies uniqueness.
    -- Let's ensure email is unique to avoid confusion during login
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'restaurant_staff_email_key') THEN
        ALTER TABLE restaurant_staff ADD CONSTRAINT restaurant_staff_email_key UNIQUE (email);
    END IF;

    -- Enable pgcrypto for password hashing
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
        CREATE EXTENSION pgcrypto;
    END IF;
END $$;

-- Drop existing function if exists to update it
DROP FUNCTION IF EXISTS authenticate_staff;

-- Create RPC function to authenticate staff
CREATE OR REPLACE FUNCTION authenticate_staff(p_email TEXT, p_password TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER -- Run as owner to bypass RLS and read password
SET search_path = public -- Secure search path
AS $$
DECLARE
    v_staff RECORD;
    v_business_profile RECORD;
BEGIN
    -- Find staff member
    SELECT * INTO v_staff
    FROM restaurant_staff
    WHERE email = p_email 
    AND password = crypt(p_password, password) -- Verify hashed password
    AND is_active = true;

    IF v_staff IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Invalid credentials');
    END IF;

    -- Get business profile details
    SELECT * INTO v_business_profile
    FROM business_profiles
    WHERE user_id = v_staff.business_id;

    -- Return success with staff and business info
    -- Remove password from staff object before returning
    RETURN json_build_object(
        'success', true,
        'staff', json_build_object(
            'id', v_staff.id,
            'business_id', v_staff.business_id,
            'full_name', v_staff.full_name,
            'role', v_staff.role,
            'restaurant_role', v_staff.restaurant_role,
            'email', v_staff.email,
            'pin_code', v_staff.pin_code,
            'is_active', v_staff.is_active,
            'hourly_rate', v_staff.hourly_rate
        ),
        'business_id', v_staff.business_id,
        'business_profile', row_to_json(v_business_profile)
    );
END;
$$;

-- Function to automatically create staff accounts when a business profile is created
CREATE OR REPLACE FUNCTION create_default_restaurant_staff()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_business_name_clean TEXT;
    v_kitchen_email TEXT;
    v_waiter_email TEXT;
    v_kitchen_pass TEXT;
    v_waiter_pass TEXT;
BEGIN
    -- Clean business name for email (remove spaces, special chars)
    v_business_name_clean := regexp_replace(NEW.business_name, '\s+', '', 'g');
    v_business_name_clean := regexp_replace(v_business_name_clean, '[^a-zA-Z0-9]', '', 'g');
    
    -- Append a unique 4-char suffix from the user_id to prevent collisions
    -- e.g. "BurgerKing_a1b2"
    v_business_name_clean := v_business_name_clean || '_' || substring(NEW.user_id::text, 1, 4);
    
    -- Generate emails
    v_kitchen_email := 'kitchen@' || v_business_name_clean || '.com';
    v_waiter_email := 'waiter@' || v_business_name_clean || '.com';
    
    -- Generate random passwords (or simple defaults for now, user can change them)
    -- Using simple 6 digit for ease of use as requested
    v_kitchen_pass := floor(random() * (999999 - 100000 + 1) + 100000)::text;
    v_waiter_pass := floor(random() * (999999 - 100000 + 1) + 100000)::text;

    -- Insert Kitchen Staff
    INSERT INTO restaurant_staff (
        business_id, 
        full_name, 
        role, 
        restaurant_role, 
        email, 
        password,
        pin_code,
        is_active,
        hourly_rate
    ) VALUES (
        NEW.user_id,
        'Kitchen ' || NEW.business_name,
        'Kitchen',
        'kitchen',
        v_kitchen_email,
        crypt(v_kitchen_pass, gen_salt('bf')), -- Hash password
        '0000',
        true,
        0
    )
    ON CONFLICT (email) DO NOTHING; -- Skip if exists

    -- Insert Waiter Staff
    INSERT INTO restaurant_staff (
        business_id, 
        full_name, 
        role, 
        restaurant_role, 
        email, 
        password,
        pin_code,
        is_active,
        hourly_rate
    ) VALUES (
        NEW.user_id,
        'Waiter ' || NEW.business_name,
        'Waiter',
        'waiter',
        v_waiter_email,
        crypt(v_waiter_pass, gen_salt('bf')), -- Hash password
        '1111',
        true,
        0
    )
    ON CONFLICT (email) DO NOTHING;

    RETURN NEW;
END;
$$;

-- Trigger to run after business_profiles insert
DROP TRIGGER IF EXISTS trigger_create_default_staff ON business_profiles;
CREATE TRIGGER trigger_create_default_staff
    AFTER INSERT ON business_profiles
    FOR EACH ROW
    EXECUTE FUNCTION create_default_restaurant_staff();
