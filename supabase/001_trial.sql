begin;
create schema if not exists private;
revoke all on schema private from public;

create table public.events (
 id uuid primary key default gen_random_uuid(),
 slug text unique not null,
 name text not null,
 is_open boolean not null default false,
 is_test boolean not null default true
);
create table public.event_members (
 event_id uuid references public.events(id) on delete cascade,
 user_id uuid references auth.users(id) on delete cascade,
 role text not null check (role in ('organiser','vendor')),
 primary key (event_id,user_id)
);
create table public.stalls (
 event_id uuid references public.events(id) on delete cascade,
 id text not null check (id ~ '^B(0[1-9]|1[0-9]|2[0-4])$'),
 price integer not null check(price>0),
 primary key(event_id,id)
);
create table public.bookings (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null,
 stall_id text not null,
 vendor_id uuid not null references auth.users(id),
 contact_name text not null check (char_length(btrim(contact_name)) between 2 and 60),
 business text not null check (char_length(btrim(business)) between 2 and 80),
 category text not null check(category in ('Fashion','Accessories','Art & craft','Home & lifestyle','Food & drink')),
 status text not null default 'requested' check(status in ('requested','held','booked','released')),
 deposit_verified boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(event_id,stall_id) references public.stalls(event_id,id),
 check (deposit_verified = (status='booked'))
);
create unique index one_active_booking_per_stall on public.bookings(event_id,stall_id) where status <> 'released';
create unique index one_active_booking_per_vendor on public.bookings(event_id,vendor_id) where status <> 'released';
create table public.booking_audit (
 id bigint generated always as identity primary key,
 booking_id uuid not null references public.bookings(id),
 actor_id uuid not null references auth.users(id),
 action text not null,
 occurred_at timestamptz not null default now()
);

alter table public.events enable row level security;
alter table public.event_members enable row level security;
alter table public.stalls enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_audit enable row level security;
revoke all on public.events,public.event_members,public.stalls,public.bookings,public.booking_audit from anon,authenticated;
grant select on public.events,public.event_members to authenticated;
create policy own_membership on public.event_members for select to authenticated using(user_id=auth.uid());
create policy member_event on public.events for select to authenticated using(exists(select 1 from public.event_members m where m.event_id=id and m.user_id=auth.uid()));

-- Functions are the only API for stall data. No client receives a service-role key.
create function public.trial_stalls(p_event uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_role text; v_result jsonb;
begin
 select role into v_role from public.event_members where event_id=p_event and user_id=auth.uid();
 if v_role is null then raise exception 'This account is not invited to this event.' using errcode='42501'; end if;
 select jsonb_agg(jsonb_build_object(
  'id',s.id,'price',s.price,'status',coalesce(b.status,'available'),
  'bookingId',case when b.vendor_id=auth.uid() or v_role='organiser' then b.id else null end,
  'business',case when b.vendor_id=auth.uid() or v_role='organiser' then b.business else '' end,
  'name',case when b.vendor_id=auth.uid() or v_role='organiser' then b.contact_name else '' end,
  'category',case when b.vendor_id=auth.uid() or v_role='organiser' then b.category else '' end,
  'depositVerified',case when b.vendor_id=auth.uid() or v_role='organiser' then b.deposit_verified else false end,
  'mine',coalesce(b.vendor_id=auth.uid(),false)
 ) order by s.id) into v_result
 from public.stalls s left join public.bookings b on b.event_id=s.event_id and b.stall_id=s.id and b.status<>'released'
 where s.event_id=p_event;
 return coalesce(v_result,'[]'::jsonb);
end $$;

create function public.request_stall(p_event uuid,p_stall text,p_name text,p_business text,p_category text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_booking uuid; v_open boolean;
begin
 if not exists(select 1 from public.event_members where event_id=p_event and user_id=auth.uid() and role='vendor') then
  raise exception 'An invited vendor account is required.' using errcode='42501';
 end if;
 select is_open into v_open from public.events where id=p_event for share;
 if v_open is distinct from true then raise exception 'Requests are closed for this event.'; end if;
 -- Lock the actual stall before checking availability; competing requests wait here.
 perform 1 from public.stalls where event_id=p_event and id=p_stall for update;
 if not found then raise exception 'Choose an existing stall.'; end if;
 if exists(select 1 from public.bookings where event_id=p_event and stall_id=p_stall and status<>'released') then
  raise exception 'This stall is no longer available. Choose another space.' using errcode='23505';
 end if;
 if exists(select 1 from public.bookings where event_id=p_event and vendor_id=auth.uid() and status<>'released') then
  raise exception 'You already have a request for this event.' using errcode='23505';
 end if;
 if (substring(p_stall from 2)::integer>18 and p_category is distinct from 'Food & drink') or
    (substring(p_stall from 2)::integer<=18 and p_category='Food & drink') then
  raise exception 'Choose a category allowed in this lane.';
 end if;
 insert into public.bookings(event_id,stall_id,vendor_id,contact_name,business,category)
 values(p_event,p_stall,auth.uid(),btrim(p_name),btrim(p_business),p_category) returning id into v_booking;
 insert into public.booking_audit(booking_id,actor_id,action) values(v_booking,auth.uid(),'requested');
 return v_booking;
end $$;

create function public.change_booking(p_booking uuid,p_action text,p_verified boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare b public.bookings%rowtype;
begin
 select * into b from public.bookings where id=p_booking for update;
 if not found then raise exception 'Booking not found or access denied.' using errcode='42501'; end if;
 if not exists(select 1 from public.event_members where event_id=b.event_id and user_id=auth.uid() and role='organiser') then
  raise exception 'Only this event organiser can change a booking.' using errcode='42501';
 end if;
 if p_action='approve' and b.status='requested' then
  update public.bookings set status='held',updated_at=now() where id=b.id;
 elsif p_action='confirm' and b.status='held' and p_verified is true then
  update public.bookings set status='booked',deposit_verified=true,updated_at=now() where id=b.id;
 elsif p_action='release' and b.status in ('requested','held') then
  update public.bookings set status='released',updated_at=now() where id=b.id;
 else
  raise exception 'Booking changed or action is invalid. Refresh and check its status.';
 end if;
 insert into public.booking_audit(booking_id,actor_id,action) values(b.id,auth.uid(),p_action);
end $$;
revoke all on function public.trial_stalls(uuid) from public,anon;
revoke all on function public.request_stall(uuid,text,text,text,text) from public,anon;
revoke all on function public.change_booking(uuid,text,boolean) from public,anon;
grant execute on function public.trial_stalls(uuid),public.request_stall(uuid,text,text,text,text),public.change_booking(uuid,text,boolean) to authenticated;

-- A fictional, closed trial; invite accounts before opening requests.
insert into public.events(slug,name) values('courtyard-trial','The Courtyard Market');
insert into public.stalls(event_id,id,price)
select e.id,'B'||lpad(n::text,2,'0'),case when n>18 then 4500 when (n-1)%6 in (0,5) then 4000 else 3500 end
from public.events e cross join generate_series(1,24) n where e.slug='courtyard-trial';
commit;
