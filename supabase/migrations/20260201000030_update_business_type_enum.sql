DO $$
DECLARE
    r RECORD;
BEGIN
    -- Find and drop ANY check constraint on the 'business_type' column in 'business_profiles' table
    FOR r IN (
        SELECT con.conname
        FROM pg_catalog.pg_constraint con
            INNER JOIN pg_catalog.pg_class rel ON rel.oid = con.conrelid
            INNER JOIN pg_catalog.pg_namespace nsp ON nsp.oid = con.connamespace
        WHERE nsp.nspname = 'public'
          AND rel.relname = 'business_profiles'
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) LIKE '%business_type%'
    ) LOOP
        EXECUTE 'ALTER TABLE business_profiles DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;

    -- Re-add the constraint with the updated list
    ALTER TABLE business_profiles ADD CONSTRAINT business_profiles_business_type_check 
    CHECK (business_type IN (
        'tourism', 
        'restaurant', 
        'supermarket', 
        'phone_shop', 
        'car_parts', 
        'clothes_shop', 
        'furniture_store', 
        'auto_repair'
    ));

END $$;
