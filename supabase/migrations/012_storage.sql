-- 012_storage.sql
insert into storage.buckets (id, name, public)
values ('avatars','avatars',false), ('attachments','attachments',false), ('lending-documents','lending-documents',false)
on conflict (id) do nothing;

-- Users can only touch files under a top-level folder named after their uid.
do $$
declare b text;
begin
  foreach b in array array['avatars','attachments','lending-documents'] loop
    execute format($p$drop policy if exists "%1$s_rw" on storage.objects$p$, b);
    execute format($p$
      create policy "%1$s_rw" on storage.objects for all
      using (bucket_id = %1$L and (storage.foldername(name))[1] = auth.uid()::text)
      with check (bucket_id = %1$L and (storage.foldername(name))[1] = auth.uid()::text)
    $p$, b);
  end loop;
end;
$$;
