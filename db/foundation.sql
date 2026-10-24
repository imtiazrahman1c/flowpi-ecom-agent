-- Dedicated development project only. Backend service_role access; no browser access.
create table public.flowpi_merchants(id uuid primary key default gen_random_uuid(),name text not null,enabled boolean not null default false);
create table public.flowpi_products(id uuid primary key default gen_random_uuid(),merchant_id uuid not null references public.flowpi_merchants(id),sku text not null,name text not null,aliases text[] not null default '{}',price_minor bigint not null check(price_minor>=0),currency text not null default 'BDT' check(currency='BDT'),stock integer not null check(stock>=0),verified_at timestamptz not null,active boolean not null default true,unique(merchant_id,sku));
create index on public.flowpi_products(merchant_id);
create table public.flowpi_policies(id uuid primary key default gen_random_uuid(),merchant_id uuid not null references public.flowpi_merchants(id),keywords text[] not null,content text not null,approved boolean not null default false);
create index on public.flowpi_policies(merchant_id);
create table public.flowpi_conversations(merchant_id uuid not null references public.flowpi_merchants(id),channel text not null,customer_id text not null,human_owned boolean not null default false,processing_event text,primary key(merchant_id,channel,customer_id));
create table public.flowpi_events(merchant_id uuid not null,channel text not null,customer_id text not null,event_id text not null,status text not null check(status in ('processing','complete','failed')),primary key(merchant_id,channel,event_id),foreign key(merchant_id,channel,customer_id) references public.flowpi_conversations);
create index on public.flowpi_events(merchant_id,channel,customer_id);
create table public.flowpi_messages(id bigint generated always as identity primary key,merchant_id uuid not null,channel text not null,customer_id text not null,event_id text not null,role text not null check(role in ('user','assistant')),content text not null,created_at timestamptz not null default now(),foreign key(merchant_id,channel,customer_id) references public.flowpi_conversations,unique(merchant_id,channel,event_id,role));
create index on public.flowpi_messages(merchant_id,channel,customer_id,id);
create table public.flowpi_handoffs(id uuid primary key default gen_random_uuid(),merchant_id uuid not null,channel text not null,customer_id text not null,event_id text not null,reason text not null,created_at timestamptz not null default now(),foreign key(merchant_id,channel,customer_id) references public.flowpi_conversations);
create index on public.flowpi_handoffs(merchant_id,channel,customer_id);
create table public.flowpi_drafts(id uuid primary key default gen_random_uuid(),merchant_id uuid not null,channel text not null,event_id text not null,result jsonb not null,created_at timestamptz not null default now(),unique(merchant_id,channel,event_id),foreign key(merchant_id,channel,event_id) references public.flowpi_events);

create function public.flowpi_begin(m uuid,c text,u text,e text,t text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cv public.flowpi_conversations; ev public.flowpi_events; hist jsonb;
begin
 if not exists(select 1 from public.flowpi_merchants where id=m and enabled) then raise exception 'merchant_disabled'; end if;
 insert into public.flowpi_conversations(merchant_id,channel,customer_id) values(m,c,u) on conflict do nothing;
 select * into cv from public.flowpi_conversations where merchant_id=m and channel=c and customer_id=u for update;
 select * into ev from public.flowpi_events where merchant_id=m and channel=c and event_id=e;
 if found and ev.customer_id<>u then raise exception 'event_identity_conflict'; end if;
 if ev.status='complete' then return jsonb_build_object('status','duplicate');end if;
 if cv.processing_event is not null then return jsonb_build_object('status','busy');end if;
 insert into public.flowpi_events values(m,c,u,e,'processing') on conflict(merchant_id,channel,event_id) do update set status='processing';
 insert into public.flowpi_messages(merchant_id,channel,customer_id,event_id,role,content) values(m,c,u,e,'user',t) on conflict do nothing;
 if cv.human_owned then update public.flowpi_events set status='complete' where merchant_id=m and channel=c and event_id=e;return jsonb_build_object('status','human');end if;
 update public.flowpi_conversations set processing_event=e where merchant_id=m and channel=c and customer_id=u;
 select coalesce(jsonb_agg(x order by x.id),'[]'::jsonb) into hist from(select id,role,content from public.flowpi_messages where merchant_id=m and channel=c and customer_id=u and event_id<>e order by id desc limit 12)x;
 return jsonb_build_object('status','claimed','history',hist);
end $$;
create function public.flowpi_search(m uuid,q text) returns setof public.flowpi_products language sql security invoker set search_path='' as $$
 select * from public.flowpi_products where merchant_id=m and active and length(trim(q))>0 and (strpos(lower(name),lower(q))>0 or lower(sku)=lower(q) or exists(select 1 from unnest(aliases) a where strpos(lower(a),lower(q))>0)) order by sku limit 5;
$$;
create function public.flowpi_verify(m uuid,p uuid) returns setof public.flowpi_products language sql security invoker set search_path='' as $$select * from public.flowpi_products where merchant_id=m and id=p and active;$$;
create function public.flowpi_policies(m uuid,q text) returns setof public.flowpi_policies language sql security invoker set search_path='' as $$select * from public.flowpi_policies where merchant_id=m and approved and length(trim(q))>0 and exists(select 1 from unnest(keywords) k where lower(k)=lower(q)) limit 3;$$;
create function public.flowpi_handoff(m uuid,c text,u text,e text,reason text) returns jsonb language plpgsql security invoker set search_path='' as $$begin
 update public.flowpi_conversations set human_owned=true where merchant_id=m and channel=c and customer_id=u and processing_event=e;
 if not found then raise exception 'event_not_owned';end if;
 insert into public.flowpi_handoffs(merchant_id,channel,customer_id,event_id,reason) values(m,c,u,e,reason);
 return '{"status":"handoff"}';end $$;
create function public.flowpi_finish(m uuid,c text,u text,e text,result jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare cv public.flowpi_conversations; begin
 select * into cv from public.flowpi_conversations where merchant_id=m and channel=c and customer_id=u for update;
 if cv.processing_event is distinct from e then raise exception 'event_not_owned';end if;
 if cv.human_owned then result=jsonb_build_object('status','suppressed');
 else
 insert into public.flowpi_messages(merchant_id,channel,customer_id,event_id,role,content) values(m,c,u,e,'assistant',result->>'reply');
 end if;
 insert into public.flowpi_drafts(merchant_id,channel,event_id,result) values(m,c,e,result);
 update public.flowpi_events set status='complete' where merchant_id=m and channel=c and event_id=e;
 update public.flowpi_conversations set processing_event=null where merchant_id=m and channel=c and customer_id=u;
 return result;
end $$;
create function public.flowpi_fail(m uuid,c text,u text,e text) returns jsonb language plpgsql security invoker set search_path='' as $$begin
 update public.flowpi_conversations set processing_event=null where merchant_id=m and channel=c and customer_id=u and processing_event=e;
 if found then update public.flowpi_events set status='failed' where merchant_id=m and channel=c and event_id=e;end if;
 return '{"status":"failed"}';end $$;

-- Explicit grants for the current Data API defaults. No user-facing policies yet.
do $$declare t text;begin
 foreach t in array array['flowpi_merchants','flowpi_products','flowpi_policies','flowpi_conversations','flowpi_events','flowpi_messages','flowpi_handoffs','flowpi_drafts'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
revoke all on all functions in schema public from public,anon,authenticated;
grant execute on all functions in schema public to service_role;
grant usage,select on all sequences in schema public to service_role;
