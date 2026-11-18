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

// UI handlers
const btnPack = document.getElementById('btnPack');
const btnReset = document.getElementById('btnReset');
const btnExport = document.getElementById('btnExport');
const status = document.getElementById('status');
let packingWorker;
let nextPackingJobId = 0;
let activePackingJobId = null;

function hexByIndex(i) {
    const palette = [0x3b82f6, 0x10b981, 0xf97316, 0xe11d48, 0xa78bfa, 0x06b6d4, 0xf43f5e, 0xf59e0b];
    return palette[i % palette.length];
}

function createPackingWorker() {
    packingWorker = new Worker(new URL('./packing-worker.js', import.meta.url));

    packingWorker.onmessage = ({data}) => {
        // 忽略已被后续请求取代的计算结果。
        if (data.jobId !== activePackingJobId) return;

        activePackingJobId = null;
        btnPack.disabled = false;

        if (data.type === 'error') {
            status.textContent = '计算错误：' + data.message;
            return;
        }

        const {placed, unplacedCount, totalBoxVolume, usedVolume, container} = data;
        placed.forEach((box, index) => {
            addBoxVisual(box.x, box.y, box.z, box.l, box.w, box.h, hexByIndex(index));
        });

        const containerVolume = container.L * container.W * container.H;
        const unplacedText = unplacedCount ? `；未放下 ${unplacedCount} 件` : '';
        status.innerHTML = `放置完成：放下 ${placed.length} 件${unplacedText}，总箱体积 ${totalBoxVolume.toLocaleString()} cm³；容器体积 ${containerVolume.toLocaleString()} cm³；已用体积 ${usedVolume.toLocaleString()} cm³；体积利用率 ${(usedVolume / containerVolume * 100).toFixed(2)}%`;
        controls.target.set(container.L / 2, container.H / 2, container.W / 2);
        controls.update();
    };

    packingWorker.onerror = (event) => {
        activePackingJobId = null;
        btnPack.disabled = false;
        status.textContent = '计算 Worker 异常：' + event.message;
    };
}

createPackingWorker();

btnPack.addEventListener('click', () => {
    try {
        const boxes = JSON.parse(document.getElementById('boxesJson').value);
        const L = parseFloat(document.getElementById('contL').value);
        const W = parseFloat(document.getElementById('contW').value);
        const H = parseFloat(document.getElementById('contH').value);
        if (!Array.isArray(boxes)) throw new Error('boxes must be array');
        if (![L, W, H].every(Number.isFinite) || L <= 0 || W <= 0 || H <= 0) {
            throw new Error('容器尺寸必须为正数');
        }
        makeContainer(L, W, H);
        clearPlaced();
        status.textContent = '计算中... 计算在后台 Worker 运行，可继续操作视图。';
        btnPack.disabled = true;
        activePackingJobId = ++nextPackingJobId;
        packingWorker.postMessage({
            jobId: activePackingJobId,
            boxes,
            container: {L, W, H}
        });

    } catch (e) {
        status.textContent = '错误：' + e.message;
    }
});

btnReset.addEventListener('click', () => {
    // 中止当前扫描，避免旧任务占用 Worker 队列或覆盖重置后的场景。
    packingWorker.terminate();
    createPackingWorker();
    activePackingJobId = null;
    btnPack.disabled = false;
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
