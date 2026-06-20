import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  CONFIG,
  getStatusFromReading,
  getTemperatureColor,
  getHumidityColor,
  getBatteryColor,
} from "../config/index.js";

export class ColdStorageScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.sensors = [];
    this.sensorMeshes = [];
    this.colorMode = "temperature";
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.onSensorClick = null;
    this.hoveredMesh = null;
    this.filteredSensorIds = new Set();
    this.heatmapCellFilter = null;

    this._init();
  }

  _init() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a1628);
    this.scene.fog = new THREE.Fog(0x0a1628, 20, 60);

    const container = this.canvas.parentElement;
    const width = container.clientWidth;
    const height = container.clientHeight;

    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 200);
    this.camera.position.set(12, 10, 15);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 50;
    this.controls.maxPolarAngle = Math.PI / 2.1;
    this.controls.target.set(0, 2, 0);

    this._addLights();
    this._buildWarehouse();

    window.addEventListener("resize", () => this._onResize());
    this.canvas.addEventListener("click", (e) => this._onClick(e));
    this.canvas.addEventListener("mousemove", (e) => this._onMouseMove(e));

    this._animate();
  }

  _addLights() {
    const ambientLight = new THREE.AmbientLight(0x404060, 0.6);
    this.scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
    mainLight.position.set(10, 20, 10);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 50;
    mainLight.shadow.camera.left = -20;
    mainLight.shadow.camera.right = 20;
    mainLight.shadow.camera.top = 20;
    mainLight.shadow.camera.bottom = -20;
    this.scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0x6080a0, 0.3);
    fillLight.position.set(-5, 10, -5);
    this.scene.add(fillLight);
  }

  _buildWarehouse() {
    const {
      rackRows,
      slotsPerRow,
      levels,
      aisleWidth,
      rackWidth,
      rackDepth,
      levelHeight,
    } = CONFIG.warehouse;

    const totalWidth =
      rackRows * rackDepth + (rackRows - 1) * aisleWidth + rackDepth;
    const totalLength = slotsPerRow * rackWidth;

    const floorGeo = new THREE.PlaneGeometry(totalWidth + 4, totalLength + 4);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1a2744,
      roughness: 0.8,
      metalness: 0.2,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.position.set(0, 0, 0);
    this.scene.add(floor);

    const gridHelper = new THREE.GridHelper(
      totalWidth + 2,
      totalWidth + 2,
      0x2a4a6e,
      0x1a3a5c,
    );
    gridHelper.position.y = 0.01;
    this.scene.add(gridHelper);

    const startX = -totalWidth / 2 + rackDepth / 2;

    for (let rack = 0; rack < rackRows; rack++) {
      const rackX = startX + rack * (rackDepth + aisleWidth);
      this._buildRack(
        rackX,
        rack,
        slotsPerRow,
        levels,
        rackWidth,
        rackDepth,
        levelHeight,
      );
    }
  }

  _buildRack(x, rackIndex, slots, levels, width, depth, levelHeight) {
    const rackGroup = new THREE.Group();
    rackGroup.position.x = x;

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x4a5568,
      roughness: 0.6,
      metalness: 0.4,
    });

    const shelfMat = new THREE.MeshStandardMaterial({
      color: 0x374151,
      roughness: 0.7,
      metalness: 0.3,
      transparent: true,
      opacity: 0.9,
    });

    const postGeo = new THREE.BoxGeometry(0.1, levelHeight * levels, 0.1);

    const zStart = (-slots * width) / 2 + width / 2;

    for (let slot = 0; slot < slots; slot++) {
      const z = zStart + slot * width;

      const postFL = new THREE.Mesh(postGeo, frameMat);
      postFL.position.set(
        -depth / 2,
        (levelHeight * levels) / 2,
        z - width / 2 + 0.1,
      );
      postFL.castShadow = true;
      rackGroup.add(postFL);

      const postFR = new THREE.Mesh(postGeo, frameMat);
      postFR.position.set(
        depth / 2,
        (levelHeight * levels) / 2,
        z - width / 2 + 0.1,
      );
      postFR.castShadow = true;
      rackGroup.add(postFR);

      const postBL = new THREE.Mesh(postGeo, frameMat);
      postBL.position.set(
        -depth / 2,
        (levelHeight * levels) / 2,
        z + width / 2 - 0.1,
      );
      postBL.castShadow = true;
      rackGroup.add(postBL);

      const postBR = new THREE.Mesh(postGeo, frameMat);
      postBR.position.set(
        depth / 2,
        (levelHeight * levels) / 2,
        z + width / 2 - 0.1,
      );
      postBR.castShadow = true;
      rackGroup.add(postBR);
    }

    for (let level = 0; level <= levels; level++) {
      const y = level * levelHeight;
      const shelfGeo = new THREE.BoxGeometry(
        depth - 0.1,
        0.06,
        slots * width - 0.2,
      );
      const shelf = new THREE.Mesh(shelfGeo, shelfMat);
      shelf.position.y = y;
      shelf.receiveShadow = true;
      rackGroup.add(shelf);
    }

    const rackLabelCanvas = document.createElement("canvas");
    rackLabelCanvas.width = 128;
    rackLabelCanvas.height = 32;
    const ctx = rackLabelCanvas.getContext("2d");
    ctx.fillStyle = "rgba(56, 189, 248, 0.9)";
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${rackIndex + 1}排`, 64, 16);

    const labelTex = new THREE.CanvasTexture(rackLabelCanvas);
    const labelMat = new THREE.SpriteMaterial({
      map: labelTex,
      transparent: true,
    });
    const labelSprite = new THREE.Sprite(labelMat);
    labelSprite.position.set(0, levelHeight * levels + 0.5, 0);
    labelSprite.scale.set(2, 0.5, 1);
    rackGroup.add(labelSprite);

    this.scene.add(rackGroup);
  }

  setSensors(sensors) {
    this.sensors = sensors;
    this.filteredSensorIds = new Set(sensors.map((s) => s.id));

    this.sensorMeshes.forEach((mesh) => this.scene.remove(mesh));
    this.sensorMeshes = [];

    const {
      rackRows,
      slotsPerRow,
      aisleWidth,
      rackWidth,
      rackDepth,
      levelHeight,
    } = CONFIG.warehouse;
    const totalWidth =
      rackRows * rackDepth + (rackRows - 1) * aisleWidth + rackDepth;
    const startX = -totalWidth / 2 + rackDepth / 2;
    const zStart = (-slotsPerRow * rackWidth) / 2 + rackWidth / 2;

    sensors.forEach((sensor, index) => {
      const x = startX + sensor.rack * (rackDepth + aisleWidth);
      const y = sensor.level * levelHeight + levelHeight / 2;
      const z = zStart + sensor.slot * rackWidth;

      const geometry = new THREE.SphereGeometry(0.15, 16, 16);
      const material = new THREE.MeshStandardMaterial({
        color: this._getSensorColor(sensor),
        emissive: this._getSensorColor(sensor),
        emissiveIntensity: 0.3,
        roughness: 0.3,
        metalness: 0.7,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.userData.sensorIndex = index;
      mesh.userData.sensorId = sensor.id;

      const ringGeo = new THREE.RingGeometry(0.2, 0.25, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -y + 0.02;
      mesh.add(ring);
      mesh.userData.ring = ring;

      this.scene.add(mesh);
      this.sensorMeshes.push(mesh);
    });

    this._updateVisibility();
  }

  _getSensorColor(sensor) {
    const status = getStatusFromReading(sensor);

    if (status === "offline") {
      return CONFIG.statusColors.offline;
    }

    switch (this.colorMode) {
      case "temperature":
        return getTemperatureColor(
          sensor.currentReading.temperature,
          sensor.productType,
        );
      case "humidity":
        return getHumidityColor(sensor.currentReading.humidity);
      case "battery":
        return getBatteryColor(sensor.battery);
      default:
        return CONFIG.statusColors.normal;
    }
  }

  setColorMode(mode) {
    this.colorMode = mode;
    this._updateColors();
  }

  _updateColors() {
    this.sensorMeshes.forEach((mesh, index) => {
      const sensor = this.sensors[index];
      const color = this._getSensorColor(sensor);
      mesh.material.color.setHex(color);
      mesh.material.emissive.setHex(color);
    });
  }

  setFilter(filteredIds, heatmapCellFilter = null) {
    this.filteredSensorIds = new Set(filteredIds);
    this.heatmapCellFilter = heatmapCellFilter;
    this._updateVisibility();
  }

  _updateVisibility() {
    this.sensorMeshes.forEach((mesh, index) => {
      const sensor = this.sensors[index];
      const visible = this.filteredSensorIds.has(sensor.id);
      mesh.visible = visible;
    });
  }

  focusOnSensor(sensorId) {
    const mesh = this.sensorMeshes.find(
      (m) => m.userData.sensorId === sensorId,
    );
    if (!mesh) return;

    const targetPos = mesh.position.clone();

    const offset = new THREE.Vector3(3, 2, 3);
    const newCamPos = targetPos.clone().add(offset);

    const startPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    const duration = 800;
    const startTime = Date.now();

    const animateCamera = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);

      this.camera.position.lerpVectors(startPos, newCamPos, eased);
      this.controls.target.lerpVectors(startTarget, targetPos, eased);
      this.controls.update();

      if (t < 1) {
        requestAnimationFrame(animateCamera);
      }
    };

    animateCamera();

    this._highlightMesh(mesh);
  }

  _highlightMesh(mesh) {
    const originalEmissive = mesh.material.emissiveIntensity;
    let flashCount = 0;
    const flashInterval = setInterval(() => {
      mesh.material.emissiveIntensity =
        flashCount % 2 === 0 ? 1.0 : originalEmissive;
      flashCount++;
      if (flashCount >= 6) {
        clearInterval(flashInterval);
        mesh.material.emissiveIntensity = originalEmissive;
      }
    }, 150);
  }

  _onResize() {
    const container = this.canvas.parentElement;
    const width = container.clientWidth;
    const height = container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  _onClick(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const visibleMeshes = this.sensorMeshes.filter((m) => m.visible);
    const intersects = this.raycaster.intersectObjects(visibleMeshes);

    if (intersects.length > 0) {
      const mesh = intersects[0].object;
      const sensorIndex = mesh.userData.sensorIndex;
      if (this.onSensorClick && this.sensors[sensorIndex]) {
        this.onSensorClick(this.sensors[sensorIndex]);
      }
    }
  }

  _onMouseMove(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const visibleMeshes = this.sensorMeshes.filter((m) => m.visible);
    const intersects = this.raycaster.intersectObjects(visibleMeshes);

    if (this.hoveredMesh) {
      this.hoveredMesh.scale.set(1, 1, 1);
      if (this.hoveredMesh.userData.ring) {
        this.hoveredMesh.userData.ring.material.opacity = 0;
      }
      this.hoveredMesh = null;
    }

    if (intersects.length > 0) {
      this.hoveredMesh = intersects[0].object;
      this.hoveredMesh.scale.set(1.3, 1.3, 1.3);
      if (this.hoveredMesh.userData.ring) {
        this.hoveredMesh.userData.ring.material.opacity = 0.8;
      }
      this.canvas.style.cursor = "pointer";
    } else {
      this.canvas.style.cursor = "grab";
    }
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    this.controls.update();

    const time = Date.now() * 0.001;
    this.sensorMeshes.forEach((mesh, index) => {
      if (mesh.visible) {
        const sensor = this.sensors[index];
        const status = getStatusFromReading(sensor);
        if (status !== "offline") {
          mesh.position.y += Math.sin(time * 2 + index * 0.5) * 0.002;
        }
      }
    });

    this.renderer.render(this.scene, this.camera);
  }

  getSensorWorldPosition(sensorId) {
    const mesh = this.sensorMeshes.find(
      (m) => m.userData.sensorId === sensorId,
    );
    if (mesh) {
      return mesh.position.clone();
    }
    return null;
  }
}
