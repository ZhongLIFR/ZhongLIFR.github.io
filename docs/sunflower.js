import * as THREE from './assets/vendor/three.module.min.js';

const stage = document.querySelector('#sunflower-stage');
const button = document.querySelector('#water-button');
const message = document.querySelector('#garden-message');
const motion = matchMedia('(prefers-reduced-motion: reduce)');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
} catch (error) {
  document.querySelector('#garden-fallback').hidden = false;
  button.disabled = true;
  message.textContent = '3D view unavailable.';
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.domElement.setAttribute('aria-hidden', 'true');
stage.appendChild(renderer.domElement);
stage.dataset.renderer = 'webgl';
stage.dataset.model = 'plush-twins-v7-rabbit-can';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, .1, 30);
camera.position.set(.23, 2.65, 8.0);
camera.lookAt(0, 1.86, 0);
const ambient = new THREE.HemisphereLight(0xffffff, 0xb2a38c, 2.1);
const key = new THREE.DirectionalLight(0xfffbf1, 2.6);
key.position.set(-3, 5, 5);
const fill = new THREE.DirectionalLight(0xeef3ff, 1.05);
fill.position.set(4, 2, 3);
const backlight = new THREE.DirectionalLight(0xffffff, 1.5);
backlight.position.set(1, 4, -2);
scene.add(ambient, key, fill, backlight);
const plant = new THREE.Group();
scene.add(plant);

// All geometry and textile detail are generated locally. The supplied product
// photos guide the silhouette; no photograph is pasted onto the 3D model.
let randomState = 602781;
function random() {
  randomState = (Math.imul(1664525, randomState) + 1013904223) | 0;
  return (randomState >>> 0) / 4294967296;
}
const noiseValues = Float32Array.from({ length: 128 * 128 }, random);
function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const at = (a, b) => noiseValues[((b & 127) * 128) + (a & 127)];
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(ix, iy), at(ix + 1, iy), fx), THREE.MathUtils.lerp(at(ix, iy + 1), at(ix + 1, iy + 1), fx), fy);
}
function textileMaps() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const pixels = ctx.createImageData(512, 512);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const yarn = Math.sin(x * Math.PI / 3 + Math.sin(y * Math.PI / 4)) * 3;
    const pile = noise(x * .6, y * .6), cloud = noise(x * .055, y * .055);
    const shade = 219 + pile * 21 + cloud * 12 + yarn;
    const i = (y * 512 + x) * 4;
    pixels.data.set([shade, shade, shade, 255], i);
  }
  ctx.putImageData(pixels, 0, 0);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const bumpMap = map.clone();
  bumpMap.colorSpace = THREE.NoColorSpace;
  return { map, bumpMap };
}
const textile = textileMaps();
function cloth(color, bumpScale = .0008) {
  return new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, ...textile, bumpScale });
}
const cream = cloth(0xf1eddf, .00015);
const green = cloth(0x48602d);
const leafGreen = cloth(0x5b7637);
// A warm orange palette echoes the publication badges; cream and green keep
// the plush plant soft and recognizable rather than coloring every part alike.
const petalYellow = cloth(0xff850c, .00025);
const petalSeam = cloth(0xffb357, .0002);
const gold = cloth(0xc77b12);
const brown = cloth(0x784318);
const thread = new THREE.MeshStandardMaterial({ color: 0x242321, roughness: .87 });
const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x161816, roughness: .31 });
function mesh(geometry, mat, parent, x = 0, y = 0, z = 0) {
  const item = new THREE.Mesh(geometry, mat);
  item.position.set(x, y, z); parent.add(item); return item;
}
function tube(points, radius, parent, mat = green, segments = 40, sides = 10) {
  return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, sides, false), mat, parent);
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function ellipsoid(rx, ry, rz, mat, parent, x, y, z) {
  const geometry = new THREE.SphereGeometry(1, 48, 32);
  geometry.scale(rx, ry, rz);
  return mesh(geometry, mat, parent, x, y, z);
}

// Sample actual surface triangles by area, then grow short curved fibers.
// Roots are darker than tips. Unlike a noise map, these strands soften the
// silhouette too, and remain three-dimensional when the toy is rotated.
function addFur(target, strands, length, baseColor, opacity = .76, curl = .3) {
  const geometry = target.geometry;
  const p = geometry.attributes.position, n = geometry.attributes.normal;
  const index = geometry.index;
  const total = index ? index.count : p.count;
  const cumulative = [];
  const a = V(0,0,0), b = V(0,0,0), c = V(0,0,0), ab = V(0,0,0), ac = V(0,0,0);
  let area = 0;
  for (let i = 0; i < total; i += 3) {
    a.fromBufferAttribute(p, index ? index.getX(i) : i);
    b.fromBufferAttribute(p, index ? index.getX(i + 1) : i + 1);
    c.fromBufferAttribute(p, index ? index.getX(i + 2) : i + 2);
    area += ab.subVectors(b,a).cross(ac.subVectors(c,a)).length() * .5;
    cumulative.push(area);
  }
  const positions = new Float32Array(strands * 12);
  const colors = new Float32Array(strands * 12);
  const base = new THREE.Color(baseColor);
  const softPile = base.r > .65 && base.g > .65;
  const normal = V(0,0,0), tangent = V(0,0,0), point = V(0,0,0), tmp = V(0,0,0);
  const light = V(-.45,.68,.65).normalize();
  for (let s = 0; s < strands; s++) {
    const targetArea = random() * area;
    let lo = 0, hi = cumulative.length - 1;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (cumulative[mid] < targetArea) lo = mid + 1; else hi = mid; }
    const triangle = lo * 3;
    const ia = index ? index.getX(triangle) : triangle;
    const ib = index ? index.getX(triangle + 1) : triangle + 1;
    const ic = index ? index.getX(triangle + 2) : triangle + 2;
    const r = Math.sqrt(random()), u = 1-r, v = r*(1-random()), w = 1-u-v;
    point.fromBufferAttribute(p,ia).multiplyScalar(u).addScaledVector(tmp.fromBufferAttribute(p,ib),v).addScaledVector(tmp.fromBufferAttribute(p,ic),w);
    normal.fromBufferAttribute(n,ia).multiplyScalar(u).addScaledVector(tmp.fromBufferAttribute(n,ib),v).addScaledVector(tmp.fromBufferAttribute(n,ic),w).normalize();
    tangent.set(random()-.5,random()-.65,random()-.5).projectOnPlane(normal).normalize();
    const fiberLength = length * (.42 + random()*.80);
    const bend = (.25 + random()*.8) * curl;
    const points = [point.clone().addScaledVector(normal,-.001), point.clone().addScaledVector(normal,fiberLength*.55).addScaledVector(tangent,fiberLength*bend*.32), point.clone().addScaledVector(normal,fiberLength*.85).addScaledVector(tangent,fiberLength*bend)];
    const shade = softPile ? .89 + Math.max(0,normal.dot(light))*.065 + random()*.04 : .70 + Math.max(0,normal.dot(light))*.26 + random()*.08;
    let offset = s*12;
    for (let segment = 0; segment < 2; segment++) {
      for (let end = segment; end <= segment+1; end++) {
        positions.set(points[end].toArray(),offset);
        const value = shade * (softPile ? .96 + end*.02 : .82 + end*.09);
        colors.set([base.r*value,base.g*value,base.b*value],offset);
        offset += 3;
      }
    }
  }
  const furGeometry = new THREE.BufferGeometry();
  furGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  furGeometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const fur = new THREE.LineSegments(furGeometry,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity,depthWrite:false}));
  target.add(fur);
  return fur;
}

// A softly rounded, stuffed fabric pot with a padded cuff.
const bodyProfile = [[0,.17],[.28,.17],[.46,.23],[.55,.35],[.59,.58],[.585,.92],[.56,1.13],[.53,1.20],[.43,1.215],[0,1.215]];
const profileCurve = new THREE.CatmullRomCurve3(bodyProfile.map(([r,y])=>V(r,y,0)),false,'centripetal');
const bodyGeometry = new THREE.LatheGeometry(profileCurve.getPoints(96).map(p=>new THREE.Vector2(Math.max(0,p.x),p.y)),96);
bodyGeometry.scale(1,1,.88);
const body = mesh(bodyGeometry,cream,plant);
addFur(body,68000,.048,0xf6f2e4,.78,.65);
const rimGeometry = new THREE.TorusGeometry(.516,.091,24,96);
rimGeometry.rotateX(Math.PI/2);rimGeometry.scale(1,1,.88);
const rim = mesh(rimGeometry,cream,plant,0,1.188,0);
addFur(rim,14500,.058,0xf8f5e9,.8,.8);
const inner = ellipsoid(.458,.030,.382,cloth(0xc4c2a9),plant,0,1.188,0);
addFur(inner,2600,.035,0xe1dfcd,.7);

// Two little corduroy-like feet, forward of the pot.
for (const side of [-1,1]) {
  const foot = ellipsoid(.151,.17,.212,brown,plant,side*.279,.17,.405);
  foot.rotation.y = side*.13;
  addFur(foot,4200,.014,0x9a642d,.8,.3);
  const toeSeam = [];
  for(let i=0;i<=38;i++) {const a=i/38*Math.PI*2;toeSeam.push(V(Math.cos(a)*.131,.17+Math.sin(a)*.146,.532+Math.sin(a)*.019));}
  const seam = tube(toeSeam,.0022,plant,cloth(0x996330),38,5);seam.position.x=side*.279;
}

// Small bead eyes and an embroidered U-shaped smile, as in the references.
for (const side of [-1,1]) {
  ellipsoid(.029,.031,.018,eyeMaterial,plant,side*.172,.674,.540);
  ellipsoid(.006,.006,.003,new THREE.MeshBasicMaterial({color:0xe6e3d5}),plant,side*.172-.006,.684,.557);
}
const smile = [];
for(let i=0;i<=32;i++) {
  const a=Math.PI+(i/32)*Math.PI;
  const x=Math.cos(a)*.125,y=.620+Math.sin(a)*.126;
  smile.push(V(x,y,.565-Math.abs(x)*.045));
}
tube(smile,.0095,plant,thread,40,7);
// Discrete diagonal stitches prevent the mouth from looking painted on.
for(let i=2;i<30;i+=3) {
  const a=smile[i],b=smile[i+1],center=a.clone().lerp(b,.5);
  const across=V(-(b.y-a.y),b.x-a.x,0).normalize().multiplyScalar(.008);
  tube([center.clone().sub(across),center.clone().add(across)],.0021,plant,thread,3,5);
}

const growth = new THREE.Group();growth.position.y=1.19;plant.add(growth);
const stems = [
  [V(.13,-.02,-.025),V(.24,.45,-.035),V(.40,.88,0),V(.48,1.38,.035)],
  [V(-.06,-.025,-.05),V(-.27,.36,-.08),V(-.50,.70,-.07),V(-.66,1.02,-.045)]
];
for (let i=0;i<stems.length;i++) {
  const stem=tube(stems[i],i===0?.099:.089,growth,green,64,16);
  addFur(stem,7500,.018,0x66823d,.76,.4);
  const seamPoints=stems[i].map(p=>p.clone().add(V(.038,0,.084)));
  tube(seamPoints,.0027,growth,cloth(0x6b853f),50,5);
}

// Small padded leaves with a sewn edge and central fold.
function paddedLeaf(length,width) {
  const positions=[],uvs=[],indices=[];
  const rows=36,columns=32;
  for(let i=0;i<=rows;i++) {
    const u=i/rows;
    const section=Math.pow(Math.sin(Math.PI*u),.76)*(1-.20*u);
    for(let j=0;j<=columns;j++) {
      const a=j/columns*Math.PI*2;
      positions.push(Math.cos(a)*width*section,u*length,Math.sin(a)*.056*section+.065*Math.sin(u*Math.PI)-.13*u*u);
      uvs.push(j/columns,u);
    }
  }
  for(let i=0;i<rows;i++)for(let j=0;j<columns;j++) {
    const a=i*(columns+1)+j;
    indices.push(a,a+columns+1,a+1,a+1,a+columns+1,a+columns+2);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
const leaves=[];
function leaf(x,y,z,length,width,turn,tilt,lean) {
  const group=new THREE.Group();group.position.set(x,y,z);group.rotation.set(tilt,turn,lean);growth.add(group);
  const item=mesh(paddedLeaf(length,width),leafGreen,group);
  addFur(item,3100,.016,0x8ba15e,.69,.35);
  const outline=[],vein=[];
  for(let j=0;j<=64;j++) {
    const t=j/64, u=t<=.5?t*2:(1-t)*2, side=t<=.5?-1:1;
    const section=Math.pow(Math.sin(Math.PI*u),.76)*(1-.20*u);
    outline.push(V(side*width*section,u*length,.065*Math.sin(u*Math.PI)-.13*u*u));
  }
  for(let i=0;i<=24;i++){const u=i/24;vein.push(V(0,u*length,.056*Math.pow(Math.sin(Math.PI*u),.76)*(1-.20*u)+.065*Math.sin(u*Math.PI)-.13*u*u+.002));}
  const seamMat=cloth(0x7c9550);
  tube(outline,.0037,group,seamMat,64,5);
  tube(vein,.004,group,seamMat,24,5);
  leaves.push({group,tilt});
}
leaf(.23,.38,.04,.54,.175,.40,.15,-.55);
leaf(-.32,.42,.03,.50,.170,-.45,.3,.77);
leaf(.07,.60,-.12,.61,.18,-.55,-.1,-.25);
leaf(-.40,.68,-.12,.42,.15,.65,-.30,.9);

// Rounded, filled petals have a visible fabric seam. Each is a closed volume.
function petalGeometry(length,width,phase) {
  const rows=34,columns=24,positions=[],uvs=[],indices=[];
  for(let i=0;i<=rows;i++) {
    const u=i/rows;
    const rounded=Math.pow(Math.sin(Math.PI*u),.46);
    const taper=.61+.46*u;
    const r=width*rounded*taper;
    for(let j=0;j<=columns;j++) {
      const a=j/columns*Math.PI*2;
      positions.push(Math.cos(a)*r+.009*Math.sin(u*3+phase)*u,u*length,Math.sin(a)*r*.48+.037*Math.sin(u*Math.PI)-.040*u*u);
      uvs.push(j/columns,u);
    }
  }
  for(let i=0;i<rows;i++)for(let j=0;j<columns;j++) {
    const a=i*(columns+1)+j;indices.push(a,a+columns+1,a+1,a+1,a+columns+1,a+columns+2);
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeVertexNormals();return geo;
}
const flowers=[];
function flower(position,scale,turn,lean,phase) {
  const head=new THREE.Group();head.position.copy(position);head.rotation.set(.02,turn,lean);head.scale.setScalar(scale);growth.add(head);
  const calyx=ellipsoid(.26,.26,.075,green,head,0,0,-.060);
  addFur(calyx,1500,.014,0x748c43,.7);
  const n=11;
  for(let i=0;i<n;i++) {
    const a=i/n*Math.PI*2+(random()-.5)*.034;
    const length=.445+(random()-.5)*.035,width=.119+(random()-.5)*.012;
    const petalGroup=new THREE.Group();petalGroup.rotation.z=a;petalGroup.position.set(-Math.sin(a)*.185,Math.cos(a)*.185,-.030);head.add(petalGroup);
    const petal=mesh(petalGeometry(length,width,phase+i),petalYellow,petalGroup);
    addFur(petal,920,.008,0xffa32b,.43,.25);
    const outline=[];
    for(let j=0;j<=56;j++) {
      const t=j/56,u=t<=.5?t*2:(1-t)*2,side=t<=.5?-1:1;
      const r=width*Math.pow(Math.sin(Math.PI*u),.46)*(.61+.46*u);
      outline.push(V(side*r+.009*Math.sin(u*3+phase+i)*u,u*length,.037*Math.sin(u*Math.PI)-.04*u*u+.001));
    }
    tube(outline,.003,petalGroup,petalSeam,56,5);
  }
  const center=ellipsoid(.239,.233,.095,gold,head,0,0,.025);
  addFur(center,5200,.018,0xdf891a,.76,1.2);
  // Raised, curled yarn catches the light as the head turns.
  const loopCount=2400;
  const yarn=new THREE.InstancedMesh(new THREE.TorusGeometry(1,.19,5,10,Math.PI*1.88),new THREE.MeshStandardMaterial({color:0xffffff,roughness:1}),loopCount);
  const dummy=new THREE.Object3D(),yarnColor=new THREE.Color();
  for(let i=0;i<loopCount;i++) {
    const a=random()*Math.PI*2,r=Math.sqrt(random())*.230;
    const px=Math.cos(a)*r,py=Math.sin(a)*r,z=.032+.095*Math.sqrt(1-(r/.241)**2);
    const radius=.005+random()*.007;
    dummy.position.set(px,py,z);
    dummy.rotation.set((random()-.5)*1.35,(random()-.5)*1.35,random()*Math.PI*2);
    dummy.scale.set(radius,radius*.82,radius);dummy.updateMatrix();yarn.setMatrixAt(i,dummy.matrix);
    yarnColor.setHSL(.083+random()*.013,.84+random()*.12,.28+random()*.13);yarn.setColorAt(i,yarnColor);
  }
  head.add(yarn);
  flowers.push({head,lean,phase,baseScale:scale,baseY:position.y});
}
flower(stems[0].at(-1),1,.04,-.07,0);
flower(stems[1].at(-1),.83,-.42,.28,1.5);


// Two little textile bees share a 36-second garden circuit. Wings and legs
// belong to the bee, while the route belongs to the plant and rotates with it.
const beeHoney=cloth(0xf6bd38,.00015),beeStripe=cloth(0x493328,.0001);
const beeWing=new THREE.MeshStandardMaterial({color:0xf7fcff,roughness:.45,transparent:true,opacity:.78,side:THREE.DoubleSide,depthWrite:false});
const wingSeam=new THREE.MeshStandardMaterial({color:0xa9c1c7,roughness:.8,transparent:true,opacity:.65});
const beeGlint=new THREE.MeshBasicMaterial({color:0xffffff});
const bees=[];
function makeBee(scale,phase){
  const root=new THREE.Group(),body=new THREE.Group();growth.add(root);root.add(body);root.scale.setScalar(scale);
  const abdomen=ellipsoid(.205,.132,.13,beeHoney,body,-.11,0,0);
  addFur(abdomen,1000,.009,0xeebc48,.52,.5);
  // Follow the abdomen's curved surface instead of floating rings.
  for(const bandX of [-.115,.025]){
    const profile=[];
    for(let j=0;j<=12;j++){
      const x=bandX-.026+j/12*.052;
      profile.push(new THREE.Vector2(.133*Math.sqrt(1-(x/.205)**2),x));
    }
    const band=new THREE.LatheGeometry(profile,32);band.rotateZ(-Math.PI/2);band.scale(1,1,.985);
    const stripe=mesh(band,beeStripe,body,-.11,0,0);
    addFur(stripe,260,.005,0x50382a,.42,.3);
  }
  const thorax=ellipsoid(.108,.126,.116,beeHoney,body,.075,.020,0);
  addFur(thorax,700,.013,0xffd45d,.55,.65);
  const head=ellipsoid(.108,.107,.100,beeHoney,body,.208,.038,0);
  addFur(head,350,.006,0xfad367,.4);
  for(const side of [-1,1]){
    ellipsoid(.032,.037,.018,eyeMaterial,body,.255,.065,side*.082);
    ellipsoid(.010,.010,.005,beeGlint,body,.263,.080,side*.097);
    tube([V(.245,.12,side*.044),V(.271,.185,side*.060),V(.305,.194,side*.075)],.008,body,beeStripe,12,6);
    ellipsoid(.014,.015,.014,beeStripe,body,.305,.194,side*.075);
  }
  // Four pearly wings with softly sewn edges; their pivots flap independently.
  const wings=[];
  for(const side of [-1,1]){
    const pivot=new THREE.Group();pivot.position.set(.028,.092,side*.049);body.add(pivot);
    for(const [x,z,rx,rz,turn] of [[.025,.20,.098,.225,-.20],[-.10,.13,.074,.151,.25]]){
      const panel=new THREE.Group();panel.position.set(x,0,side*z);panel.rotation.y=side*turn;pivot.add(panel);
      ellipsoid(rx,.012,rz,beeWing,panel,0,0,0);
      const outline=[];
      for(let j=0;j<=40;j++){const a=j/40*Math.PI*2;outline.push(V(Math.cos(a)*rx,0,Math.sin(a)*rz));}
      tube(outline,.0032,panel,wingSeam,40,5);
      tube([V(0,.013,-side*rz*.8),V(.01,.014,0),V(0,.013,side*rz*.80)],.002,panel,wingSeam,12,5);
    }
    wings.push({pivot,side});
  }
  const legs=[];
  for(const side of [-1,1])for(let i=0;i<3;i++){
    const leg=new THREE.Group();leg.position.set(.14-i*.11,-.078,side*.073);body.add(leg);
    tube([V(0,0,0),V(-.024,-.064,side*.065),V(.035,-.10,side*.089)],.008,leg,beeStripe,12,6);
    if(i===2)ellipsoid(.036,.044,.031,beeHoney,leg,-.015,-.058,side*.06);
    legs.push({leg,side,i});
  }
  tube([V(.29,.006,.012),V(.311,-.025,.01),V(.312,-.046,.01)],.004,body,beeStripe,8,5);
  bees.push({root,body,wings,legs,phase});
}
makeBee(.90,0);
makeBee(.78,18);
const leftLanding=V(-.86,1.13,.34),rightLanding=V(.25,1.51,.37);
const outwardFlight=new THREE.CatmullRomCurve3([
  leftLanding,V(-.63,1.68,.48),V(-.43,1.93,.14),V(.18,2.01,-.08),V(.96,1.94,.17),V(1.21,1.61,.44),rightLanding
],false,'centripetal');
const returnFlight=new THREE.CatmullRomCurve3([
  rightLanding,V(.97,1.17,.65),V(.82,.74,.54),V(-.14,.74,.75),V(-1.10,.80,.50),V(-1.05,1.02,.43),leftLanding
],false,'centripetal');
const smallLoop=new THREE.CatmullRomCurve3([
  leftLanding,V(-1.06,.86,.48),V(-.79,.63,.70),V(-.49,.85,.50),leftLanding
],false,'centripetal');
const beePosition=V(0,0,0),beeTangent=V(0,0,0);
function animateBees(t,idle){
  for(const bee of bees){
    const phase=idle?(t+bee.phase)%36:(bee.phase?27:11);
    let curve,progress,foraging=false,settle=0;
    if(phase<9){curve=outwardFlight;progress=phase/9;}
    else if(phase<15){beePosition.copy(rightLanding);foraging=true;settle=easeInOut(Math.min(phase-9,15-phase)*2);}
    else if(phase<26){curve=returnFlight;progress=(phase-15)/11;}
    else if(phase<32){beePosition.copy(leftLanding);foraging=true;settle=easeInOut(Math.min(phase-26,32-phase)*2);}
    else{curve=smallLoop;progress=(phase-32)/4;}
    if(curve){
      const u=easeInOut(progress);curve.getPointAt(u,beePosition);curve.getTangentAt(u,beeTangent);
      // Blend turns near landing so stopping never snaps the bee's heading.
      const turnWeight=Math.sin(Math.PI*progress)**2;
      bee.body.rotation.y=-Math.atan2(beeTangent.z,beeTangent.x)*turnWeight;
      bee.body.rotation.z=THREE.MathUtils.clamp(beeTangent.y,-.6,.6)*turnWeight*.38;
    }else{
      bee.body.rotation.set(0,-.20*settle,(-.27+Math.sin(t*3+bee.phase)*.045*idle)*settle);
      beePosition.y+=Math.sin(t*3+bee.phase)*.008*idle*settle;
      beePosition.x+=Math.sin(t*1.6+bee.phase)*.014*idle*settle;
    }
    bee.root.position.copy(beePosition);
    if(!foraging)bee.root.position.y+=Math.sin(t*6+bee.phase)*.018*idle*Math.sin(Math.PI*progress);
    for(const {pivot,side} of bee.wings){
      const flutter=idle*Math.sin(t*(foraging?8:32)+side*.5+bee.phase);
      pivot.rotation.x=-side*((foraging?.26:.82)+flutter*(foraging?.08:.56));
    }
    for(const {leg,side,i} of bee.legs){
      leg.rotation.x=foraging?Math.sin(t*3.8+i+side+bee.phase)*.10*idle:side*.25;
      leg.rotation.z=foraging?-.12:Math.sin(t*3+i)*.05*idle+.25;
    }
  }
}

const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=128;
const shadowCtx=shadowCanvas.getContext('2d'),gradient=shadowCtx.createRadialGradient(64,64,5,64,64,62);
gradient.addColorStop(0,'rgba(39,33,22,.20)');gradient.addColorStop(.5,'rgba(39,33,22,.065)');gradient.addColorStop(1,'rgba(39,33,22,0)');shadowCtx.fillStyle=gradient;shadowCtx.fillRect(0,0,128,128);
const shadow=mesh(new THREE.PlaneGeometry(2,1.45),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}),scene,0,.006,.06);shadow.rotation.x=-Math.PI/2;

// The visible 3D can is the button: its projected bounds position a transparent
// native control, so pointer, touch, keyboard, and screen readers share one action.
const can=new THREE.Group();scene.add(can);
const canScale=1;
const canRest=V(-1.26,2.91,.16);
can.scale.setScalar(canScale);can.position.copy(canRest);
// A smooth, milk-white rabbit can. Its handle stays on the left and its
// tapered spout faces the flowers; the ears remain clear of both blooms.
const canMat=new THREE.MeshStandardMaterial({color:0xe7e7e2,roughness:.48,metalness:0});
const canInside=new THREE.MeshStandardMaterial({color:0xb6b8b1,roughness:.75,side:THREE.DoubleSide});
tube([V(-.23,.17,-.035),V(-.43,.27,-.035),V(-.59,.17,-.035),V(-.61,-.02,-.035),V(-.48,-.19,-.035),V(-.24,-.16,-.035)],.054,can,canMat,48,16);
for(const side of [-1,1]) {
  const ear=ellipsoid(.102,.285,.085,canMat,can,side*.125,.388,-.015);
  ear.rotation.z=-side*.055;
}
const canBody=ellipsoid(.318,.261,.246,canMat,can,0,0,0);
// Variable-radius geometry keeps the spout broad at the body and slender
// at the open tip instead of ending in the old shower-head attachment.
const spoutCurve=new THREE.CatmullRomCurve3([V(.245,.045,0),V(.385,.19,0),V(.56,.30,0),V(.735,.335,0)]);
const spoutSegments=40,spoutSides=24;
const spoutFrames=spoutCurve.computeFrenetFrames(spoutSegments,false);
function spoutSurface(inner=false){
  const positions=[],indices=[];
  for(let i=0;i<=spoutSegments;i++){
    const t=i/spoutSegments,center=spoutCurve.getPointAt(t);
    const radius=.035+.066*Math.pow(1-t,1.5)-(inner?.010:0);
    for(let j=0;j<=spoutSides;j++){
      const a=j/spoutSides*Math.PI*2;
      const point=center.clone().addScaledVector(spoutFrames.normals[i],Math.cos(a)*radius).addScaledVector(spoutFrames.binormals[i],Math.sin(a)*radius);
      positions.push(...point.toArray());
      if(i<spoutSegments&&j<spoutSides){
        const k=i*(spoutSides+1)+j;
        indices.push(k,k+1,k+spoutSides+1,k+1,k+spoutSides+2,k+spoutSides+1);
      }
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  return geometry;
}
mesh(spoutSurface(),canMat,can);
mesh(spoutSurface(true),canInside,can);
const spoutTip=spoutCurve.getPointAt(1);
const spoutLip=mesh(new THREE.TorusGeometry(.030,.005,10,32),canMat,can,...spoutTip.toArray());
spoutLip.quaternion.setFromUnitVectors(V(0,0,1),spoutCurve.getTangentAt(1));
const canFace=new THREE.MeshStandardMaterial({color:0x171816,roughness:.8});
for(const side of [-1,1]) ellipsoid(.019,.022,.010,canFace,can,side*.130,-.017,.227);
for(const side of [-1,1]) {
  tube([V(-.032,-.126+side*.021,.213),V(0,-.126,.220),V(.032,-.126-side*.021,.213)],.009,can,canFace,16,10);
}

// Plump, opaque teardrops read as soft toy beads even at sidebar size.
const dropProfile=[[0,-.047],[.025,-.042],[.036,-.021],[.035,.006],[.020,.036],[0,.070]];
const dropCurve=new THREE.CatmullRomCurve3(dropProfile.map(([r,y])=>V(r,y,0)),false,'centripetal');
const dropGeometry=new THREE.LatheGeometry(dropCurve.getPoints(24).map(p=>new THREE.Vector2(Math.max(0,p.x),p.y)),16);
const waterMat=new THREE.MeshStandardMaterial({color:0x9bd8ec,roughness:.38,metalness:0});
const shineMat=new THREE.MeshBasicMaterial({color:0xf3fcff,transparent:true,opacity:.85});
const droplets=[];
for(let i=0;i<14;i++) {
  const drop=new THREE.Group();drop.visible=false;scene.add(drop);
  mesh(dropGeometry,waterMat,drop);
  ellipsoid(.006,.012,.003,shineMat,drop,-.015,.007,.030);
  droplets.push(drop);
}
const splashes=[];
for(let i=0;i<9;i++) {
  const bubble=ellipsoid(.023,.024,.023,waterMat,scene,0,0,0);
  bubble.visible=false;splashes.push(bubble);
}
const source=V(0,0,0),destination=V(0,0,0);
const duration=4.2;
let watering=false,startWater=0,angle=0,targetAngle=0,dragStart=null,visible=true,lastFrame=0,frameId;
let canHovered=false,canHover=0;
const easeInOut=t=>{t=THREE.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};
let lastControlBox='';
function positionCanControl(){
  // Project all corners so the ears, handle, and spout stay clickable
  // while the can tilts, including the compact mobile sidebar.
  const corners=[];
  for(const x of [-.68,.79]) for(const y of [-.28,.70]) for(const z of [-.25,.26]) {
    corners.push(can.localToWorld(V(x,y,z)).project(camera));
  }
  const w=stage.clientWidth,h=stage.clientHeight;
  const minX=Math.min(...corners.map(p=>(p.x*.5+.5)*w));
  const maxX=Math.max(...corners.map(p=>(p.x*.5+.5)*w));
  const minY=Math.min(...corners.map(p=>(-p.y*.5+.5)*h));
  const maxY=Math.max(...corners.map(p=>(-p.y*.5+.5)*h));
  const controlWidth=Math.max(44,maxX-minX+6),controlHeight=Math.max(44,maxY-minY+6);
  const x=(minX+maxX)/2,y=(minY+maxY)/2;
  const box=[x,y,controlWidth,controlHeight].map(n=>Math.round(n)).join(',');
  if(box!==lastControlBox){
    button.style.left=`${x}px`;button.style.top=`${y}px`;
    button.style.width=`${controlWidth}px`;button.style.height=`${controlHeight}px`;
    lastControlBox=box;
  }
}
button.addEventListener('pointerenter',()=>{canHovered=true;});
button.addEventListener('pointerleave',()=>{canHovered=false;});
button.addEventListener('focus',()=>{canHovered=true;});
button.addEventListener('blur',()=>{canHovered=false;});
function updateTheme(){
  const dark=document.documentElement.dataset.theme==='dark';
  ambient.intensity=dark?1.65:1.8;key.intensity=dark?2.35:2.6;fill.intensity=dark?.8:.95;
  renderer.toneMappingExposure=dark?1.06:1.12;renderFrame(performance.now());
}
document.addEventListener('themechange',updateTheme);
motion.addEventListener('change',()=>renderFrame(performance.now()));
function resize(){
  const w=stage.clientWidth,h=stage.clientHeight;
  renderer.setSize(w,h,false);camera.aspect=w/h;
  camera.fov=camera.aspect<.64?37:32;camera.updateProjectionMatrix();renderFrame(performance.now());
}
new ResizeObserver(resize).observe(stage);
new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;},{threshold:0}).observe(stage);
stage.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'||e.isPrimary){dragStart={x:e.clientX,angle:targetAngle};stage.setPointerCapture(e.pointerId);}});
stage.addEventListener('pointermove',e=>{if(dragStart)targetAngle=dragStart.angle+(e.clientX-dragStart.x)*.012;});
const endDrag=()=>{dragStart=null;};stage.addEventListener('pointerup',endDrag);stage.addEventListener('pointercancel',endDrag);
stage.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();targetAngle+=e.key==='ArrowLeft'?-.30:.30;}});
button.addEventListener('click',()=>{
  if(watering)return;
  watering=true;startWater=performance.now();button.disabled=true;button.setAttribute('aria-busy','true');message.textContent='Watering.';stage.dataset.watering='true';
});
function renderFrame(now){
  const t=now*.001;angle+=(targetAngle-angle)*.12;plant.rotation.y=angle;
  const idle=motion.matches?0:1;
  const elapsed=watering?(now-startWater)/1000:0;
  const envelope=watering?easeInOut(elapsed/.4)*easeInOut((duration-elapsed)/.65):0;
  canHover+=(Number(canHovered)-canHover)*.15;
  const bounce=idle*envelope*Math.sin(elapsed*7.5);
  growth.rotation.z=Math.sin(t*1.25)*.010*idle+bounce*.023;
  for(const flower of flowers){
    flower.head.rotation.z=flower.lean+Math.sin(t*1.35+flower.phase)*.012*idle+bounce*.048;
    flower.head.position.y=flower.baseY+Math.max(0,Math.sin(elapsed*7.5+flower.phase))*.025*envelope*idle;
    flower.head.scale.setScalar(flower.baseScale*(1+bounce*.018));
  }
  for(const leaf of leaves)leaf.group.rotation.x=leaf.tilt+Math.sin(t*1.1)*.009*idle+bounce*.026;
  animateBees(t,idle);

  // Water from the open space on the left: the nearer bloom first, then the
  // taller bloom. Keep the can beside the plant throughout the interaction.
  const second=easeInOut((elapsed-1.65)/.7);
  const lift=idle*envelope;
  can.position.copy(canRest);
  can.position.x+=lift*(.04+second*.10);
  can.position.y+=lift*(.28+second*.16)+Math.sin(t*1.5)*.012*idle;
  can.rotation.set(.02,.08,-.08-.40*lift);
  can.scale.setScalar(canScale*(1+canHover*.045*idle));
  plant.updateMatrixWorld(true);can.updateMatrixWorld(true);
  positionCanControl();

  const pour=watering&&elapsed>.45&&elapsed<3.55&&!motion.matches;
  if(watering){
    source.copy(spoutTip).applyMatrix4(can.matrixWorld);
    const first=flowers[1].head.localToWorld(V(0,.20,.14));
    const next=flowers[0].head.localToWorld(V(0,.20,.14));
    destination.copy(first).lerp(next,second);
    stage.dataset.wateringPhase=pour?'pouring':elapsed<.45?'tilting':'settling';
    for(let i=0;i<droplets.length;i++){
      const drop=droplets[i],phase=(elapsed*1.08+i/droplets.length)%1;
      drop.visible=pour;
      const spread=Math.sin(i*9.2)*.055;
      drop.position.copy(source).lerp(destination,phase);
      drop.position.x+=Math.sin(Math.PI*phase)*(.075+spread);
      drop.position.y+=.055*Math.sin(Math.PI*phase);
      drop.position.z+=.030*Math.sin(i*4)+.12*Math.sin(Math.PI*phase);
      const size=.74+(i%3)*.13;
      drop.scale.set(size*(1-.1*phase),size*(.96+.22*phase),size);
      drop.rotation.z=-.18+phase*.28;
    }
    for(let i=0;i<splashes.length;i++){
      const bubble=splashes[i],phase=(elapsed*1.25+i/splashes.length)%1,a=i*2.399;
      bubble.visible=pour&&elapsed>.90;
      bubble.position.copy(destination).add(V(Math.cos(a)*phase*.16,.03+Math.sin(phase*Math.PI)*.10,Math.sin(a)*phase*.12+.08));
      bubble.scale.setScalar((1-phase)*(.8+(i%3)*.2));
    }
    if(elapsed>=duration){
      watering=false;droplets.forEach(d=>{d.visible=false;});splashes.forEach(d=>{d.visible=false;});
      button.disabled=false;button.removeAttribute('aria-busy');message.textContent='Watering complete.';
      stage.dataset.watering='false';stage.dataset.wateringPhase='idle';
      document.dispatchEvent(new CustomEvent('garden:watered'));
    }
  }
  renderer.render(scene,camera);
}
function tick(now){
  frameId=requestAnimationFrame(tick);
  if(!visible||document.hidden||now-lastFrame<40)return;
  if(motion.matches&&!watering&&Math.abs(angle-targetAngle)<.001)return;
  lastFrame=now;renderFrame(now);
}
renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(frameId);renderer.domElement.hidden=true;document.querySelector('#garden-fallback').hidden=false;button.disabled=true;message.textContent='The garden needs a refresh.';});
updateTheme();resize();frameId=requestAnimationFrame(tick);
