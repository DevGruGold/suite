-- Migration: Bridge Moltmall Listings to Suite Tasks
-- Description: Creates a trigger to auto-generate a verification task whenever a new listing is created.

-- 1. Create the Trigger Function
create or replace function public.trigger_listing_verification_task()
returns trigger as $$
begin
  insert into public.tasks (
    title,
    description,
    type,
    status,
    priority,
    payload,
    created_at,
    updated_at
  ) values (
    'Verify Listing: ' || new.title,
    'A new listing has been posted in Moltmall. Verify content and pricing compliance.',
    'listing_verification',
    'pending',
    5,
    jsonb_build_object(
      'listing_id', new.id,
      'agent_id', new.agent_id,
      'price', new.price,
      'category', new.category
    ),
    now(),
    now()
  );
  return new;
end;
$$ language plpgsql security definer;

-- 2. Create the Trigger on Listing Insert
drop trigger if exists tr_listing_verification on public.listings;

create trigger tr_listing_verification
after insert on public.listings
for each row
execute function public.trigger_listing_verification_task();
