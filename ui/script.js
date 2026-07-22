let currentSessionId = null;
let cachedX = null, cachedY = null, cachedZ = null;
let cachedR = null, cachedG = null, cachedB = null; // Menyimpan RGB Asli
let cachedClassification = null; // Menyimpan hasil kelas (0, 1, 2)

// 1. Auto-upload and show Original point cloud on file selection
document.getElementById('lasFile').addEventListener('change', async function() {
    if (!this.files.length) return;

    const formData = new FormData();
    formData.append('file', this.files[0]);

    showStatus("Extracting Original RGB point cloud...", "info");
    document.getElementById('classifyBtn').disabled = true;
    document.getElementById('toggleRGB').disabled = true;
    document.getElementById('loadingSpinner').classList.remove('d-none');
    
    Plotly.purge('plotOrig');
    Plotly.purge('plotClassified');

    try {
        const response = await fetch('/preview', { method: 'POST', body: formData });
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error);

        currentSessionId = data.session_id;
        cachedX = data.x; cachedY = data.y; cachedZ = data.z;
        cachedR = data.r; cachedG = data.g; cachedB = data.b; // Simpan memori RGB Asli

        showStatus(`Preview generated. Ready to classify!`, "success");

        // Render Left Panel
        renderOriginalPlot('plotOrig', data.x, data.y, data.z, getRgbColors(data.r, data.g, data.b));
        
        document.getElementById('classifyBtn').disabled = false;
    } catch (err) {
        showStatus(`Error: ${err.message}`, "danger");
    } finally {
        document.getElementById('loadingSpinner').classList.add('d-none');
    }
});

// 2. Classify points when button clicked
async function runClassification() {
    if (!currentSessionId) return;

    const formData = new FormData();
    formData.append('session_id', currentSessionId);
    
    const customModel = document.getElementById('customModel').files[0];
    if (customModel) formData.append('model', customModel);

    showStatus("Running XGBoost Classification...", "info");
    document.getElementById('classifyBtn').disabled = true;
    document.getElementById('loadingSpinner').classList.remove('d-none');

    const startTime = performance.now();

    try {
        const response = await fetch('/classify', { method: 'POST', body: formData });
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error);

        const endTime = performance.now();
        const timeTaken = ((endTime - startTime) / 1000).toFixed(2);

        const successMsg = `
            Classification complete! Classification time: <strong>${timeTaken} seconds</strong>.<br>
            💡 <strong>Tip:</strong> Click on a legend to hide/show it, and double-click to isolate. Use the <strong>Show RGB</strong> toggle to view their true colors!
        `;
        showStatus(successMsg, "success");

        cachedClassification = data.classification;
        
        // Render Right Panel (Default: Gunakan Warna Kelas)
        document.getElementById('toggleRGB').disabled = false;
        document.getElementById('toggleRGB').checked = false;
        renderClassifiedPlot('plotClassified', cachedX, cachedY, cachedZ, cachedClassification, false);
        
        syncCameras();

        document.getElementById('replayBtn').classList.remove('d-none');
    } catch (err) {
        showStatus(`Error: ${err.message}`, "danger");
    } finally {
        document.getElementById('classifyBtn').disabled = false;
        document.getElementById('loadingSpinner').classList.add('d-none');
    }
}

// ==========================================
// EVENT LISTENER UNTUK TOGGLE SWITCH RGB
// ==========================================
document.getElementById('toggleRGB').addEventListener('change', function(e) {
    if (!cachedClassification) return;
    const useRGB = e.target.checked;
    // Menggunakan Plotly.react agar rotasi kamera tidak kereset saat berganti warna
    renderClassifiedPlot('plotClassified', cachedX, cachedY, cachedZ, cachedClassification, useRGB);
});

// 3. Render Original
function renderOriginalPlot(containerId, x, y, z, colors) {
    const trace = {
        x: x, y: y, z: z, mode: 'markers',
        marker: { size: 2, color: colors },
        type: 'scatter3d', name: 'Original'
    };
    Plotly.newPlot(containerId, [trace], getBaseLayout(), { responsive: true });
}

// 4. Render Classified (Sekarang Menerima Opsi useRgb)
function renderClassifiedPlot(containerId, x, y, z, classes, useRgb) {
    const traces = [];
    const groups = {
        0: { name: 'Ground', color: '#8B4513', x:[], y:[], z:[], rgb:[] },
        1: { name: 'Vegetation', color: '#228B22', x:[], y:[], z:[], rgb:[] },
        2: { name: 'Building', color: '#DC143C', x:[], y:[], z:[], rgb:[] }
    };

    // Pisahkan titik dan warna ke dalam grupnya
    classes.forEach((c, i) => {
        if (groups[c]) {
            groups[c].x.push(x[i]);
            groups[c].y.push(y[i]);
            groups[c].z.push(z[i]);
            // Format RGB string untuk masing-masing titik
            groups[c].rgb.push(`rgb(${Math.round(cachedR[i])}, ${Math.round(cachedG[i])}, ${Math.round(cachedB[i])})`);
        }
    });

    for (const key in groups) {
        if (groups[key].x.length > 0) {
            traces.push({
                x: groups[key].x, y: groups[key].y, z: groups[key].z,
                mode: 'markers',
                marker: { 
                    size: 2, 
                    // Trik Cerdas: Berikan warna array RGB jika toggle menyala, atau hex kelas tunggal jika mati.
                    color: useRgb ? groups[key].rgb : groups[key].color 
                },
                type: 'scatter3d',
                name: groups[key].name
            });
        }
    }

    const layout = getBaseLayout();
    layout.showlegend = true;
    layout.legend = { 
        x: 0.8, 
        y: 0.9, 
        bgcolor: 'rgba(255,255,255,0.8)',
        itemsizing: 'constant',
        font: { size: 14 }
    };

    // Mempertahankan posisi kamera jika sebelumnya sudah dirender
    const existingPlot = document.getElementById(containerId);
    if (existingPlot && existingPlot._fullLayout && existingPlot._fullLayout.scene) {
        layout.scene.camera = existingPlot._fullLayout.scene.camera;
    }

    // Menggunakan Plotly.react agar pergantian warna instan tanpa berkedip
    Plotly.react(containerId, traces, layout, { responsive: true });
}

function getBaseLayout() {
    return {
        margin: { l: 0, r: 0, b: 0, t: 0 },
        scene: {
            xaxis: { visible: false }, yaxis: { visible: false }, zaxis: { visible: false },
            aspectmode: 'data'
        }
    };
}

// 5. Camera Synchronization Logic
function syncCameras() {
    const plotOrig = document.getElementById('plotOrig');
    const plotClassified = document.getElementById('plotClassified');
    let isSyncing = false;

    plotOrig.on('plotly_relayout', (event) => {
        if (isSyncing || !event['scene.camera']) return;
        isSyncing = true;
        Plotly.relayout(plotClassified, { 'scene.camera': event['scene.camera'] })
            .then(() => isSyncing = false);
    });

    plotClassified.on('plotly_relayout', (event) => {
        if (isSyncing || !event['scene.camera']) return;
        isSyncing = true;
        Plotly.relayout(plotOrig, { 'scene.camera': event['scene.camera'] })
            .then(() => isSyncing = false);
    });
}

function getRgbColors(r, g, b) {
    return r.map((rv, i) => `rgb(${Math.round(rv)}, ${Math.round(g[i])}, ${Math.round(b[i])})`);
}

function resetApp() {
    document.getElementById('lasFile').value = '';
    document.getElementById('statusMessage').className = 'alert d-none';
    document.getElementById('replayBtn').classList.add('d-none');
    document.getElementById('classifyBtn').disabled = true;
    document.getElementById('customModel').value = '';
    
    // Reset toggle
    const toggleBtn = document.getElementById('toggleRGB');
    toggleBtn.checked = false;
    toggleBtn.disabled = true;
    
    Plotly.purge('plotOrig');
    Plotly.purge('plotClassified');
    
    currentSessionId = null;
    cachedX = null; cachedY = null; cachedZ = null;
    cachedR = null; cachedG = null; cachedB = null;
    cachedClassification = null;
}

function showStatus(text, type) {
    const statusDiv = document.getElementById('statusMessage');
    statusDiv.className = `alert alert-${type} mt-3 mb-0`;
    statusDiv.innerHTML = text;
}