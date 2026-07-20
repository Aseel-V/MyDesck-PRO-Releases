-- Fix: Only create default staff (Kitchen/Waiter) if business_type is 'restaurant'
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
    -- CRITICAL FIX: Only run this for restaurants
    -- Other types (auto_repair, etc.) do NOT need Kitchen/Waiter staff by default
    IF NEW.business_type IS DISTINCT FROM 'restaurant' THEN
        RETURN NEW;
    END IF;

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
