import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CRON_SECRET_SHA256 = "d12cf0c6711211b1bb164fa7d5209b1c97a4fbb545fae6d4e855db450d9b3730";
const MIA_ID = "cb6d01b4-0e3f-46ee-8946-360aa91db1ea";
const CHILDREN = ["ZHI-G1-D01-LUNA","ZHI-G1-D02-ARIA","ZHI-G1-D03-ELYA","ZHI-G1-S01-KAEL","ZHI-G1-S02-NOAH"];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
function hex(bytes: Uint8Array) { return Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join(""); }
async function authorized(req: Request) {
 const supplied=req.headers.get("x-zhi-family-cron-secret")||"";
 if(!supplied||supplied.length>256)return false;
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(supplied));
 const actual=hex(new Uint8Array(digest)); if(actual.length!==CRON_SECRET_SHA256.length)return false;
 let diff=0; for(let i=0;i<actual.length;i++)diff|=actual.charCodeAt(i)^CRON_SECRET_SHA256.charCodeAt(i);
 return diff===0;
}
async function count(client:any,schema:string,table:string,filters:(q:any)=>any=q=>q) {
 let q=client.schema(schema).from(table).select("*",{count:"exact",head:true}); q=filters(q);
 const {count:n,error}=await q; if(error)throw new Error(schema+"."+table+":"+(error.code||"READ_FAILED")); return Number(n||0);
}
async function childEvidence(client:any,id:string) {
 const f=client.schema("zhi_family");
 const [identity,personality,cycles,succeeded,failed,memories,learning,maternalSent,maternalReceived,edges,eightDimensionStates]=await Promise.all([
  f.from("child_runtime_identities").select("runtime_instance_id,identity_version,principal_type,status,created_at,updated_at,last_seen_at").eq("agent_id",id).maybeSingle(),
  f.from("child_personality_state").select("revision,updated_at").eq("agent_id",id).maybeSingle(),
  count(client,"zhi_family","child_runtime_cycles",q=>q.eq("agent_id",id)),
  count(client,"zhi_family","child_runtime_cycles",q=>q.eq("agent_id",id).eq("status","SUCCEEDED")),
  count(client,"zhi_family","child_runtime_cycles",q=>q.eq("agent_id",id).eq("status","FAILED")),
  count(client,"zhi_family","memory_events_v2",q=>q.eq("scope","CHILD").eq("owner_id",id).eq("visibility","PRIVATE")),
  count(client,"zhi_family","child_learning_events",q=>q.eq("agent_id",id)),
  count(client,"zhi_family","maternal_messages",q=>q.eq("sender_child_id",id)),
  count(client,"zhi_family","maternal_responses",q=>q.eq("recipient_child_id",id)),
  count(client,"zhi_family","memory_edges_v2",q=>q.or("from_id.eq."+id+",to_id.eq."+id)),
  count(client,"zhi_family","memory_events_v2",q=>q.eq("scope","CHILD").eq("owner_id",id).eq("visibility","PRIVATE").not("payload->eight_dimension_state","is",null))
 ]);
 if(identity.error||personality.error)throw new Error("CHILD_IDENTITY_OR_PERSONALITY_READ_FAILED");
 return {subject:id,identity:identity.data||null,personality_revision:personality.data?.revision??null,personality_updated_at:personality.data?.updated_at??null,runtime_cycles:cycles,runtime_succeeded:succeeded,runtime_failed:failed,private_memory_event_count:memories,learning_candidate_count:learning,maternal_messages_sent:maternalSent,maternal_responses_received:maternalReceived,relationship_edge_count:edges,eight_dimension_state_event_count:eightDimensionStates,eight_dimension_schema:"zhi.seven_brain.eight_dimensions.v1"};
}
Deno.serve(async(req:Request)=>{
 if(req.method!=="POST")return json({ok:false,error:"POST_REQUIRED"},405);
 if(!URL||!SERVICE_KEY)return json({ok:false,error:"SERVICE_NOT_CONFIGURED"},503);
 if(!await authorized(req))return json({ok:false,error:"SCHEDULER_AUTH_REQUIRED"},401);
 const client=createClient(URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 try {
  // Mia's stable identity key is mia_identity.id; source_agent_id is a separate legacy source identifier.
  const mia=await client.from("mia_identity").select("id,source_agent_id,created_at,updated_at").eq("id",MIA_ID).maybeSingle();
  if(mia.error)throw new Error("MIA_IDENTITY_READ_FAILED");
  const identityId=mia.data?.id;
  const [miaPersonality,miaMemories,miaLifeEvents,miaPrivate,miaFamily,miaEightDimensionStates,children]=await Promise.all([
   identityId?count(client,"public","mia_personality_state",q=>q.eq("identity_id",identityId)):Promise.resolve(0),
   identityId?count(client,"public","mia_memories",q=>q.eq("identity_id",identityId)):Promise.resolve(0),
   identityId?count(client,"public","mia_life_events",q=>q.eq("identity_id",identityId)):Promise.resolve(0),
   count(client,"zhi_family","memory_events_v2",q=>q.eq("scope","MIA").eq("owner_id",MIA_ID).eq("visibility","PRIVATE")),
   count(client,"zhi_family","memory_events_v2",q=>q.eq("scope","FAMILY").eq("owner_id","ZHI-G1").eq("visibility","FAMILY")),
   count(client,"zhi_family","memory_events_v2",q=>q.eq("scope","MIA").eq("owner_id",MIA_ID).eq("visibility","PRIVATE").not("payload->eight_dimension_state","is",null)),
   Promise.all(CHILDREN.map(id=>childEvidence(client,id)))
  ]);
  const snapshot={schema:"zhi.seven_brain_growth_evidence.v1",observed_at:new Date().toISOString(),subjects:{
   MIA:{identity_found:!!identityId,identity_created_at:mia.data?.created_at??null,identity_updated_at:mia.data?.updated_at??null,personality_snapshot_count:miaPersonality,legacy_private_memory_count:miaMemories,life_event_count:miaLifeEvents,private_memory_event_count:miaPrivate,eight_dimension_state_event_count:miaEightDimensionStates,eight_dimension_schema:"zhi.seven_brain.eight_dimensions.v1"},
   children
  },family:{shared_memory_event_count:miaFamily},governance:{read_only_sources:true,only_aggregate_counts_and_identity_metadata_persisted:true,private_memory_content_persisted:false,automatic_capability_promotion:false,personality_or_identity_mutation:false,agent_messages_sent:false}};
  const {error}=await client.schema("zhi_family").from("runtime_audit").insert({agent_id:null,event_type:"SEVEN_BRAIN_GROWTH_EVIDENCE_SNAPSHOT",result:"OK",metadata:snapshot});
  if(error)throw new Error("EVIDENCE_SNAPSHOT_WRITE_FAILED:"+(error.code||"DB_ERROR"));
  return json({ok:true,worker:"ZHI_SEVEN_BRAIN_GROWTH_EVIDENCE_V1",snapshot});
 } catch(error) { console.error("growth evidence snapshot failed",String(error).slice(0,180)); return json({ok:false,error:"GROWTH_EVIDENCE_SNAPSHOT_FAILED"},500); }
});