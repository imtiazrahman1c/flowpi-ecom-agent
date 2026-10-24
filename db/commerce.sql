-- Additive V5.2 development migration. No unrelated resources.
create schema if not exists flowpi_private;
revoke all on schema flowpi_private from public;
grant usage on schema flowpi_private to authenticated,service_role;
create table public.flowpi_memberships(merchant_id uuid not null references public.flowpi_merchants,user_id uuid not null references auth.users,role text not null check(role in('owner','admin','manager','agent','viewer')),primary key(merchant_id,user_id));
create index on public.flowpi_memberships(user_id);
create function flowpi_private.allowed(m uuid,rs text[] default array['owner','admin','manager','agent','viewer']) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.flowpi_memberships where merchant_id=m and user_id=(select auth.uid()) and role=any(rs));
$$;
revoke all on function flowpi_private.allowed(uuid,text[]) from public;
grant execute on function flowpi_private.allowed(uuid,text[]) to authenticated,service_role;
create function flowpi_private.require_operator(m uuid) returns void language plpgsql security invoker set search_path='' as $$begin
 if not flowpi_private.allowed(m,array['owner','admin','manager','agent']) then raise exception 'forbidden' using errcode='42501';end if;
end $$;
revoke all on function flowpi_private.require_operator(uuid) from public;
grant execute on function flowpi_private.require_operator(uuid) to authenticated;
alter table public.flowpi_products add unique(merchant_id,id);
create table public.flowpi_settings(merchant_id uuid primary key references public.flowpi_merchants,timezone text not null default 'Asia/Dhaka' check(timezone='Asia/Dhaka'),delivery_fees jsonb not null default '{"Dhaka":8000,"Khulna":12000,"Chattogram":12000}',sandbox boolean not null default true,live_sending boolean not null default false check(not live_sending),max_followup_attempts integer not null default 2 check(max_followup_attempts between 1 and 5));
create table public.flowpi_variants(id uuid primary key default gen_random_uuid(),merchant_id uuid not null,product_id uuid not null,sku text not null,label text not null,aliases text[] not null default '{}',price_minor bigint not null check(price_minor between 0 and 100000000),active boolean not null default true,unique(merchant_id,id),unique(merchant_id,sku),foreign key(merchant_id,product_id) references public.flowpi_products(merchant_id,id));
create index on public.flowpi_variants(merchant_id,product_id);
create table public.flowpi_inventory(merchant_id uuid not null,variant_id uuid not null,available integer not null check(available>=0),source text not null default 'internal' check(source in('internal','external')),verified_at timestamptz not null default now(),primary key(merchant_id,variant_id),foreign key(merchant_id,variant_id) references public.flowpi_variants(merchant_id,id));
create table public.flowpi_orders(id uuid primary key default gen_random_uuid(),merchant_id uuid not null references public.flowpi_merchants,created_by uuid references auth.users,status text not null check(status in('awaiting_confirmation','confirmed','cancelled')),customer_name text not null,phone text not null,district text not null,address text not null,variant_id uuid not null,quantity integer not null check(quantity between 1 and 20),unit_price_minor bigint not null,delivery_minor bigint not null,total_minor bigint not null,confirmation_token uuid not null default gen_random_uuid(),confirmation_expires_at timestamptz not null default(now()+interval '15 minutes'),confirmed_at timestamptz,created_at timestamptz not null default now(),unique(merchant_id,id),foreign key(merchant_id,variant_id) references public.flowpi_variants(merchant_id,id));
create index on public.flowpi_orders(merchant_id,created_at desc);
create index on public.flowpi_orders(created_by);
create index on public.flowpi_orders(merchant_id,variant_id);
create table public.flowpi_order_items(merchant_id uuid not null,order_id uuid not null,variant_id uuid not null,sku text not null,label text not null,quantity integer not null,unit_price_minor bigint not null,primary key(merchant_id,order_id,variant_id),foreign key(merchant_id,order_id) references public.flowpi_orders(merchant_id,id),foreign key(merchant_id,variant_id) references public.flowpi_variants(merchant_id,id));
create index on public.flowpi_order_items(merchant_id,variant_id);
create table public.flowpi_payments(id uuid primary key default gen_random_uuid(),merchant_id uuid not null,order_id uuid not null,method text not null check(method in('cod','sandbox')),status text not null default 'pending' check(status in('pending','paid','failed','expired')),amount_minor bigint not null,currency text not null default 'BDT' check(currency='BDT'),provider_reference text,unique(merchant_id,order_id),unique(merchant_id,id),foreign key(merchant_id,order_id) references public.flowpi_orders(merchant_id,id));
create table public.flowpi_shipments(id uuid primary key default gen_random_uuid(),merchant_id uuid not null,order_id uuid not null,status text not null default 'not_booked' check(status in('not_booked','booked','in_transit','delivered','delivery_failed','returned')),provider text not null default 'sandbox' check(provider='sandbox'),tracking_id text,unique(merchant_id,order_id),unique(merchant_id,id),foreign key(merchant_id,order_id) references public.flowpi_orders(merchant_id,id));
create table public.flowpi_cod_settlements(merchant_id uuid not null,order_id uuid not null,status text not null default 'uncollected' check(status in('uncollected','collected','remittance_pending','settled','exception')),amount_minor bigint not null,primary key(merchant_id,order_id),foreign key(merchant_id,order_id) references public.flowpi_orders(merchant_id,id));
create table public.flowpi_audit(id bigint generated always as identity primary key,merchant_id uuid not null references public.flowpi_merchants,actor_id uuid,event_type text not null,entity_id text not null,payload jsonb not null default '{}',created_at timestamptz not null default now());
create index on public.flowpi_audit(merchant_id,created_at desc);
create table public.flowpi_outbox(id uuid primary key default gen_random_uuid(),merchant_id uuid not null references public.flowpi_merchants,event_type text not null,entity_id text not null,idempotency_key text not null,payload jsonb not null default '{}',status text not null default 'pending' check(status in('pending','claimed','done','dead')),attempts integer not null default 0,available_at timestamptz not null default now(),lease_until timestamptz,lease_token uuid,created_at timestamptz not null default now(),unique(merchant_id,idempotency_key));
create index on public.flowpi_outbox(merchant_id,status,available_at);
create table public.flowpi_followups(id uuid primary key default gen_random_uuid(),merchant_id uuid not null,channel text not null,customer_id text not null,order_id uuid,kind text not null default 'pending_confirmation' check(kind='pending_confirmation'),consented boolean not null default false,opted_out boolean not null default false,attempts integer not null default 0,due_at timestamptz not null,status text not null default 'scheduled' check(status in('scheduled','cancelled','deferred')),reason text,last_customer_message_at timestamptz not null default now(),foreign key(merchant_id,channel,customer_id) references public.flowpi_conversations,foreign key(merchant_id,order_id) references public.flowpi_orders(merchant_id,id));
create index on public.flowpi_followups(merchant_id,status,due_at);
create index on public.flowpi_followups(merchant_id,channel,customer_id);
create index on public.flowpi_followups(merchant_id,order_id);
create table public.flowpi_incidents(id uuid primary key default gen_random_uuid(),merchant_id uuid not null references public.flowpi_merchants,code text not null,correlation_id text not null,status text not null default 'open' check(status in('open','resolved')),created_at timestamptz not null default now(),unique(merchant_id,correlation_id));
create index on public.flowpi_incidents(merchant_id,status);
create table public.flowpi_usage(id bigint generated always as identity primary key,merchant_id uuid not null references public.flowpi_merchants,event_id text not null,kind text not null,units integer not null check(units>=0),created_at timestamptz not null default now());
create index on public.flowpi_usage(merchant_id,created_at);

-- RLS is deny-by-default. Direct writes remain restricted; mutations use checked RPCs.
do $$declare t text;begin
 foreach t in array array['flowpi_memberships','flowpi_settings','flowpi_variants','flowpi_inventory','flowpi_orders','flowpi_order_items','flowpi_payments','flowpi_shipments','flowpi_cod_settlements','flowpi_audit','flowpi_outbox','flowpi_followups','flowpi_incidents','flowpi_usage'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 execute format('create policy member_read on public.%I for select to authenticated using(flowpi_private.allowed(merchant_id))',t);
 end loop;
 foreach t in array array['flowpi_products','flowpi_policies','flowpi_conversations','flowpi_events','flowpi_messages','flowpi_handoffs','flowpi_drafts'] loop
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy member_read on public.%I for select to authenticated using(flowpi_private.allowed(merchant_id))',t);
 end loop;
end $$;
grant select on public.flowpi_merchants to authenticated;
create policy member_read on public.flowpi_merchants for select to authenticated using(flowpi_private.allowed(id));
-- Existing W01 invoker functions need narrow DML grants/policies for operator roles.
do $$declare t text;begin
 foreach t in array array['flowpi_conversations','flowpi_events','flowpi_messages','flowpi_handoffs','flowpi_drafts'] loop
 execute format('grant insert,update on public.%I to authenticated',t);
 execute format('create policy operator_write on public.%I for all to authenticated using(flowpi_private.allowed(merchant_id,array[''owner'',''admin'',''manager'',''agent''])) with check(flowpi_private.allowed(merchant_id,array[''owner'',''admin'',''manager'',''agent'']))',t);
 end loop;
end $$;
grant usage,select on sequence public.flowpi_messages_id_seq to authenticated;
grant execute on function public.flowpi_begin(uuid,text,text,text,text),public.flowpi_handoff(uuid,text,text,text,text),public.flowpi_finish(uuid,text,text,text,jsonb),public.flowpi_fail(uuid,text,text,text) to authenticated;
-- Canonical variants + inventory. Legacy product price/stock columns are not commerce truth.
create or replace function public.flowpi_search(m uuid,q text) returns setof public.flowpi_products language sql security invoker set search_path='' as $$
 select v.id,v.merchant_id,v.sku,p.name||' · '||v.label,p.aliases||v.aliases,v.price_minor,'BDT',i.available,
 case when i.source='internal' then statement_timestamp() else i.verified_at end,v.active
 from public.flowpi_variants v join public.flowpi_products p on p.id=v.product_id and p.merchant_id=v.merchant_id join public.flowpi_inventory i on i.variant_id=v.id and i.merchant_id=v.merchant_id
 where v.merchant_id=m and v.active and p.active and length(trim(q))>0 and (lower(v.sku)=lower(q) or strpos(lower(p.name),lower(q))>0 or exists(select 1 from unnest(p.aliases||v.aliases) a where strpos(lower(a),lower(q))>0)) order by v.sku limit 5;
$$;
create or replace function public.flowpi_verify(m uuid,p uuid) returns setof public.flowpi_products language sql security invoker set search_path='' as $$
 select v.id,v.merchant_id,v.sku,pr.name||' · '||v.label,pr.aliases||v.aliases,v.price_minor,'BDT',i.available,case when i.source='internal' then statement_timestamp() else i.verified_at end,v.active
 from public.flowpi_variants v join public.flowpi_products pr on pr.id=v.product_id and pr.merchant_id=v.merchant_id join public.flowpi_inventory i on i.variant_id=v.id and i.merchant_id=v.merchant_id where v.merchant_id=m and v.id=p and v.active and pr.active;
$$;
grant execute on function public.flowpi_search(uuid,text),public.flowpi_verify(uuid,uuid),public.flowpi_policies(uuid,text) to authenticated;

create function public.flowpi_create_order_draft(m uuid,v uuid,q integer,n text,ph text,d text,a text) returns public.flowpi_orders language plpgsql security definer set search_path='' as $$
declare variant public.flowpi_variants; inv public.flowpi_inventory; fee bigint; o public.flowpi_orders;
begin
 perform flowpi_private.require_operator(m);
 if q is null or q not between 1 and 20 or length(trim(n)) not between 2 and 100 or ph !~ '^01[3-9][0-9]{8}$' or length(trim(a)) not between 10 and 500 then raise exception 'invalid_order_details';end if;
 select * into variant from public.flowpi_variants where merchant_id=m and id=v and active;
 if not found then raise exception 'variant_not_found';end if;
 select * into inv from public.flowpi_inventory where merchant_id=m and variant_id=v;
 if inv.available is null or inv.available<q then raise exception 'out_of_stock';end if;
 if inv.source<>'internal' then raise exception 'external_inventory_adapter_required';end if;
 select (delivery_fees->>d)::bigint into fee from public.flowpi_settings where merchant_id=m and sandbox;
 if fee is null or fee<0 then raise exception 'unsupported_delivery_region';end if;
 insert into public.flowpi_orders(merchant_id,created_by,status,customer_name,phone,district,address,variant_id,quantity,unit_price_minor,delivery_minor,total_minor)
 values(m,auth.uid(),'awaiting_confirmation',trim(n),ph,d,trim(a),v,q,variant.price_minor,fee,variant.price_minor*q+fee) returning * into o;
 return o;
end $$;
create function public.flowpi_confirm_order(m uuid,oid uuid,token uuid,accepted boolean) returns public.flowpi_orders language plpgsql security definer set search_path='' as $$
declare o public.flowpi_orders; v public.flowpi_variants; fee bigint; available_now integer;
begin
 perform flowpi_private.require_operator(m);
 select * into o from public.flowpi_orders where merchant_id=m and id=oid for update;
 if not found or o.confirmation_token is distinct from token or accepted is distinct from true then raise exception 'explicit_confirmation_required';end if;
 if o.status='confirmed' then return o;end if;
 if o.status<>'awaiting_confirmation' or o.confirmation_expires_at<now() then raise exception 'draft_expired_or_invalid';end if;
 select * into v from public.flowpi_variants where merchant_id=m and id=o.variant_id and active for share;
 if not found or v.price_minor<>o.unit_price_minor then raise exception 'price_changed_create_new_draft';end if;
 select (delivery_fees->>o.district)::bigint into fee from public.flowpi_settings where merchant_id=m and sandbox;
 if fee is distinct from o.delivery_minor then raise exception 'delivery_fee_changed';end if;
 select available into available_now from public.flowpi_inventory where merchant_id=m and variant_id=o.variant_id and source='internal' for update;
 if available_now is null or available_now<o.quantity then raise exception 'out_of_stock';end if;
 update public.flowpi_inventory set available=available-o.quantity,verified_at=now() where merchant_id=m and variant_id=o.variant_id;
 update public.flowpi_orders set status='confirmed',confirmed_at=now() where id=o.id returning * into o;
 insert into public.flowpi_order_items values(m,o.id,v.id,v.sku,v.label,o.quantity,v.price_minor);
 insert into public.flowpi_payments(merchant_id,order_id,method,amount_minor) values(m,o.id,'cod',o.total_minor);
 insert into public.flowpi_shipments(merchant_id,order_id) values(m,o.id);
 insert into public.flowpi_cod_settlements(merchant_id,order_id,amount_minor) values(m,o.id,o.total_minor);
 insert into public.flowpi_outbox(merchant_id,event_type,entity_id,idempotency_key) values(m,'order.confirmed',o.id::text,'order.confirmed:'||o.id);
 insert into public.flowpi_audit(merchant_id,actor_id,event_type,entity_id) values(m,auth.uid(),'order.confirmed',o.id::text);
 update public.flowpi_followups set status='cancelled',reason='order_confirmed' where merchant_id=m and order_id=o.id and status='scheduled';
 return o;
end $$;
create function public.flowpi_cancel_order(m uuid,oid uuid) returns void language plpgsql security definer set search_path='' as $$
declare o public.flowpi_orders;s text;begin
 perform flowpi_private.require_operator(m);
 select * into o from public.flowpi_orders where merchant_id=m and id=oid for update;
 if not found then raise exception 'order_not_found';end if;
 if o.status='cancelled' then return;end if;
 select status into s from public.flowpi_shipments where merchant_id=m and order_id=oid;
 if s is not null and s<>'not_booked' then raise exception 'shipping_started_staff_review_required';end if;
 if o.status='confirmed' then update public.flowpi_inventory set available=available+o.quantity where merchant_id=m and variant_id=o.variant_id;end if;
 update public.flowpi_orders set status='cancelled' where id=oid;
 update public.flowpi_followups set status='cancelled',reason='order_cancelled' where merchant_id=m and order_id=oid;
 insert into public.flowpi_audit(merchant_id,actor_id,event_type,entity_id) values(m,auth.uid(),'order.cancelled',oid::text);
end $$;

create function public.flowpi_takeover(m uuid,c text,u text,take boolean) returns void language plpgsql security definer set search_path='' as $$begin
 perform flowpi_private.require_operator(m);
 update public.flowpi_conversations set human_owned=take where merchant_id=m and channel=c and customer_id=u;
 if not found then raise exception 'conversation_not_found';end if;
 insert into public.flowpi_audit(merchant_id,actor_id,event_type,entity_id) values(m,auth.uid(),case when take then 'human.takeover' else 'ai.resume' end,c||':'||u);
end $$;

create function public.flowpi_followup_sweep(m uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.flowpi_followups;human boolean; os text;cnt integer=0;begin
 perform flowpi_private.require_operator(m);
 for f in select * from public.flowpi_followups where merchant_id=m and status='scheduled' and due_at<=now() for update skip locked loop
 select human_owned into human from public.flowpi_conversations where merchant_id=m and channel=f.channel and customer_id=f.customer_id;
 select status into os from public.flowpi_orders where merchant_id=m and id=f.order_id;
 update public.flowpi_followups set status=case when f.opted_out or not f.consented or human or os in('confirmed','cancelled') or f.attempts>=2 then 'cancelled' else 'deferred' end,
 reason=case when f.opted_out then 'opted_out' when not f.consented then 'no_consent' when human then 'human_owned' when os in('confirmed','cancelled') then 'order_stopped' when f.attempts>=2 then 'attempt_limit' when f.channel<>'website' and f.last_customer_message_at<now()-interval '24 hours' then 'approved_template_required' else 'live_sending_disabled' end where id=f.id;
 cnt=cnt+1;end loop;
 return jsonb_build_object('reviewed',cnt,'sent',0);
end $$;

-- Leased queue claims. No provider-side action is performed by this function.
create function public.flowpi_claim_jobs(m uuid,lim integer default 10) returns setof public.flowpi_outbox language plpgsql security definer set search_path='' as $$begin
 perform flowpi_private.require_operator(m);
 return query with claimed as(select id from public.flowpi_outbox where merchant_id=m and status='pending' and available_at<=now() order by created_at for update skip locked limit least(greatest(lim,1),50)) update public.flowpi_outbox j set status='claimed',attempts=attempts+1,lease_until=now()+interval '2 minutes',lease_token=gen_random_uuid() from claimed c where j.id=c.id returning j.*;
end $$;
create function public.flowpi_finish_job(m uuid,j uuid,lease uuid,ok boolean) returns void language plpgsql security definer set search_path='' as $$begin
 perform flowpi_private.require_operator(m);
 update public.flowpi_outbox set status=case when ok then 'done' when attempts>=3 then 'dead' else 'pending' end,available_at=now()+interval '1 minute'*power(2,attempts),lease_until=null,lease_token=null where merchant_id=m and id=j and lease_token=lease and status='claimed' and lease_until>=now();
 if not found then raise exception 'invalid_lease';end if;
end $$;

-- Sandbox shipment simulator: independent of payment and COD settlement, never real courier booking.
create function public.flowpi_simulate_shipment(m uuid,oid uuid,next_state text) returns void language plpgsql security definer set search_path='' as $$
declare cur text;begin
 perform flowpi_private.require_operator(m);
 if not exists(select 1 from public.flowpi_settings where merchant_id=m and sandbox) or not exists(select 1 from public.flowpi_orders where merchant_id=m and id=oid and status='confirmed') then raise exception 'sandbox_confirmed_order_required';end if;
 select status into cur from public.flowpi_shipments where merchant_id=m and order_id=oid for update;
 if not ((cur='not_booked' and next_state='booked') or(cur='booked' and next_state='in_transit') or(cur='in_transit' and next_state in('delivered','delivery_failed','returned'))) then raise exception 'invalid_shipment_transition';end if;
 update public.flowpi_shipments set status=next_state,tracking_id='SANDBOX-'||left(oid::text,8) where merchant_id=m and order_id=oid;
 insert into public.flowpi_audit(merchant_id,actor_id,event_type,entity_id,payload) values(m,auth.uid(),'sandbox.shipment',oid::text,jsonb_build_object('state',next_state));
end $$;

-- Grant only named checked APIs; postgres default PUBLIC execution is revoked.
do $$declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('flowpi_create_order_draft','flowpi_confirm_order','flowpi_cancel_order','flowpi_takeover','flowpi_followup_sweep','flowpi_claim_jobs','flowpi_finish_job','flowpi_simulate_shipment') loop
 execute format('revoke all on function %s from public,anon',f.sig);
 execute format('grant execute on function %s to authenticated',f.sig);
 end loop;
end $$;
