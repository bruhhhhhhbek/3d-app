import "@app/css/main.css";

export async function upload() {
  const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

  // Страница
  document.body.innerHTML = `
    <div class="page">
      <header class="topbar">
        <h1>3D Upload</h1>
        <nav>
          <a href="/">Home</a>
          <a href="/assets">Assets</a>
          <button id="logout-btn" class="btn" style="display:none;">Logout</button>
        </nav>
      </header>

      <main class="center">
        <div id="g_id_signin"></div>
        <p id="user-info"></p>
        <div id="upload-section" style="display:none;">
          <button id="bigbtn" class="btn">Upload 3D Model</button>
        </div>
        <div id="result"></div>
      </main>

      <!-- Modal -->
      <div id="modal" class="modal" style="display:none;">
        <div class="modal-content">
          <h2>Upload Model</h2>

          <label>Name:</label>
          <input type="text" id="model-name" placeholder="Enter model name" />

          <label>Description:</label>
          <textarea id="model-description" placeholder="Enter description"></textarea>

          <input id="file-input" type="file" accept=".glb,.gltf" style="display:none;" />
          <button id="select-file" class="btn-secondary">Choose File</button>
          <span id="file-name" style="font-size:0.9em;color:#aaa;"></span>

          <div class="modal-actions">
            <button id="submit-upload" class="btn">Upload</button>
            <button id="close-modal" class="btn-secondary">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // === Стили ===
  const style = document.createElement("style");
  style.innerHTML = `
    .modal { position: fixed; inset: 0; background: rgba(0,0,0,0.6);
      display: flex; align-items: center; justify-content: center;
      animation: fadeIn 0.3s ease; }
    .modal-content {
      background: #111; color: #fff;
      padding: 20px; border-radius: 12px;
      width: 360px; display: flex; flex-direction: column; gap: 10px;
      box-shadow: 0 0 20px rgba(255,255,0,0.3);
      animation: scaleIn 0.25s ease;
    }
    .modal-actions { display: flex; justify-content: space-between; margin-top: 10px; }
    .btn-secondary { background: #555; color: #fff; padding: 6px 12px; border-radius: 8px; border: none; cursor: pointer; }
    textarea { resize: none; height: 60px; }
    input, textarea { background: #222; color: #fff; border: 1px solid #333; border-radius: 8px; padding: 6px; }
    @keyframes fadeIn { from {opacity: 0;} to {opacity: 1;} }
    @keyframes scaleIn { from {transform: scale(0.9);} to {transform: scale(1);} }
  `;
  document.head.appendChild(style);

  // === Проверяем авторизацию ===
  await checkAuth();

  const modal = document.getElementById("modal");
  const openBtn = document.getElementById("bigbtn");
  const closeBtn = document.getElementById("close-modal");
  const uploadBtn = document.getElementById("submit-upload");
  const result = document.getElementById("result");
  const fileInput = document.getElementById("file-input");
  const selectFileBtn = document.getElementById("select-file");
  const fileNameSpan = document.getElementById("file-name");

  selectFileBtn.onclick = () => fileInput.click();
  fileInput.onchange = () => {
    fileNameSpan.textContent = fileInput.files[0]
      ? `Selected: ${fileInput.files[0].name}`
      : "";
  };

  openBtn.onclick = () => (modal.style.display = "flex");
  closeBtn.onclick = () => (modal.style.display = "none");

  // === Загрузка файла ===
  uploadBtn.onclick = async () => {
    const file = fileInput.files[0];
    const name = document.getElementById("model-name").value.trim();
    const description = document.getElementById("model-description").value.trim();

    if (!file || !name) {
      alert("Please fill all fields and select a file.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file, file.name);
    formData.append("name", name);
    formData.append("description", description);

    const response = await fetch(API_URL + "/upload", {
      method: "POST",
      credentials: "include",
      body: formData,
    });

    if (response.ok) {
      const json = await response.json();
      modal.style.display = "none";
      result.innerHTML = `✅ Uploaded! <a href="/${json.resource_path}" target="_blank">View model</a>`;
    } else {
      result.textContent = "❌ Upload failed.";
    }
  };

  // === Logout ===
  const logoutBtn = document.getElementById("logout-btn");
  logoutBtn.onclick = async () => {
    await fetch(API_URL + "/auth/logout", { method: "POST", credentials: "include" });
    document.getElementById("user-info").textContent = "";
    document.getElementById("upload-section").style.display = "none";
    document.getElementById("logout-btn").style.display = "none";
    document.getElementById("g_id_signin").style.display = "block";
    google.accounts.id.disableAutoSelect();
  };

  // === Google Sign-In ===
  if (window.google && GOOGLE_CLIENT_ID) {
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
    });
    google.accounts.id.renderButton(document.getElementById("g_id_signin"), {
      theme: "outline",
      size: "large",
    });
  }

  async function handleCredentialResponse({ credential: token }) {
    const response = await fetch(API_URL + "/auth/google", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (response.ok) {
      const json = await response.json();
      document.getElementById("user-info").textContent = `Signed in: ${json.name}`;
      document.getElementById("upload-section").style.display = "block";
      document.getElementById("g_id_signin").style.display = "none";
      document.getElementById("logout-btn").style.display = "inline-block";
    }
  }

  async function checkAuth() {
    const res = await fetch(API_URL + "/auth/me", { credentials: "include" });
    if (res.ok) {
      const json = await res.json();
      if (json.authorized) {
        document.getElementById("user-info").textContent = `✅ Signed in: ${json.email}`;
        document.getElementById("upload-section").style.display = "block";
        document.getElementById("g_id_signin").style.display = "none";
        document.getElementById("logout-btn").style.display = "inline-block";
      }
    }
  }
}
