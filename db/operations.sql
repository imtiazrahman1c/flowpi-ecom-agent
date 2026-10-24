create function public.flowpi_onboard_sandbox(store_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare m uuid;p uuid;v uuid;begin
 if auth.uid() is null then raise exception 'authentication_required' using errcode='42501';end if;
 if length(trim(store_name)) not between 2 and 80 then raise exception 'invalid_store_name';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select merchant_id into m from public.flowpi_memberships where user_id=auth.uid() order by merchant_id limit 1;
 if found then return m;end if;
 insert into public.flowpi_merchants(name,enabled) values(trim(store_name)||' · Sandbox',true) returning id into m;
 insert into public.flowpi_memberships values(m,auth.uid(),'owner');
 insert into public.flowpi_settings(merchant_id) values(m);
 insert into public.flowpi_products(merchant_id,sku,name,aliases,price_minor,stock,verified_at) values(m,'DEMO-SHOE','Black Shoe',array['কালো জুতা','kalo juta','black shoe'],250000,5,now()) returning id into p;
 insert into public.flowpi_variants(merchant_id,product_id,sku,label,aliases,price_minor) values(m,p,'DEMO-SHOE-42','Black / Size 42',array['black shoe 42','কালো জুতা ৪২','kalo juta 42'],250000) returning id into v;
 insert into public.flowpi_inventory(merchant_id,variant_id,available) values(m,v,5);
 insert into public.flowpi_variants(merchant_id,product_id,sku,label,aliases,price_minor) values(m,p,'DEMO-SHOE-41','Black / Size 41',array['black shoe 41'],250000) returning id into v;
 insert into public.flowpi_inventory(merchant_id,variant_id,available) values(m,v,0);
 insert into public.flowpi_products(merchant_id,sku,name,aliases,price_minor,stock,verified_at) values(m,'DEMO-SHIRT','Blue Shirt',array['নীল শার্ট','nil shirt','blue shirt'],125000,8,now()) returning id into p;
 insert into public.flowpi_variants(merchant_id,product_id,sku,label,aliases,price_minor) values(m,p,'DEMO-SHIRT-M','Blue / Medium',array['blue shirt medium','নীল শার্ট মিডিয়াম'],125000) returning id into v;
 insert into public.flowpi_inventory(merchant_id,variant_id,available) values(m,v,8);
 insert into public.flowpi_policies(merchant_id,keywords,content,approved) values(m,array['delivery','ডেলিভারি','cod'],'Sandbox policy: COD available. Demo delivery fees: Dhaka BDT 80; Khulna and Chattogram BDT 120. These are synthetic test rules, not a real merchant promise.',true);
 insert into public.flowpi_audit(merchant_id,actor_id,event_type,entity_id) values(m,auth.uid(),'sandbox.created',m::text);
 return m;
end $$;
revoke all on function public.flowpi_onboard_sandbox(text) from public,anon;
grant execute on function public.flowpi_onboard_sandbox(text) to authenticated;

create function public.flowpi_record_incident(m uuid,code text,correlation text) returns void language plpgsql security definer set search_path='' as $$begin
 perform flowpi_private.require_operator(m);
 if code !~ '^[a-z0-9_]{1,80}$' or length(correlation) not between 1 and 160 then raise exception 'invalid_incident';end if;
 insert into public.flowpi_incidents(merchant_id,code,correlation_id) values(m,code,correlation) on conflict do nothing;
end $$;
revoke all on function public.flowpi_record_incident(uuid,text,text) from public,anon;
grant execute on function public.flowpi_record_incident(uuid,text,text) to authenticated;

create function public.flowpi_reconcile_jobs(m uuid) returns integer language plpgsql security definer set search_path='' as $$declare cnt integer;begin
 perform flowpi_private.require_operator(m);
 -- Unknown external outcomes must not be blindly retried. Dead-letter for operator review.
 with stale as(update public.flowpi_outbox set status='dead',lease_until=null,lease_token=null where merchant_id=m and status='claimed' and lease_until<now() returning id)
 insert into public.flowpi_incidents(merchant_id,code,correlation_id) select m,'job_lease_expired',id::text from stale on conflict do nothing;
 get diagnostics cnt=row_count;return cnt;
end $$;
revoke all on function public.flowpi_reconcile_jobs(uuid) from public,anon;
grant execute on function public.flowpi_reconcile_jobs(uuid) to authenticated;

create function public.flowpi_reports(m uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if not flowpi_private.allowed(m) then raise exception 'forbidden' using errcode='42501';end if;
 return jsonb_build_object('timezone','Asia/Dhaka','conversations',(select count(*) from public.flowpi_conversations where merchant_id=m),'human_owned',(select count(*) from public.flowpi_conversations where merchant_id=m and human_owned),'confirmed_orders',(select count(*) from public.flowpi_orders where merchant_id=m and status='confirmed'),'cod_pending_minor',(select coalesce(sum(amount_minor),0) from public.flowpi_cod_settlements where merchant_id=m and status<>'settled'),'paid_minor',(select coalesce(sum(amount_minor),0) from public.flowpi_payments where merchant_id=m and status='paid'),'cod_settled_minor',(select coalesce(sum(amount_minor),0) from public.flowpi_cod_settlements where merchant_id=m and status='settled'),'open_incidents',(select count(*) from public.flowpi_incidents where merchant_id=m and status='open'),'pending_jobs',(select count(*) from public.flowpi_outbox where merchant_id=m and status in('pending','claimed')),'low_stock',(select count(*) from public.flowpi_inventory where merchant_id=m and available<=2));
end $$;
revoke all on function public.flowpi_reports(uuid) from public,anon;
grant execute on function public.flowpi_reports(uuid) to authenticated;

create function public.flowpi_import_catalog(m uuid,rows jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare r jsonb;p uuid;v uuid;cnt integer=0;begin
 if not flowpi_private.allowed(m,array['owner','admin']) then raise exception 'forbidden' using errcode='42501';end if;
 if not exists(select 1 from public.flowpi_settings where merchant_id=m and sandbox) then raise exception 'sandbox_only';end if;
 if jsonb_typeof(rows)<>'array' or jsonb_array_length(rows) not between 1 and 200 then raise exception 'invalid_import';end if;
 for r in select * from jsonb_array_elements(rows) loop
 if length(r->>'sku') not between 1 and 80 or length(r->>'name') not between 1 and 150 or length(r->>'label') not between 1 and 100 or (r->>'price_minor')::bigint not between 0 and 100000000 or (r->>'stock')::integer not between 0 and 100000 then raise exception 'invalid_product';end if;
 insert into public.flowpi_products(merchant_id,sku,name,price_minor,stock,verified_at) values(m,r->>'sku',r->>'name',(r->>'price_minor')::bigint,(r->>'stock')::integer,now()) returning id into p;
 insert into public.flowpi_variants(merchant_id,product_id,sku,label,price_minor) values(m,p,r->>'sku',r->>'label',(r->>'price_minor')::bigint) returning id into v;
 insert into public.flowpi_inventory(merchant_id,variant_id,available) values(m,v,(r->>'stock')::integer);cnt=cnt+1;
 end loop;
 insert into public.flowpi_audit(merchant_id,actor_id,event_type,entity_id,payload) values(m,auth.uid(),'catalog.imported',m::text,jsonb_build_object('rows',cnt));
 return cnt;end $$;
revoke all on function public.flowpi_import_catalog(uuid,jsonb) from public,anon;
grant execute on function public.flowpi_import_catalog(uuid,jsonb) to authenticated;
