// 装箱计算运行在 Worker 中，避免网格扫描和碰撞检测阻塞渲染线程。
function generateInstances(boxSpecs) {
    const instances = [];
    for (const spec of boxSpecs) {
        const count = spec.count || 1;
        for (let index = 0; index < count; index += 1) {
            instances.push({l: spec.l, w: spec.w, h: spec.h});
        }
    }
    return instances;
}

function orientations(box) {
    const {l, w, h} = box;
    return [
        {l: w, w: l, h},
        {l, w, h},
        {l: h, w, h: l},
        {l: w, w: h, h: l},
        {l: h, w: l, h: w},
        {l, w: h, h: w}
    ];
}

function collides(a, b) {
    return !(a.x + a.l <= b.x || b.x + b.l <= a.x ||
        a.y + a.h <= b.y || b.y + b.h <= a.y ||
        a.z + a.w <= b.z || b.z + b.w <= a.z);
}

function packGreedy(boxSpecs, container) {
    const instances = generateInstances(boxSpecs);
    instances.sort((a, b) => (b.l * b.w * b.h) - (a.l * a.w * a.h));

    const placed = [];
    const maxX = container.L;
    const maxY = container.H;
    const maxZ = container.W;
    let unplacedCount = 0;

    for (const box of instances) {
        let placedFlag = false;
        const boxOrientations = orientations(box);

        for (let z = 0; z <= maxZ - 1 && !placedFlag; z += 1) {
            for (let y = 0; y <= maxY - 1 && !placedFlag; y += 1) {
                for (let x = 0; x <= maxX - 1 && !placedFlag; x += 1) {
                    for (const orientation of boxOrientations) {
                        if (x + orientation.l > maxX + 1e-6 ||
                            y + orientation.h > maxY + 1e-6 ||
                            z + orientation.w > maxZ + 1e-6) {
                            continue;
                        }

                        const candidate = {x, y, z, ...orientation};
                        if (placed.every(existing => !collides(candidate, existing))) {
                            placed.push(candidate);
                            placedFlag = true;
                            break;
                        }
                    }
                }
            }
        }

        if (!placedFlag) unplacedCount += 1;
    }

    const totalBoxVolume = boxSpecs.reduce(
        (total, spec) => total + spec.l * spec.w * spec.h * (spec.count || 1),
        0
    );
    const usedVolume = placed.reduce((total, box) => total + box.l * box.w * box.h, 0);

    return {placed, unplacedCount, totalBoxVolume, usedVolume};
}

self.onmessage = ({data}) => {
    const {jobId, boxes, container} = data;

    try {
        const result = packGreedy(boxes, container);
        self.postMessage({jobId, type: 'result', container, ...result});
    } catch (error) {
        self.postMessage({
            jobId,
            type: 'error',
            message: error instanceof Error ? error.message : String(error)
        });
    }
};
