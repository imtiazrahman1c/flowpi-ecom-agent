alter table public.flowpi_conversations add column processing_started_at timestamptz;
create or replace function public.flowpi_begin(m uuid,c text,u text,e text,t text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cv public.flowpi_conversations; ev public.flowpi_events; hist jsonb;
begin
 if not exists(select 1 from public.flowpi_merchants where id=m and enabled) then raise exception 'merchant_disabled'; end if;
 insert into public.flowpi_conversations(merchant_id,channel,customer_id) values(m,c,u) on conflict do nothing;
 select * into cv from public.flowpi_conversations where merchant_id=m and channel=c and customer_id=u for update;
 select * into ev from public.flowpi_events where merchant_id=m and channel=c and event_id=e;
 if found and ev.customer_id<>u then raise exception 'event_identity_conflict'; end if;
 if ev.status='complete' then return jsonb_build_object('status','duplicate');end if;
 if cv.processing_event is not null then return jsonb_build_object('status','busy');end if;
 perform pg_advisory_xact_lock(hashtextextended(m::text,1));
 if length(t)>4000 or length(e)>160 or length(u)>160 then raise exception 'invalid_event';end if;
 if (select count(*) from public.flowpi_messages where merchant_id=m and role='user' and created_at>now()-interval '1 minute')>=30 then raise exception 'merchant_rate_limit';end if;
 insert into public.flowpi_events values(m,c,u,e,'processing') on conflict(merchant_id,channel,event_id) do update set status='processing';
 insert into public.flowpi_messages(merchant_id,channel,customer_id,event_id,role,content) values(m,c,u,e,'user',t) on conflict do nothing;
 if cv.human_owned then update public.flowpi_events set status='complete' where merchant_id=m and channel=c and event_id=e;return jsonb_build_object('status','human');end if;
 update public.flowpi_conversations set processing_event=e,processing_started_at=now() where merchant_id=m and channel=c and customer_id=u;
 select coalesce(jsonb_agg(x order by x.id),'[]'::jsonb) into hist from(select id,role,content from public.flowpi_messages where merchant_id=m and channel=c and customer_id=u and event_id<>e order by id desc limit 12)x;
 return jsonb_build_object('status','claimed','history',hist);
end $$;
create or replace function public.flowpi_simulate_shipment(m uuid,oid uuid,next_state text) returns void language plpgsql security definer set search_path='' as $$
declare cur text;os text;begin
 perform flowpi_private.require_operator(m);
 select status into os from public.flowpi_orders where merchant_id=m and id=oid for update;
 if os is distinct from 'confirmed' or not exists(select 1 from public.flowpi_settings where merchant_id=m and sandbox) then raise exception 'sandbox_confirmed_order_required';end if;
 select status into cur from public.flowpi_shipments where merchant_id=m and order_id=oid for update;
 if not ((cur='not_booked' and next_state='booked') or(cur='booked' and next_state='in_transit') or(cur='in_transit' and next_state in('delivered','delivery_failed','returned'))) then raise exception 'invalid_shipment_transition';end if;
 update public.flowpi_shipments set status=next_state,tracking_id='SANDBOX-'||left(oid::text,8) where merchant_id=m and order_id=oid;
 insert into public.flowpi_audit(merchant_id,actor_id,event_type,entity_id,payload) values(m,auth.uid(),'sandbox.shipment',oid::text,jsonb_build_object('state',next_state));
end $$;
create function public.flowpi_recover_conversations(m uuid) returns integer language plpgsql security definer set search_path='' as $$declare cv public.flowpi_conversations;cnt integer=0;begin
 perform flowpi_private.require_operator(m);
 for cv in select * from public.flowpi_conversations where merchant_id=m and processing_event is not null and processing_started_at<now()-interval '2 minutes' for update skip locked loop
 update public.flowpi_events set status='failed' where merchant_id=m and channel=cv.channel and event_id=cv.processing_event;
 update public.flowpi_conversations set human_owned=true,processing_event=null where merchant_id=m and channel=cv.channel and customer_id=cv.customer_id;
 insert into public.flowpi_incidents(merchant_id,code,correlation_id) values(m,'conversation_processing_expired',cv.processing_event) on conflict do nothing;
 cnt=cnt+1;
 end loop;return cnt;
end $$;
revoke all on function public.flowpi_recover_conversations(uuid) from public,anon;
grant execute on function public.flowpi_recover_conversations(uuid) to authenticated;
create or replace function public.flowpi_reports(m uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if not flowpi_private.allowed(m) then raise exception 'forbidden' using errcode='42501';end if;
 return jsonb_build_object('timezone','Asia/Dhaka','conversations',(select count(*) from public.flowpi_conversations where merchant_id=m),'human_owned',(select count(*) from public.flowpi_conversations where merchant_id=m and human_owned),'confirmed_orders',(select count(*) from public.flowpi_orders where merchant_id=m and status='confirmed'),'cod_pending_minor',(select coalesce(sum(amount_minor),0) from public.flowpi_cod_settlements where merchant_id=m and status<>'settled' and order_id in(select id from public.flowpi_orders where merchant_id=m and status='confirmed')),'paid_minor',(select coalesce(sum(amount_minor),0) from public.flowpi_payments where merchant_id=m and status='paid'),'cod_settled_minor',(select coalesce(sum(amount_minor),0) from public.flowpi_cod_settlements where merchant_id=m and status='settled'),'open_incidents',(select count(*) from public.flowpi_incidents where merchant_id=m and status='open'),'pending_jobs',(select count(*) from public.flowpi_outbox where merchant_id=m and status in('pending','claimed')),'low_stock',(select count(*) from public.flowpi_inventory where merchant_id=m and available<=2));
end $$;
