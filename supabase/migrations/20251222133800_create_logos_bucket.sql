-- Create a new public bucket for logos and signatures
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

-- RLS is already enabled on storage.objects by default in Supabase.
-- Attempting to run 'alter table storage.objects enable row level security' causes 42501 errors
-- if you are not the system owner. We can safely skip it.

-- Helper to safely create policies
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'objects' and policyname = 'Give public access to logos') then
    create policy "Give public access to logos"
      on storage.objects for select
      using ( bucket_id = 'logos' );
  end if;

  if not exists (select 1 from pg_policies where tablename = 'objects' and policyname = 'Allow authenticated uploads') then
    create policy "Allow authenticated uploads"
      on storage.objects for insert
      to authenticated
      with check ( bucket_id = 'logos' );
  end if;

  if not exists (select 1 from pg_policies where tablename = 'objects' and policyname = 'Allow users to update their own files') then
    create policy "Allow users to update their own files"
      on storage.objects for update
      to authenticated
      using ( bucket_id = 'logos' and auth.uid() = owner )
      with check ( bucket_id = 'logos' and auth.uid() = owner );
  end if;

  if not exists (select 1 from pg_policies where tablename = 'objects' and policyname = 'Allow users to delete their own files') then
    create policy "Allow users to delete their own files"
      on storage.objects for delete
      to authenticated
      using ( bucket_id = 'logos' and auth.uid() = owner );
  end if;
end $$;
