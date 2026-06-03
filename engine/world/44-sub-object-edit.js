  // -------- sub-object editing (reqs 6-9) --------
  // Slice 3: web-inspector-style hover highlight on the editable sub-parts of the
  // object currently in "edit parts" mode. The edited cell renders un-batched +
  // part-keyed (see makeVoxelBuildStamp editable path); here we raycast its child
  // meshes on pointermove and outline the hovered part. All gated by inspectorV2.
  //
  // Later slices grow this module: sub-part select+transform (9), explode (7),
  // voxel sculpt (8). Exposed via window.__tinyworldSubEdit.

  const subEditHoverGroup = new THREE.Group();
  subEditHoverGroup.name = 'sub-edit-hover';
  if (typeof xrWorldRoot !== 'undefined' && xrWorldRoot) xrWorldRoot.add(subEditHoverGroup);
  else if (typeof scene !== 'undefined' && scene) scene.add(subEditHoverGroup);

  const subEditHoverMat = new THREE.MeshBasicMaterial({
    color: 0x33e0ff, side: THREE.BackSide, transparent: true, opacity: 0.9,
    depthWrite: false, depthTest: true,
  });
  const SUBEDIT_HOVER_SCALE = 1.14;

  const subEditSelGroup = new THREE.Group();
  subEditSelGroup.name = 'sub-edit-selection';
  if (typeof xrWorldRoot !== 'undefined' && xrWorldRoot) xrWorldRoot.add(subEditSelGroup);
  else if (typeof scene !== 'undefined' && scene) scene.add(subEditSelGroup);
  const subEditSelMat = new THREE.MeshBasicMaterial({
    color: 0xff8a3c, side: THREE.BackSide, transparent: true, opacity: 0.95,
    depthWrite: false, depthTest: true,
  });
  const SUBEDIT_SEL_SCALE = 1.18;

  let subEditCellX = null, subEditCellZ = null;     // cell currently in edit mode
  let currentHoverPart = null;                       // { mesh, partKey, voxelCoord }
  let selectedPartKey = null;                        // locked-in selected part key
  const _subEditNdc = new THREE.Vector2();

  function subEditActive() {
    return !!(window.__tinyworldFlags && window.__tinyworldFlags.inspectorV2) && subEditCellX !== null;
  }

  // The rendered Object3D for the edited cell. Home board lives in cellMeshes;
  // (island support arrives in a later slice).
  function subEditObject() {
    if (subEditCellX === null) return null;
    const key = subEditCellX + ',' + subEditCellZ;
    if (typeof cellMeshes !== 'undefined' && cellMeshes[key] && cellMeshes[key].object) return cellMeshes[key].object;
    return null;
  }

  function clearHoverMeshes() {
    while (subEditHoverGroup.children.length) {
      const m = subEditHoverGroup.children.pop();
      if (m.geometry && m.userData && m.userData.ownGeometry) m.geometry.dispose();
    }
  }
  function clearHoverPart() {
    clearHoverMeshes();
    currentHoverPart = null;
  }

  // Inverted-hull highlight of one part mesh, placed in world space from the
  // part's world matrix (mirrors addObjectOutline so it works under any parent).
  // Clears only the overlay meshes — the handler owns currentHoverPart state.
  function highlightPart(partMesh) {
    clearHoverMeshes();
    if (!partMesh || !partMesh.geometry) return;
    partMesh.updateMatrixWorld(true);
    const hull = new THREE.Mesh(partMesh.geometry, subEditHoverMat);
    hull.matrixAutoUpdate = false;
    hull.matrix.copy(partMesh.matrixWorld);
    hull.matrix.multiply(new THREE.Matrix4().makeScale(SUBEDIT_HOVER_SCALE, SUBEDIT_HOVER_SCALE, SUBEDIT_HOVER_SCALE));
    hull.renderOrder = 1000;
    subEditHoverGroup.add(hull);
  }

  // Raycast the edited object's children; return the nearest hit mesh that
  // carries a partKey (skips the inverted-hull overlay + non-part helpers).
  function pickSubPart(clientX, clientY) {
    const obj = subEditObject();
    if (!obj || typeof raycaster === 'undefined' || typeof camera === 'undefined') return null;
    _subEditNdc.x = (clientX / window.innerWidth) * 2 - 1;
    _subEditNdc.y = -(clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(_subEditNdc, camera);
    const hits = raycaster.intersectObject(obj, true);
    for (const h of hits) {
      let n = h.object;
      while (n && (!n.userData || !n.userData.partKey) && n !== obj) n = n.parent;
      if (n && n.userData && n.userData.partKey) return { mesh: n, partKey: n.userData.partKey, voxelCoord: n.userData.voxelCoord || null };
    }
    return null;
  }

  function onSubEditPointerMove(e) {
    if (!subEditActive()) { if (currentHoverPart) clearHoverPart(); return; }
    const hit = pickSubPart(e.clientX, e.clientY);
    if (!hit) { if (currentHoverPart) clearHoverPart(); return; }
    if (currentHoverPart && currentHoverPart.partKey === hit.partKey) return;
    currentHoverPart = hit;
    highlightPart(hit.mesh);
  }

  // --- part selection + transform (req 9) ---
  function clearSelMeshes() {
    while (subEditSelGroup.children.length) subEditSelGroup.children.pop();
  }
  function highlightSelectedMesh(partMesh) {
    clearSelMeshes();
    if (!partMesh || !partMesh.geometry) return;
    partMesh.updateMatrixWorld(true);
    const hull = new THREE.Mesh(partMesh.geometry, subEditSelMat);
    hull.matrixAutoUpdate = false;
    hull.matrix.copy(partMesh.matrixWorld);
    hull.matrix.multiply(new THREE.Matrix4().makeScale(SUBEDIT_SEL_SCALE, SUBEDIT_SEL_SCALE, SUBEDIT_SEL_SCALE));
    hull.renderOrder = 1001;
    subEditSelGroup.add(hull);
  }
  function findPartMesh(partKey) {
    const obj = subEditObject();
    if (!obj) return null;
    let found = null;
    obj.traverse(o => { if (!found && o.userData && o.userData.partKey === partKey) found = o; });
    return found;
  }
  function reHighlightSelection() {
    if (!selectedPartKey) { clearSelMeshes(); return; }
    highlightSelectedMesh(findPartMesh(selectedPartKey));
  }
  function selectPart(partKey) {
    selectedPartKey = partKey || null;
    reHighlightSelection();
    // refresh inspector so per-part transform rows appear
    if (typeof renderSelection === 'function') { try { renderSelection(); } catch (_) {} }
  }
  function onSubEditPointerDown(e) {
    if (!subEditActive() || e.button !== 0) return;
    const hit = pickSubPart(e.clientX, e.clientY);
    if (hit) selectPart(hit.partKey);
  }

  // Mutate the selected part's override on the real cell appearance and re-render
  // (which reapplies overrides), then re-acquire + re-highlight the part.
  function mutateSelectedPart(fn) {
    if (selectedPartKey === null || subEditCellX === null) return false;
    if (typeof getWorldCell !== 'function' || typeof setCell !== 'function') return false;
    const cell = getWorldCell(subEditCellX, subEditCellZ);
    if (!cell) return false;
    const appearance = Object.assign({}, (typeof normalizeAppearance === 'function' ? normalizeAppearance(cell.appearance) : cell.appearance) || {});
    const parts = Object.assign({}, appearance.parts || {});
    const cur = Object.assign({ ox: 0, oy: 0, oz: 0, sx: 1, sy: 1, sz: 1 }, parts[selectedPartKey] || {});
    fn(cur);
    parts[selectedPartKey] = cur;
    appearance.parts = parts;
    setCell(subEditCellX, subEditCellZ, Object.assign({}, cell, { appearance, animate: false, impactDust: false }));
    reHighlightSelection();
    return true;
  }
  function movePart(dx, dy, dz) {
    return mutateSelectedPart(c => { c.ox += dx || 0; c.oy += dy || 0; c.oz += dz || 0; });
  }
  function scalePart(factor) {
    const f = Number(factor) || 1;
    return mutateSelectedPart(c => { c.sx *= f; c.sy *= f; c.sz *= f; });
  }

  function enterSubEdit(x, z) {
    if (typeof setVoxelSubEditCell !== 'function') return false;
    subEditCellX = x; subEditCellZ = z;
    setVoxelSubEditCell(x, z);
    clearHoverPart(); selectedPartKey = null; clearSelMeshes();
    explodeTarget = 0; explodeProgress = 0; explodeParts = [];
    if (typeof renderCellObject === 'function') renderCellObject(x, z, { animate: false });
    return true;
  }

  function exitSubEdit() {
    const hadX = subEditCellX, hadZ = subEditCellZ;
    subEditCellX = null; subEditCellZ = null;
    selectedPartKey = null; clearSelMeshes();
    explodeTarget = 0; explodeProgress = 0; explodeParts = [];
    if (typeof setVoxelSubEditCell === 'function') setVoxelSubEditCell(null, null);
    clearHoverPart();
    if (hadX !== null && typeof renderCellObject === 'function') renderCellObject(hadX, hadZ, { animate: false });
  }

  // --- explode view (req 7): push parts radially outward + up into a sphere
  // so every sub-part is visible/editable. Animated each frame; parts stay the
  // same meshes (hover/select/transform still work while exploded). ---
  const EXPLODE_OUT = 1.6;      // radial multiplier at full explode
  const EXPLODE_LIFT = 0.9;     // extra upward lift at full explode
  let explodeTarget = 0;        // 0 = collapsed, 1 = exploded
  let explodeProgress = 0;
  let explodeParts = [];        // [{ mesh, baseX, baseY, baseZ }]

  function captureExplodeParts() {
    explodeParts = [];
    const obj = subEditObject();
    if (!obj) return;
    obj.traverse(o => {
      if (o.isMesh && o.userData && o.userData.partKey) {
        explodeParts.push({ mesh: o, baseX: o.position.x, baseY: o.position.y, baseZ: o.position.z });
      }
    });
  }
  function applyExplode(amount) {
    for (const p of explodeParts) {
      if (!p.mesh.parent) continue;
      const k = 1 + EXPLODE_OUT * amount;
      p.mesh.position.set(p.baseX * k, p.baseY * k + EXPLODE_LIFT * amount, p.baseZ * k);
    }
    reHighlightSelection();
  }
  function setExplode(on) {
    explodeTarget = on ? 1 : 0;
    if (on) captureExplodeParts();
  }
  function isExploded() { return explodeTarget > 0.5; }
  function tickSubEditExplode(dt) {
    if (!subEditActive()) { if (explodeProgress > 0) { explodeProgress = 0; } return; }
    if (Math.abs(explodeProgress - explodeTarget) < 0.001) {
      if (explodeTarget === 0 && explodeParts.length) { applyExplode(0); explodeParts = []; }
      return;
    }
    const step = Math.min(1, (dt || 0.016) * 6);
    explodeProgress += (explodeTarget - explodeProgress) * step;
    if (Math.abs(explodeProgress - explodeTarget) < 0.002) explodeProgress = explodeTarget;
    if (!explodeParts.length && explodeTarget > 0) captureExplodeParts();
    const eased = explodeProgress * explodeProgress * (3 - 2 * explodeProgress); // smoothstep
    applyExplode(eased);
  }

  if (typeof renderer !== 'undefined' && renderer && renderer.domElement) {
    renderer.domElement.addEventListener('pointermove', onSubEditPointerMove);
    renderer.domElement.addEventListener('pointerdown', onSubEditPointerDown);
  }

  window.__tinyworldSubEdit = {
    enter: enterSubEdit,
    exit: exitSubEdit,
    isActive: subEditActive,
    hoverInfo: () => currentHoverPart ? { partKey: currentHoverPart.partKey, voxelCoord: currentHoverPart.voxelCoord } : null,
    selectPart,
    selectedInfo: () => selectedPartKey ? { partKey: selectedPartKey } : null,
    movePart,
    scalePart,
    setExplode,
    isExploded,
    _tickExplode: tickSubEditExplode,
    _pick: pickSubPart,
    _object: subEditObject,
  };
