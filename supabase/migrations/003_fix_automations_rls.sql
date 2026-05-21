-- Fix automations RLS: replace ambiguous "for all" policy with explicit
-- per-operation policies to avoid silent update rejection.
--
-- Root cause: having both a "for select" and a "for all" policy on the same
-- table can cause Supabase to silently reject UPDATE/INSERT/DELETE even when
-- the user's role qualifies. Splitting into explicit policies resolves this.

-- Drop the conflicting policies
drop policy if exists "Users can view automations" on automations;
drop policy if exists "Users can manage automations" on automations;

-- SELECT: any user in the business can view automations
create policy "automations_select"
  on automations for select
  using (
    business_id in (
      select business_id from users where id = auth.uid()
    )
  );

-- INSERT: owner, manager, or admin can create automations
create policy "automations_insert"
  on automations for insert
  with check (
    business_id in (
      select business_id from users
      where id = auth.uid()
        and role in ('owner', 'manager', 'admin')
    )
  );

-- UPDATE: owner, manager, or admin can update automations
create policy "automations_update"
  on automations for update
  using (
    business_id in (
      select business_id from users
      where id = auth.uid()
        and role in ('owner', 'manager', 'admin')
    )
  )
  with check (
    business_id in (
      select business_id from users
      where id = auth.uid()
        and role in ('owner', 'manager', 'admin')
    )
  );

-- DELETE: owner or admin only
create policy "automations_delete"
  on automations for delete
  using (
    business_id in (
      select business_id from users
      where id = auth.uid()
        and role in ('owner', 'admin')
    )
  );
