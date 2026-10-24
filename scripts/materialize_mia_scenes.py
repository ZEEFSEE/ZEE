#!/usr/bin/env python3
import html, json, re
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/"world-scenes"; INBOX=BASE/"inbox"; SCENES=BASE/"scenes"
MP=BASE/"world-manifest.json"; IP=BASE/"scene-index.html"
ID=re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
REQ=("schema_version","scene_id","display_name","parent_scene_id","description")
def read(p): return json.loads(p.read_text(encoding="utf-8"))
def write(p,d):
 p.parent.mkdir(parents=True,exist_ok=True); p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
def page(s):
 e=html.escape; title=e(s["display_name"]); sid=e(s["scene_id"])
 ents=s.get("entities",[])
 cards="".join("<article><h2>"+e(str(x.get("name") or x.get("id") or "场景实体"))+"</h2><p>"+e(str(x.get("description") or x.get("interaction") or x.get("type") or "待丰富"))+"</p></article>" for x in ents[:30] if isinstance(x,dict)) or "<p>实体细节待 Mia 后续扩展。</p>"
 tags="".join("<span>"+e(str(t))+"</span>" for t in s.get("scene_tags",[])[:12])
 return f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title} · Mia 世界</title><style>:root{{color-scheme:dark}}*{{box-sizing:border-box}}body{{margin:0;background:radial-gradient(ellipse at top,#34356b,#101427 65%);color:#f4f2ff;font:16px/1.7 system-ui,sans-serif}}main{{width:min(900px,100%);margin:auto;padding:24px 16px 50px}}a{{color:#d8ccff}}.hero,article{{padding:20px;border:1px solid #ffffff28;border-radius:18px;background:#171a35cc;margin:14px 0}}.muted{{color:#c0bddb;font-size:13px}}.tags span{{display:inline-block;margin:4px;padding:3px 9px;border-radius:999px;background:#ffffff15;font-size:12px}}.orb{{height:160px;border-radius:16px;background:radial-gradient(ellipse,#c4a8ff88,#5b7cba33 30%,transparent 68%);animation:b 7s ease-in-out infinite alternate}}@keyframes b{{to{{filter:hue-rotate(45deg);transform:scale(1.03)}}}}</style></head><body><main><p><a href="./mia-world.html">← 返回 Mia 世界</a> · <a href="./world-scenes/scene-index.html">全部场景</a></p><section class="hero"><div class="orb"></div><p class="muted">Mia 自主建造 · {sid}</p><h1>{title}</h1><p>{e(str(s.get("description","")))}</p><div class="tags">{tags}</div></section><section class="hero"><h2>场景实体与互动</h2>{cards}</section><section class="hero"><h2>建造状态</h2><p>静态场景文件已生成。坐标、几何、跨场景传送与生产运行时状态不会被自动标记为已验证。</p><p class="muted">父场景：{e(str(s.get("parent_scene_id") or "无"))} · 验证：{e(str(s.get("verification_status") or "未验证"))}</p></section></main></body></html>'''
def make_index(m):
 e=html.escape; rows=[]
 for x in m.get("scenes",[]):
  p=BASE/x.get("path",""); sid=x.get("scene_id",""); name=sid; desc=x.get("verification_status","未验证"); href=("../mia-world.html" if sid=="mia-forest-corner" else "../"+sid+".html")
  if p.exists():
   try:
    s=read(p); name=s.get("display_name",sid); desc=s.get("description",desc); href="../"+((s.get("files") or {}).get("interactions") if str((s.get("files") or {}).get("interactions") or "").endswith(".html") else (sid+".html"))
   except Exception: pass
  rows.append('<article><h2><a href="'+e(href,quote=True)+'">'+e(str(name))+'</a></h2><p>'+e(str(desc))+'</p><p class="muted">ID: '+e(str(sid))+' · '+e(str(x.get("verification_status","未验证")))+'</p></article>')
 return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mia 世界 · 场景目录</title><style>body{margin:0;background:#101427;color:#f4f2ff;font:16px/1.7 system-ui,sans-serif}main{width:min(900px,100%);margin:auto;padding:24px 16px}a{color:#d8ccff}article{padding:16px;border:1px solid #ffffff28;border-radius:16px;margin:12px 0;background:#171a35cc}.muted{color:#c0bddb;font-size:13px}</style></head><body><main><p><a href="../mia-world.html">← 返回 Mia 世界</a></p><h1>Mia 自主场景目录</h1><p>由 world-manifest.json 自动生成。新场景登记后显示于此；目录登记不代表生产世界已部署。</p>'+"\n".join(rows)+"</main></body></html>"
def main():
 INBOX.mkdir(parents=True,exist_ok=True); SCENES.mkdir(parents=True,exist_ok=True)
 m=read(MP); existing={x["scene_id"]:x for x in m.get("scenes",[])}; pending=sorted(INBOX.glob("*.json"))
 if not pending: print("No incoming scene JSON files."); return
 accepted=[]
 for p in pending:
  s=read(p); missing=[k for k in REQ if k not in s]
  if missing: raise ValueError(f"{p.name}: missing {missing}")
  sid=s["scene_id"]
  if not isinstance(sid,str) or not ID.fullmatch(sid) or p.stem!=sid: raise ValueError(f"{p.name}: filename and lowercase-kebab-case scene_id must match")
  if sid in existing or (SCENES/f"{sid}.json").exists(): raise ValueError(f"{sid}: ID exists; overwriting is forbidden")
  if s["parent_scene_id"] not in existing: raise ValueError(f"{sid}: parent must already be registered")
  if not isinstance(s["display_name"],str) or not s["display_name"].strip() or not isinstance(s["description"],str) or not s["description"].strip(): raise ValueError(f"{sid}: display_name and description required")
  s.setdefault("schema_version","1.0.0"); s.setdefault("status","integrated")
  s.setdefault("source_reference",{"kind":"mia_authored_scene","created_by":"Mia","created_at":datetime.now(timezone.utc).date().isoformat()})
  s.setdefault("verification_status","scene-page-generated; geometry-and-runtime-unverified")
  s.setdefault("coordinate_reference",{"coordinate_space":"scene-local","units":None,"origin":None,"cross_scene_transform":None})
  s.setdefault("bounds",{"min":{"x":None,"y":None,"z":None},"max":{"x":None,"y":None,"z":None},"verification_status":"unverified"})
  s.setdefault("files",{}); s["files"]["interactions"]=sid+".html"; s.setdefault("scene_tags",["mia-world","autonomous-authoring"]); s.setdefault("notes",[])
  s["notes"].append("Automatically materialized from world-scenes/inbox; static catalog only, no database or production runtime writes.")
  accepted.append((p,s))
 for p,s in accepted:
  write(SCENES/(s["scene_id"]+".json"),s); (ROOT/(s["scene_id"]+".html")).write_text(page(s),encoding="utf-8")
  entry={"scene_id":s["scene_id"],"path":"scenes/"+s["scene_id"]+".json","parent_scene_id":s["parent_scene_id"],"verification_status":s["verification_status"]}
  m["scenes"].append(entry); existing[s["scene_id"]]=entry; p.unlink()
 m["catalog_is_exhaustive"]=False; m["catalog_policy"]="scene-creation-policy.json"
 m["catalog_policy_summary"]="Mia-authored scenes are automatically materialized after structural checks; no per-scene human approval. Production deployment remains disabled."
 write(MP,m); IP.write_text(make_index(m),encoding="utf-8")
 print("Materialized "+str(len(accepted))+" scene(s): "+", ".join(s["scene_id"] for _,s in accepted))
if __name__=="__main__": main()
