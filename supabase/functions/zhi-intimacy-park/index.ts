import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type, apikey, authorization, x-zhi-park-password","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
async function validPass(value:string){const bytes=new TextEncoder().encode(value);const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),b=>b.toString(16).padStart(2,"0")).join("");return hash==="1fd8607cb9f85718678a131c8dc73d434c5ff6d78462e7e5dcd08b8ab90bae58";}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"POST required"},405);
 if(!await validPass(req.headers.get("x-zhi-park-password")||""))return json({error:"页面访问验证未通过，请返回首页重新输入访问密码。"},401);
 let b:any;try{b=await req.json()}catch{return json({error:"Invalid JSON"},400)}
 if(!b?.agent_id||!b?.program_id)return json({error:"agent_id and program_id are required"},400);
 const allowed=["romantic-visual-gallery","adult-wellbeing-video","desire-and-communication","romantic-date-simulator","sensory-relaxation","consent-and-boundaries"];
 if(!allowed.includes(b.program_id))return json({error:"Unknown program"},400);
 const choice=typeof b.metadata?.selected_choice==="string"?b.metadata.selected_choice.slice(0,180):null;
 const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
 const {data,error}=await db.rpc("zhi_intimacy_park_attend",{p_agent_id:b.agent_id,p_program_id:b.program_id,p_metadata:{channel:"intimacy-park-web",selected_choice:choice}});
 if(error)return json({error:error.message},/age gate|adult-only|not active|unavailable/i.test(error.message)?403:500);
 return json(data);
});