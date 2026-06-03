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

  let subEditCellX = null, subEditCellZ = null;     // cell currently in edit mode
  let currentHoverPart = null;                       // { mesh, partKey, voxelCoord }
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

  function clearHoverPart() {
    while (subEditHoverGroup.children.length) {
      const m = subEditHoverGroup.children.pop();
      if (m.geometry && m.userData && m.userData.ownGeometry) m.geometry.dispose();
    }
    currentHoverPart = null;
  }

  // Inverted-hull highlight of one part mesh, placed in world space from the
  // part's world matrix (mirrors addObjectOutline so it works under any parent).
  function highlightPart(partMesh) {
    clearHoverPart();
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

  function enterSubEdit(x, z) {
    if (typeof setVoxelSubEditCell !== 'function') return false;
    subEditCellX = x; subEditCellZ = z;
    setVoxelSubEditCell(x, z);
    clearHoverPart();
    if (typeof renderCellObject === 'function') renderCellObject(x, z, { animate: false });
    return true;
  }

  function exitSubEdit() {
    const hadX = subEditCellX, hadZ = subEditCellZ;
    subEditCellX = null; subEditCellZ = null;
    if (typeof setVoxelSubEditCell === 'function') setVoxelSubEditCell(null, null);
    clearHoverPart();
    if (hadX !== null && typeof renderCellObject === 'function') renderCellObject(hadX, hadZ, { animate: false });
  }

  if (typeof renderer !== 'undefined' && renderer && renderer.domElement) {
    renderer.domElement.addEventListener('pointermove', onSubEditPointerMove);
  }

  window.__tinyworldSubEdit = {
    enter: enterSubEdit,
    exit: exitSubEdit,
    isActive: subEditActive,
    hoverInfo: () => currentHoverPart ? { partKey: currentHoverPart.partKey, voxelCoord: currentHoverPart.voxelCoord } : null,
    _pick: pickSubPart,
    _object: subEditObject,
  };
