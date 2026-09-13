begin;
alter table public.events add column venue text not null default 'Private practice venue',
 add column event_date date, add column description text not null default 'A fictional market for trying stall bookings. No real payments.',
 add column layout_revision integer not null default 1;
alter table public.stalls drop constraint stalls_id_check;
alter table public.stalls add constraint stalls_id_check check(id ~ '^[A-Z][A-Z0-9-]{0,11}$'),
 add column x numeric not null default 5 check(x between 0 and 92),
 add column y numeric not null default 5 check(y between 0 and 92),
 add column width_ft integer not null default 8 check(width_ft between 1 and 100),
 add column depth_ft integer not null default 8 check(depth_ft between 1 and 100),
 add column power boolean not null default false,
 add column zone text not null default 'Main area' check(char_length(zone) between 1 and 60),
 add column stall_type text not null default 'retail' check(stall_type in ('retail','food','any'));
-- Preserve the original map and every existing booking.
update public.stalls set
 x=case when substring(id from 2)::int<=6 then 9+(substring(id from 2)::int-1)*14
 when substring(id from 2)::int<=12 then 6 when substring(id from 2)::int<=18 then 84
 else (array[7,20,33,57,70,83])[substring(id from 2)::int-18] end,
 y=case when substring(id from 2)::int<=6 then 12 when substring(id from 2)::int<=18
 then (array[25,34,43,59,68,77])[(substring(id from 2)::int-1)%6+1] else 88 end,
 width_ft=case when substring(id from 2)::int>18 then 10 else 8 end,
 depth_ft=case when substring(id from 2)::int>18 then 10 else 8 end,
 power=substring(id from 2)::int>18,
 stall_type=case when substring(id from 2)::int>18 then 'food' else 'retail' end,
 zone=case when substring(id from 2)::int>18 then 'South · food lane' when substring(id from 2)::int<=6 then 'North edge' when substring(id from 2)::int<=12 then 'West edge' else 'East edge' end;

create or replace function private.trial_stalls(p_event uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_role text; v_result jsonb;
begin
 select role into v_role from public.event_members where event_id=p_event and user_id=auth.uid();
 if v_role is null then raise exception 'This account is not invited to this event.' using errcode='42501'; end if;
 select jsonb_agg(jsonb_build_object(
 'id',s.id,'price',s.price,'x',s.x,'y',s.y,'width_ft',s.width_ft,'depth_ft',s.depth_ft,'power',s.power,'zone',s.zone,'stall_type',s.stall_type,
 'locked',case when v_role='organiser' then exists(select 1 from public.bookings h where h.event_id=s.event_id and h.stall_id=s.id) else false end,
 'status',coalesce(b.status,'available'),
 'bookingId',case when b.vendor_id=auth.uid() or v_role='organiser' then b.id else null end,
 'business',case when b.vendor_id=auth.uid() or v_role='organiser' then b.business else '' end,
 'name',case when b.vendor_id=auth.uid() or v_role='organiser' then b.contact_name else '' end,
 'category',case when b.vendor_id=auth.uid() or v_role='organiser' then b.category else '' end,
 'depositVerified',case when b.vendor_id=auth.uid() or v_role='organiser' then b.deposit_verified else false end,
 'mine',coalesce(b.vendor_id=auth.uid(),false)) order by s.id) into v_result
 from public.stalls s left join public.bookings b on b.event_id=s.event_id and b.stall_id=s.id and b.status<>'released' where s.event_id=p_event;
 return coalesce(v_result,'[]'::jsonb);
end $$;

create function private.trial_workspace(p_event uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_stalls jsonb;
begin
 perform 1 from public.events where id=p_event for share;
 v_stalls:=private.trial_stalls(p_event);
 return (select jsonb_build_object('event',jsonb_build_object('id',id,'name',name,'is_open',is_open,'is_test',is_test,'venue',venue,'event_date',event_date,'description',description,'layout_revision',layout_revision),'stalls',v_stalls) from public.events where id=p_event);
end $$;

create function private.save_trial_layout(p_event uuid,p_revision integer,p_details jsonb,p_stalls jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare ev public.events%rowtype; item jsonb; proposed public.stalls%rowtype; old public.stalls%rowtype;
begin
 if not exists(select 1 from public.event_members where event_id=p_event and user_id=auth.uid() and role='organiser') then
 raise exception 'Only this event organiser can edit the layout.' using errcode='42501'; end if;
 -- Same event lock taken by requests: a layout cannot change beneath a booking.
 select * into ev from public.events where id=p_event for update;
 if ev.is_open then raise exception 'Close requests before editing the layout.'; end if;
 if p_revision is distinct from ev.layout_revision then raise exception 'The layout changed. Reload the saved layout before editing.' using errcode='40001'; end if;
 if p_stalls is null or jsonb_typeof(p_stalls)<>'array' then raise exception 'Provide a list of stalls.'; end if;
 if jsonb_array_length(p_stalls) not between 1 and 100 then raise exception 'A layout needs 1 to 100 stalls.'; end if;
 if p_details is null or jsonb_typeof(p_details)<>'object' or coalesce(char_length(btrim(p_details->>'name')),0) not between 2 and 100
 or coalesce(char_length(btrim(p_details->>'venue')),0) not between 2 and 160
 or coalesce(char_length(p_details->>'description'),0)>1000 then raise exception 'Check the event name, venue and description.'; end if;
 if (select count(distinct value->>'id') from jsonb_array_elements(p_stalls))<>jsonb_array_length(p_stalls) then raise exception 'Stall IDs must be unique.'; end if;
 for item in select value from jsonb_array_elements(p_stalls) loop
  proposed:=jsonb_populate_record(null::public.stalls,item);
  if proposed.id is null or proposed.id !~ '^[A-Z][A-Z0-9-]{0,11}$' or proposed.price is null or proposed.price not between 1 and 1000000
  or proposed.x is null or proposed.x not between 0 and 92 or proposed.y is null or proposed.y not between 0 and 92
  or proposed.width_ft is null or proposed.width_ft not between 1 and 100 or proposed.depth_ft is null or proposed.depth_ft not between 1 and 100
  or proposed.power is null or proposed.stall_type is null or proposed.stall_type not in ('retail','food','any')
  or coalesce(char_length(btrim(proposed.zone)),0) not between 1 and 60 then raise exception 'Check stall IDs, positions, sizes, zones and prices.'; end if;
  select * into old from public.stalls where event_id=p_event and id=proposed.id;
  if found and exists(select 1 from public.bookings where event_id=p_event and stall_id=old.id) and
  row(old.price,old.x,old.y,old.width_ft,old.depth_ft,old.power,old.zone,old.stall_type) is distinct from
  row(proposed.price,proposed.x,proposed.y,proposed.width_ft,proposed.depth_ft,proposed.power,proposed.zone,proposed.stall_type) then
   raise exception 'Stall % has booking history and cannot be changed.',old.id; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_stalls) a cross join jsonb_array_elements(p_stalls) b
 where a->>'id'<b->>'id' and abs((a->>'x')::numeric-(b->>'x')::numeric)<8 and abs((a->>'y')::numeric-(b->>'y')::numeric)<8) then
 raise exception 'Stalls overlap. Leave space between stalls.'; end if;
 if exists(select 1 from public.bookings b where b.event_id=p_event and not exists(select 1 from jsonb_array_elements(p_stalls) s where s->>'id'=b.stall_id)) then
 raise exception 'Stalls with booking history cannot be removed.'; end if;
 delete from public.stalls s where event_id=p_event and not exists(select 1 from jsonb_array_elements(p_stalls) i where i->>'id'=s.id);
 insert into public.stalls(event_id,id,price,x,y,width_ft,depth_ft,power,zone,stall_type)
 select p_event,r.id,r.price,r.x,r.y,r.width_ft,r.depth_ft,r.power,r.zone,r.stall_type from jsonb_populate_recordset(null::public.stalls,p_stalls) r
 on conflict(event_id,id) do update set price=excluded.price,x=excluded.x,y=excluded.y,width_ft=excluded.width_ft,depth_ft=excluded.depth_ft,power=excluded.power,zone=excluded.zone,stall_type=excluded.stall_type;
 update public.events set name=btrim(p_details->>'name'),venue=btrim(p_details->>'venue'),event_date=nullif(p_details->>'event_date','')::date,
 description=coalesce(p_details->>'description',''),layout_revision=layout_revision+1 where id=p_event;
end $$;

create or replace function private.request_stall(p_event uuid,p_stall text,p_name text,p_business text,p_category text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_booking uuid; v_open boolean; v_type text;
begin
 if not exists(select 1 from public.event_members where event_id=p_event and user_id=auth.uid() and role='vendor') then
 raise exception 'An invited vendor account is required.' using errcode='42501'; end if;
 select is_open into v_open from public.events where id=p_event for share;
 if v_open is distinct from true then raise exception 'Requests are closed for this event.'; end if;
 select stall_type into v_type from public.stalls where event_id=p_event and id=p_stall for update;
 if not found then raise exception 'Choose an existing stall.'; end if;
 if exists(select 1 from public.bookings where event_id=p_event and stall_id=p_stall and status<>'released') then raise exception 'This stall is no longer available. Choose another space.' using errcode='23505'; end if;
 if exists(select 1 from public.bookings where event_id=p_event and vendor_id=auth.uid() and status<>'released') then raise exception 'You already have a request for this event.' using errcode='23505'; end if;
 if (v_type='food' and p_category is distinct from 'Food & drink') or (v_type='retail' and p_category='Food & drink') then raise exception 'Choose a category allowed in this lane.'; end if;
 insert into public.bookings(event_id,stall_id,vendor_id,contact_name,business,category) values(p_event,p_stall,auth.uid(),btrim(p_name),btrim(p_business),p_category) returning id into v_booking;
 insert into public.booking_audit(booking_id,actor_id,action) values(v_booking,auth.uid(),'requested');
 return v_booking;
end $$;
create function private.request_stall_v2(p_event uuid,p_stall text,p_name text,p_business text,p_category text,p_revision integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_revision integer;
begin
 if not exists(select 1 from public.event_members where event_id=p_event and user_id=auth.uid() and role='vendor') then raise exception 'An invited vendor account is required.' using errcode='42501'; end if;
 select layout_revision into v_revision from public.events where id=p_event for share;
 if v_revision is distinct from p_revision then raise exception 'The layout changed. Refresh and review the stall again.' using errcode='40001'; end if;
 return private.request_stall(p_event,p_stall,p_name,p_business,p_category);
end $$;

create function public.trial_workspace(p_event uuid) returns jsonb language sql security invoker set search_path='' as $$select private.trial_workspace(p_event)$$;
create function public.save_trial_layout(p_event uuid,p_revision integer,p_details jsonb,p_stalls jsonb) returns void language sql security invoker set search_path='' as $$select private.save_trial_layout(p_event,p_revision,p_details,p_stalls)$$;
create function public.request_stall_v2(p_event uuid,p_stall text,p_name text,p_business text,p_category text,p_revision integer) returns uuid language sql security invoker set search_path='' as $$select private.request_stall_v2(p_event,p_stall,p_name,p_business,p_category,p_revision)$$;
revoke all on function private.trial_workspace(uuid),private.save_trial_layout(uuid,integer,jsonb,jsonb),private.request_stall_v2(uuid,text,text,text,text,integer),public.trial_workspace(uuid),public.save_trial_layout(uuid,integer,jsonb,jsonb),public.request_stall_v2(uuid,text,text,text,text,integer) from public,anon;
grant execute on function private.trial_workspace(uuid),private.save_trial_layout(uuid,integer,jsonb,jsonb),private.request_stall_v2(uuid,text,text,text,text,integer),public.trial_workspace(uuid),public.save_trial_layout(uuid,integer,jsonb,jsonb),public.request_stall_v2(uuid,text,text,text,text,integer) to authenticated;
commit;
