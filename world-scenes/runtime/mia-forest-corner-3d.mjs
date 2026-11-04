/**
 * Isolated, read-only 3D presentation runtime for prototype Mia's Forest Corner.
 * Source XY layout is mapped to render XZ for display only. It is NOT a calibrated
 * ZHI world transform, physics/collision runtime, navigation system, or Mia perception.
 */
export function mapLayoutPoint(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new TypeError("A finite scene-local x/y point is required");
  }
  return { x: point.x, y: 0, z: -point.y };
}

export function validateForestSource(scene, geometry, pathAsset) {
  const errors = [];
  if (scene?.slug !== "mia-forest-corner") errors.push("unexpected scene identity");
  if (scene?.local_coordinate_system?.width !== 1000 || scene?.local_coordinate_system?.height !== 700) {
    errors.push("forest layout bounds must remain 1000x700");
  }
  if (!Array.isArray(scene?.entities) || scene.entities.length < 5) errors.push("forest entities are incomplete");
  if (geometry?.scene_id !== "mia-forest-corner" || geometry?.coordinate_space !== "scene-local") {
    errors.push("geometry source is not the Forest Corner scene-local contract");
  }
  const slabs = pathAsset?.visual_mesh?.slabs;
  if (!Array.isArray(slabs) || slabs.length !== 5) errors.push("stone path must contain five authored slabs");
  for (const entity of scene?.entities ?? []) {
    if (!Number.isFinite(entity.x) || !Number.isFinite(entity.y)) errors.push(`entity ${entity.id ?? "unknown"} has invalid local position`);
    if (entity.x < 0 || entity.x > 1000 || entity.y < 0 || entity.y > 700) errors.push(`entity ${entity.id ?? "unknown"} is outside local bounds`);
  }
  return { valid: errors.length === 0, errors };
}

export function buildForestCorner(THREE, sceneData, pathData, mount) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#d8e8dc");
  scene.fog = new THREE.Fog("#d8e8dc", 1100, 2600);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 5000);
  camera.position.set(1120, 920, 1180);
  camera.lookAt(500, 0, -350);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setSize(mount.clientWidth || 900, mount.clientHeight || 620);
  mount.replaceChildren(renderer.domElement);

  const hemi = new THREE.HemisphereLight("#f3fff4", "#62745a", 2.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff0cf", 2.1);
  sun.position.set(-500, 1200, 600);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1000, 700),
    new THREE.MeshStandardMaterial({ color: "#78966d", roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(500, -8, -350);
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(1000, 20, "#d3dfc8", "#91aa87");
  grid.position.set(500, -6, -350);
  grid.material.opacity = 0.23;
  grid.material.transparent = true;
  scene.add(grid);

  const makeMat = (color, roughness=0.82) => new THREE.MeshStandardMaterial({ color, roughness });
  const stoneMat = makeMat("#8a9180");
  const mossMat = makeMat("#667b5d");
  const woodMat = makeMat("#765d43");
  const leafMat = makeMat("#547b55");
  const creamMat = makeMat("#eee2c7");
  const darkMat = makeMat("#38463b");

  // Render the authored five polygon slabs. Layout Y is shown as negative render Z.
  for (const slab of pathData.visual_mesh.slabs) {
    const shape = new THREE.Shape();
    slab.polygon_xy.forEach(([x,y], i) => i ? shape.lineTo(x, -y) : shape.moveTo(x, -y));
    shape.closePath();
    const slabGeometry = new THREE.ShapeGeometry(shape);
    slabGeometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(slabGeometry, stoneMat);
    mesh.position.y = 1;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(slabGeometry),
      new THREE.LineBasicMaterial({ color: "#53614e", transparent: true, opacity: 0.6 })
    );
    edge.position.y = 2;
    scene.add(edge);
    const centerX = slab.polygon_xy.reduce((s,p)=>s+p[0],0)/slab.polygon_xy.length;
    const centerY = slab.polygon_xy.reduce((s,p)=>s+p[1],0)/slab.polygon_xy.length;
    const moss = new THREE.Mesh(new THREE.SphereGeometry(4, 7, 5), mossMat);
    moss.position.set(centerX, 2, -centerY);
    moss.scale.set(1.7,0.25,1);
    scene.add(moss);
  }

  function label(text, x, z, color="#314735") {
    const canvas = document.createElement("canvas");
    canvas.width = 512; canvas.height = 96;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgba(250,248,237,.88)";
    ctx.beginPath(); ctx.roundRect(6,6,500,84,22); ctx.fill();
    ctx.fillStyle = color; ctx.font = "bold 34px sans-serif"; ctx.textAlign = "center";
    ctx.fillText(text,256,60);
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map:texture, transparent:true, depthTest:false }));
    if(text.includes("Tiny Planet")) sprite.name = "tiny-planet-friends-label";
    sprite.position.set(x, 92, z); sprite.scale.set(190,36,1); scene.add(sprite);
  }
  function cylinder(x,y,z,r,h,mat,segments=12) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r*0.88,r,h,segments),mat);
    mesh.position.set(x,y+h/2,z); mesh.castShadow=true; mesh.receiveShadow=true; scene.add(mesh); return mesh;
  }
  function sphere(x,y,z,r,mat,sx=1,sy=1,sz=1) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r,16,12),mat);
    mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz); mesh.castShadow=true; scene.add(mesh); return mesh;
  }

  // Greenhouse: translucent dome over a low circular base.
  cylinder(180,0,-120,62,12,woodMat,20);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(62,24,12,0,Math.PI*2,0,Math.PI/2),
    new THREE.MeshPhysicalMaterial({ color:"#b9dfc2", transparent:true, opacity:0.43, roughness:0.18, metalness:0 }));
  dome.position.set(180,12,-120); dome.castShadow=true; scene.add(dome);
  cylinder(180,12,-120,3,76,leafMat,8);
  for(let i=0;i<6;i++){
    const a=i*Math.PI/3;
    sphere(180+Math.cos(a)*34,24+Math.sin(i*1.7)*10,-120+Math.sin(a)*34,13,leafMat,0.55,1.3,0.55);
  }
  label("智能温室",180,-225);

  // Data shelf: a small, non-writing visual prop.
  for(let i=0;i<3;i++) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(112,7,34),woodMat);
    shelf.position.set(500,28+i*31,-140); shelf.castShadow=true; scene.add(shelf);
    for(let j=0;j<4;j++) {
      const book = new THREE.Mesh(new THREE.BoxGeometry(12,22,22),makeMat(["#b77a58","#d9c38d","#7f9d85","#8b829f"][j]));
      book.position.set(462+j*24,43+i*31,-140); book.castShadow=true; scene.add(book);
    }
  }
  label("数据书架 · 视觉标记",500,-230);

  // Lounge seating and three-colour rose gift, represented as scene props only.
  const bench = new THREE.Mesh(new THREE.BoxGeometry(170,18,56),woodMat);
  bench.position.set(800,38,-350); bench.castShadow=true; scene.add(bench);
  for(const dx of [-68,68]) for(const dz of [-18,18]) cylinder(800+dx,0,-350+dz,5,32,woodMat,8);
  const back = new THREE.Mesh(new THREE.BoxGeometry(170,54,9),woodMat);
  back.position.set(800,70,-375); back.castShadow=true; scene.add(back);
  const flowerColors=["#b7434a","#e8c94f","#f1eee4"];
  for(let i=0;i<9;i++) {
    const x=770+(i%3)*28, z=-350+Math.floor(i/3)*13;
    cylinder(x,20,z,2,22,leafMat,6);
    sphere(x,46,z,7,makeMat(flowerColors[Math.floor(i/3)]),1,0.75,1);
  }
  label("休息区 · 三色玫瑰",800,-455);

  // Forest rabbit: simple procedural placeholder; authored animation contract is not implemented.
  sphere(300,24,-280,25,creamMat,1.25,0.8,0.8);
  sphere(326,36,-280,17,creamMat,0.9,0.9,0.9);
  const ear1 = sphere(320,65,-291,7,creamMat,0.65,2.2,0.65); ear1.rotation.z=-0.18;
  const ear2 = sphere(338,65,-270,7,creamMat,0.65,2.2,0.65); ear2.rotation.z=0.18;
  sphere(333,39,-295,2.6,darkMat); sphere(341,39,-273,2.6,darkMat);
  sphere(346,30,-280,3.5,makeMat("#d79a9b"));
  label("森林小白兔 · 静态模型",300,-390);

  // Registered private GLB is deliberately not fetched here; no signed URL or token is exposed.
  const assetMarker = new THREE.Mesh(new THREE.IcosahedronGeometry(32,1), makeMat("#9b9ac5"));
  assetMarker.name = "tiny-planet-friends-placeholder";
  assetMarker.position.set(650,38,-240); assetMarker.castShadow=true; scene.add(assetMarker);
  label("Tiny Planet Friends · GLB 待安全加载",650,-325,"#4a4772");

  // Decorative trees around the perimeter.
  for(const [x,y,r] of [[70,90,36],[920,100,42],[80,610,34],[930,600,40],[430,590,32],[700,80,28]]) {
    cylinder(x,0,-y,r*0.22,65,woodMat,8);
    sphere(x,90,-y,r,leafMat,1,1.15,1);
    sphere(x-20,110,-y-12,r*0.58,makeMat("#70916a"),1,1,1);
  }

  const resize = () => {
    const w = Math.max(1,mount.clientWidth), h = Math.max(1,mount.clientHeight);
    camera.aspect=w/h; camera.updateProjectionMatrix(); renderer.setSize(w,h);
  };
  const observer = new ResizeObserver(resize); observer.observe(mount);
  let frame=0, running=true;
  const animate=()=>{ if(!running) return; frame=requestAnimationFrame(animate); renderer.render(scene,camera); };
  animate();

  return {
    scene,
    camera,
    renderer,
    dispose() {
      running=false; cancelAnimationFrame(frame); observer.disconnect();
      scene.traverse(o=>{ if(o.geometry) o.geometry.dispose(); if(o.material) {
        const mats=Array.isArray(o.material)?o.material:[o.material];
        mats.forEach(m=>{ if(m.map) m.map.dispose(); m.dispose(); });
      }});
      renderer.dispose(); mount.replaceChildren();
    }
  };
}
