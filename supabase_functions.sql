-- Run this in your Supabase SQL Editor to enable secure email checking

create or replace function check_email_exists(email_input text)
returns boolean
language plpgsql
security definer -- Allows this function to run with admin privileges (to check auth.users)
as $$
begin
  return exists (
    select 1 
    from auth.users 
    where email = email_input
  );
end;
$$;

-- Grant access to this function for anonymous and authenticated users
grant execute on function check_email_exists(text) to anon, authenticated;
