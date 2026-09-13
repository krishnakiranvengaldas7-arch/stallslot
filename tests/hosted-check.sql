-- Disposable relational fixtures only. ROLLBACK removes all test rows.
-- This checks hosted database permissions; it does not test Auth sign-in.
begin;
do $$
declare
 e uuid; vendor uuid:=gen_random_uuid(); other_vendor uuid:=gen_random_uuid(); organiser uuid:=gen_random_uuid();
 booking uuid; snapshot jsonb; blocked boolean; amount integer;
begin
 insert into public.events(slug,name,is_open) values('qa-'||gen_random_uuid(),'Disposable QA event',true) returning id into e;
 insert into public.stalls values(e,'B09',3500),(e,'B10',3500);
 insert into auth.users(id) values(vendor),(other_vendor),(organiser);
 insert into public.event_members values(e,vendor,'vendor'),(e,other_vendor,'vendor'),(e,organiser,'organiser');
 perform set_config('request.jwt.claim.sub',vendor::text,true);
 execute 'set local role authenticated';
 select count(*) into amount from public.events where id=e;
 if amount<>1 then raise exception 'Invited vendor could not read event'; end if;
 booking:=public.request_stall(e,'B09','QA Vendor','QA Business','Fashion');
 blocked:=false;
 begin perform public.change_booking(booking,'approve',false); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'Vendor approval was allowed'; end if;
 blocked:=false;
 begin execute 'select * from public.bookings'; exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'Direct booking reads were allowed'; end if;
 perform set_config('request.jwt.claim.sub',other_vendor::text,true);
 snapshot:=public.trial_stalls(e);
 if snapshot->0->>'status'<>'requested' or snapshot->0->>'business'<>'' or snapshot->0->>'bookingId' is not null then raise exception 'Vendor privacy check failed'; end if;
 blocked:=false;
 begin perform public.request_stall(e,'B09','QA Other','QA Other Business','Fashion'); exception when unique_violation then blocked:=true; end;
 if not blocked then raise exception 'Duplicate booking was allowed'; end if;
 perform set_config('request.jwt.claim.sub',organiser::text,true);
 perform public.change_booking(booking,'approve',false);
 blocked:=false;
 begin perform public.change_booking(booking,'confirm',false); exception when raise_exception then blocked:=true; end;
 if not blocked then raise exception 'Unverified deposit was accepted'; end if;
 perform public.change_booking(booking,'confirm',true);
 snapshot:=public.trial_stalls(e);
 if snapshot->0->>'status'<>'booked' then raise exception 'Booking was not confirmed'; end if;
 execute 'set local role anon';
 blocked:=false;
 begin perform public.trial_stalls(e); exception when insufficient_privilege then blocked:=true; end;
 if not blocked then raise exception 'Anonymous read was allowed'; end if;
 execute 'reset role';
 select count(*) into amount from public.booking_audit where booking_id=booking;
 if amount<>3 then raise exception 'Audit trail missing'; end if;
end $$;
select 'PASS: hosted request, approval, confirmation, privacy, anonymous denial, vendor denial, duplicate rejection and audit checks' as result;
rollback;
