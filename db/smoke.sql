begin;
do $$
declare m uuid; other uuid; p uuid; r jsonb; n integer;
begin
 insert into public.flowpi_merchants(name,enabled) values('SYNTHETIC TEST',true) returning id into m;
 insert into public.flowpi_merchants(name) values('OTHER TENANT') returning id into other;
 insert into public.flowpi_products(merchant_id,sku,name,aliases,price_minor,stock,verified_at) values(m,'TS-BLK-M','Black T-shirt',array['কালো টি শার্ট','kalo t shirt'],125000,3,now()) returning id into p;
 select count(*) into n from public.flowpi_search(m,'কালো টি শার্ট');if n<>1 then raise exception 'Bangla search failed';end if;
 select count(*) into n from public.flowpi_search(m,'kalo t shirt');if n<>1 then raise exception 'Banglish search failed';end if;
 select count(*) into n from public.flowpi_verify(other,p);if n<>0 then raise exception 'tenant leak';end if;
 r=public.flowpi_begin(m,'website','synthetic','1','price?');if r->>'status'<>'claimed' then raise exception 'claim failed';end if;
 r=public.flowpi_begin(m,'website','synthetic','2','another');if r->>'status'<>'busy' then raise exception 'serialization failed';end if;
 r=public.flowpi_finish(m,'website','synthetic','1','{"status":"answered","reply":"fixture"}');
 r=public.flowpi_begin(m,'website','synthetic','1','price?');if r->>'status'<>'duplicate' then raise exception 'dedup failed';end if;
 r=public.flowpi_begin(m,'website','synthetic','2','help');
 perform public.flowpi_handoff(m,'website','synthetic','2','test');
 r=public.flowpi_finish(m,'website','synthetic','2','{"status":"answered","reply":"do not send"}');if r->>'status'<>'suppressed' then raise exception 'human takeover failed';end if;
 r=public.flowpi_begin(m,'website','synthetic','3','new');if r->>'status'<>'human' then raise exception 'human lock failed';end if;
 if has_table_privilege('anon','public.flowpi_products','SELECT') then raise exception 'anon table access';end if;
 if has_function_privilege('authenticated','public.flowpi_begin(uuid,text,text,text,text)','EXECUTE') then raise exception 'public RPC access';end if;
end $$;
select 'PASS: multilingual alias search, tenant isolation, serialization, deduplication, takeover, private ACLs; all fixtures rolled back' as result;
rollback;
