import * as THREE from 'three';
import {OrbitControls} from 'OrbitControls';

let transparentMode = true; // 默认透明

document.getElementById('toggleTransparent').addEventListener('click', function () {
    transparentMode = !transparentMode; // 切换状态
    // 遍历 placedGroup 里的所有 Mesh
    placedGroup.children.forEach(obj => {
        if (obj.isMesh) {  // 只修改 Mesh，不修改线框
            obj.material.transparent = transparentMode;
            obj.material.opacity = transparentMode ? 0.9 : 1; // 半透明或不透明
        }
    });

    this.textContent = transparentMode ? "关闭透明" : "开启透明"
});

const canvas = document.getElementById('viewer');
const renderer = new THREE.WebGLRenderer({canvas, antialias: true});
renderer.setPixelRatio(window.devicePixelRatio);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf3f6ff);

const camera = new THREE.PerspectiveCamera(45, 2, 1, 5000);
camera.position.set(700, 800, 1200);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(600, 100, 117);
controls.enablePan = false;
controls.update();

// 灯光
const hemi = new THREE.HemisphereLight(0xffffff, 0x444455, 0.9);
hemi.position.set(0, 1000, 0);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(800, 1000, 600);
scene.add(dir);

// 地面网格
const grid = new THREE.GridHelper(16000, 80, 0xdddddd, 0xeeeeff);
grid.rotation.x = Math.PI / 2;
scene.add(grid);

let containerMesh, placedGroup;

function makeContainer(L, W, H) {
    if (containerMesh) scene.remove(containerMesh);
    const geom = new THREE.BoxGeometry(L, H, W);
    const mat = new THREE.MeshStandardMaterial({color: 0x1e293b, wireframe: false, transparent: true, opacity: 0.08});
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(L / 2, H / 2, W / 2);
    // edges
    const edges = new THREE.EdgesGeometry(geom);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({color: 0x243b55}));
    line.position.copy(mesh.position);
    containerMesh = new THREE.Group();
    containerMesh.add(mesh, line);
    scene.add(containerMesh);
}

function clearPlaced() {
    if (placedGroup) scene.remove(placedGroup);
    placedGroup = new THREE.Group();
    scene.add(placedGroup);
}

function addBoxVisual(x, y, z, l, w, h, color) {
    const g = new THREE.BoxGeometry(l, h, w);
    const m = new THREE.MeshStandardMaterial({color, transparent: transparentMode, opacity: 0.9});
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x + l / 2, y + h / 2, z + w / 2);
    placedGroup.add(mesh);
    // outline
    const edges = new THREE.EdgesGeometry(g);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({color: 0x111111}));
    line.position.copy(mesh.position);
    placedGroup.add(line);
}

function render() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
    renderer.render(scene, camera);
    requestAnimationFrame(render);
}

requestAnimationFrame(render);

// 布局算法（贪心扫描）
function generateInstances(boxSpecs) {
    const arr = [];
    for (const s of boxSpecs) {
        const n = s.count || 1;
        for (let i = 0; i < n; i++) arr.push({l: s.l, w: s.w, h: s.h});
    }
    return arr;
}

function orientations(box) {
    const {l, w, h} = box;
    return [
        {l: w, w: l, h: h},
        {l: l, w: w, h: h},
        {l: h, w: w, h: l},
        {l: w, w: h, h: l},
        {l: h, w: l, h: w},
        {l: l, w: h, h: w}
    ];
}

function collides(a, b) {
    // a and b have x,y,z,l,w,h
    return !(a.x + a.l <= b.x || b.x + b.l <= a.x ||
        a.y + a.h <= b.y || b.y + b.h <= a.y ||
        a.z + a.w <= b.z || b.z + b.w <= a.z);
}

function packGreedy(boxSpecs, container) {
    const instances = generateInstances(boxSpecs);
    // sort by volume descending
    instances.sort((A, B) => (B.l * B.w * B.h) - (A.l * A.w * A.h));
    const placed = [];
    const freeStep = 1; // cm step for scanning
    const maxX = container.L, maxY = container.H, maxZ = container.W;

    for (const box of instances) {
        let placedFlag = false;
        const orients = orientations(box);
        // scan z,y,x grid
        for (let z = 0; z <= maxZ - 1; z += freeStep) {
            if (placedFlag) break;
            for (let y = 0; y <= maxY - 1; y += freeStep) {
                if (placedFlag) break;
                for (let x = 0; x <= maxX - 1; x += freeStep) {
                    if (placedFlag) break;
                    for (const o of orients) {
                        if (x + o.l <= maxX + 1e-6 && y + o.h <= maxY + 1e-6 && z + o.w <= maxZ + 1e-6) {
                            const cand = {x, y, y0: y, z, l: o.l, w: o.w, h: o.h};
                            // check collisions with placed
                            let ok = true;
                            for (const p of placed) {
                                if (collides(cand, p)) {
                                    ok = false;
                                    break;
                                }
                            }
                            if (ok) {
                                // place
                                placed.push({x, y, z, l: o.l, w: o.w, h: o.h});
                                placedFlag = true;
                                break;
                            }
                        }
                    }
                }
            }
        }
        if (!placedFlag) {
            console.warn('无法放下一个箱子：', box);
        }
    }
    return placed;
}

// UI handlers
const btnPack = document.getElementById('btnPack');
const btnReset = document.getElementById('btnReset');
const btnExport = document.getElementById('btnExport');
const status = document.getElementById('status');

function hexByIndex(i) {
    const palette = [0x3b82f6, 0x10b981, 0xf97316, 0xe11d48, 0xa78bfa, 0x06b6d4, 0xf43f5e, 0xf59e0b];
    return palette[i % palette.length];
}

btnPack.addEventListener('click', () => {
    try {
        const boxes = JSON.parse(document.getElementById('boxesJson').value);
        const L = parseFloat(document.getElementById('contL').value);
        const W = parseFloat(document.getElementById('contW').value);
        const H = parseFloat(document.getElementById('contH').value);
        if (!Array.isArray(boxes)) throw new Error('boxes must be array');
        makeContainer(L, W, H);
        clearPlaced();
        status.textContent = '计算中... 请稍候（算法为贪心网格扫描，可能较慢，取决于箱子数量）。';

        // pack
        setTimeout(() => {
            const placed = packGreedy(boxes, {L, W, H});
            // visualize
            placed.forEach((p, i) => {
                addBoxVisual(p.x, p.y, p.z, p.l, p.w, p.h, hexByIndex(i));
            });
            // compute stats
            let volBox = 0;
            for (const s of boxes) {
                volBox += (s.l * s.w * s.h) * (s.count || 1);
            }
            const contVol = L * W * H;
            const usedVol = placed.reduce((s, p) => s + p.l * p.w * p.h, 0);
            status.innerHTML = `放置完成：放下 ${placed.length} 件，总箱体积 ${(volBox).toLocaleString()} cm³；容器体积 ${contVol.toLocaleString()} cm³；已用体积 ${usedVol.toLocaleString()} cm³；体积利用率 ${(usedVol / contVol * 100).toFixed(2)}%`;
            // focus camera
            controls.target.set(L / 2, H / 2, W / 2);
            controls.update();
        }, 50);

    } catch (e) {
        status.textContent = '错误：' + e.message;
    }
});

btnReset.addEventListener('click', () => {
    scene.children.filter(c => c !== grid && c !== hemi && c !== dir).forEach(c => scene.remove(c));
    // rebuild lights and grid
    clearPlaced();
    makeContainer(1200, 235, 269);
    status.textContent = '场景已重置。';
});

btnExport.addEventListener('click', () => {
    // export placed boxes from placedGroup
    if (!placedGroup) return;
    const out = [];
    placedGroup.children.forEach(child => {
        if (child.isMesh && child.geometry && child.geometry.parameters) {
            const p = child.position;
            const params = child.geometry.parameters;
            out.push({x: p.x - params.width / 2, y: p.y - params.height / 2, z: p.z - params.depth / 2, l: params.width, h: params.height, w: params.depth});
        }
    });

    const blob = new Blob([JSON.stringify(out, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.download = 'placed.json';
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
});

// 初始场景
makeContainer(1200, 235, 269);
clearPlaced();
status.textContent = '准备就绪。编辑箱子列表后点击开始装柜。';

// resize handling
function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    // 设置渲染器像素大小
    renderer.setSize(width, height, false);

    // 设置相机纵横比
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    // 可选：如果场景看起来偏左下，可以重新设置 controls.target 到容器中心
    if (containerMesh) {
        const box = containerMesh.children[0].geometry.parameters;
        controls.target.set(box.width / 2, box.height / 2, box.depth / 2);
        controls.update();
    }
}

window.addEventListener('resize', () => {
    resize();
});
resize();
