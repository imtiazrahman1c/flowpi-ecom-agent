import {timingSafeEqual} from 'node:crypto';
import {processEvent,SafeError} from '../src/w01.mjs';
import {createStore} from '../src/store.mjs';
import {createPlanner} from '../src/planner.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
 const token=process.env.FLOWPI_INGRESS_TOKEN,got=req.headers.authorization??'';
 if(!token || token.length<32 || Buffer.byteLength(got)!==Buffer.byteLength(`Bearer ${token}`)||!timingSafeEqual(Buffer.from(got),Buffer.from(`Bearer ${token}`)))return res.status(401).json({error:'unauthorized'});
 if(process.env.FLOWPI_ENABLED!=='true')return res.status(503).json({error:'development_disabled'});
 try{
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  // One credential is scoped to one merchant. Never trust a channel-supplied merchant ID.
  if(!process.env.FLOWPI_MERCHANT_ID||body?.merchant_id!==process.env.FLOWPI_MERCHANT_ID)throw new SafeError('merchant_forbidden',403);
  const out=await processEvent(body,{store:createStore({url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY}),planner:createPlanner({apiKey:process.env.OPENAI_API_KEY,model:process.env.OPENAI_MODEL})});
  return res.status(200).json(out);
 }catch(err){return res.status(err instanceof SafeError?err.status:503).json({error:err instanceof SafeError?err.code:'processing_failed'});}
}
