import "@app/css/main.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader";
import { upload } from "./upload";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

handleRoutes();

async function handleRoutes() {
  const { pathname } = window.location;

  if (pathname === "/") return renderHome();
  if (pathname === "/assets") return await renderAssets();
  if (pathname === "/upload") return upload();

  // Если это ID модели
  const fileID = pathname.substring(1);
  const response = await fetch(`${API_URL}/view/${fileID}`);

  if (response.ok) {
    const arrayBuffer = await response.arrayBuffer();
    run({ arrayBuffer });
  } else {
    document.body.innerHTML = `<div class="page center"><h2>Файл не найден</h2></div>`;
  }
}

// ------------------- HOME -------------------
function renderHome() {
  document.body.innerHTML = `
    <div class="page">
      <header class="topbar">
        <h1>3D Hub</h1>
        <nav>
          <a href="/">Home</a>
          <a href="/assets">Assets</a>
          <a href="/upload">Upload</a>
        </nav>
      </header>
      <main class="center">
        <h2>Загрузите и просматривайте 3D модели</h2>
      </main>
    </div>
  `;
}

// ------------------- ASSETS -------------------
async function renderAssets() {
  const res = await fetch(`${API_URL}/assets`);
  const assets = await res.json();

  document.body.innerHTML = `
    <div class="page">
      <header class="topbar">
        <h1>Assets</h1>
        <nav>
          <a href="/">Home</a>
          <a href="/upload">Upload</a>
        </nav>
      </header>
      <main class="content">
        <div class="asset-grid"></div>
      </main>
    </div>
  `;

  const grid = document.querySelector(".asset-grid");

  grid.innerHTML = assets
    .map(a => {
      // аккуратная сборка путей
      const qrSrc = a.qr_path
  ? `${API_URL}/${a.qr_path.replace(/^\/?uploads\//, '')}`
  : null;

      const modelLink = `/${a.resource_path}`;

      return `
      <div class="asset-card">
        <div class="asset-info">
          <a class="asset-title" href="${modelLink}">${a.name}</a>
          <div class="asset-desc">${a.description || "Без описания"}</div>
        </div>
        ${
          qrSrc
            ? `<img class="qr" src="${qrSrc}" alt="QR Code" loading="lazy">`
            : ""
        }
      </div>`;
    })
    .join("");

  addAssetStyles();
}

// ------------------- 3D VIEWER -------------------
async function run({ arrayBuffer }) {
  document.body.innerHTML = `<canvas id="gl"></canvas>`;
  const canvas = document.getElementById("gl");

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    10000
  );
  camera.position.set(4, 3, 6);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.8;

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // освещение
  const lights = [
    [0, 10, 0, 1.5],
    [0, -10, 0, 0.8],
    [0, 5, 10, 1.3],
    [0, 5, -10, 1.0],
    [-10, 3, 0, 1.2],
    [10, 3, 0, 1.2],
  ];
  lights.forEach(([x, y, z, i]) => {
    const light = new THREE.DirectionalLight(0xffffff, i);
    light.position.set(x, y, z);
    scene.add(light);
  });
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));

  const loader = new GLTFLoader();
  loader.parse(
    arrayBuffer,
    "",
    gltf => {
      gltf.scene.traverse(obj => {
        if (obj.isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      });
      scene.add(gltf.scene);
    },
    err => console.error("Ошибка при парсинге GLTF:", err)
  );

  (function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  })();
}

// ------------------- СТИЛИ -------------------
function addAssetStyles() {
  const style = document.createElement("style");
  style.innerHTML = `
    .asset-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
      padding: 20px;
    }
    .asset-card {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #111;
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 0 10px rgba(255, 255, 0, 0.1);
      transition: all 0.2s ease;
    }
    .asset-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 0 15px rgba(255, 255, 0, 0.25);
    }
    .asset-info {
      max-width: 70%;
    }
    .asset-title {
      font-weight: bold;
      font-size: 1.1em;
      color: #ffeb3b;
      text-decoration: none;
    }
    .asset-desc {
      margin-top: 10px;
      background: #222;
      color: #ddd;
      padding: 10px;
      border-radius: 8px;
      font-size: 0.9em;
    }
    .qr {
      width: 80px;
      height: 80px;
      border-radius: 8px;
      background: #fff;
      padding: 4px;
    }
  `;
  document.head.appendChild(style);
}
