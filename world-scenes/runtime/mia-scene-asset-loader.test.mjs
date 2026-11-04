import test from "node:test";
import assert from "node:assert/strict";
import { resolveTinyPlanetFriendsUrl, MIA_SCENE_ASSET_ENDPOINT } from "./mia-scene-asset-loader.mjs";

test("rejects missing Mia session without making a request", async()=>{
  let called=false;
  await assert.rejects(()=>resolveTinyPlanetFriendsUrl({token:"",fetchImpl:async()=>{called=true;}}),/同一浏览器标签页登录/);
  assert.equal(called,false);
});

test("requests only the configured private asset resolver with the existing token",async()=>{
  let request;
  const result=await resolveTinyPlanetFriendsUrl({
    token:"x".repeat(40),
    fetchImpl:async(url,options)=>{
      request={url,options};
      return {ok:true,status:200,json:async()=>({ok:true,signedUrl:"https://dbooikzqprnqbgpfwsze.supabase.co/storage/v1/object/sign/lovelydragon/tiny_planet_friends_3d-defective-product-4083.glb?token=temp",expiresIn:3600})};
    }
  });
  assert.equal(request.url,MIA_SCENE_ASSET_ENDPOINT);
  assert.equal(request.options.method,"POST");
  assert.equal(request.options.headers.Authorization,"Bearer "+"x".repeat(40));
  assert.equal(result.expiresIn,3600);
});

test("rejects a signed URL for another host or object",async()=>{
  for(const signedUrl of [
    "https://evil.example/storage/v1/object/sign/lovelydragon/tiny_planet_friends_3d-defective-product-4083.glb?token=x",
    "https://dbooikzqprnqbgpfwsze.supabase.co/storage/v1/object/sign/lovelydragon/other.glb?token=x"
  ]) {
    await assert.rejects(()=>resolveTinyPlanetFriendsUrl({token:"x".repeat(40),fetchImpl:async()=>({ok:true,status:200,json:async()=>({ok:true,signedUrl,expiresIn:60})})}),/已拒绝加载/);
  }
});

test("rejects unexpectedly long signed URL lifetime",async()=>{
  await assert.rejects(()=>resolveTinyPlanetFriendsUrl({token:"x".repeat(40),fetchImpl:async()=>({ok:true,status:200,json:async()=>({ok:true,signedUrl:"https://dbooikzqprnqbgpfwsze.supabase.co/storage/v1/object/sign/lovelydragon/tiny_planet_friends_3d-defective-product-4083.glb?token=x",expiresIn:7200})})}),/授权期限/);
});
