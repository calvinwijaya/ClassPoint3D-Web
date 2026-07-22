let currentSessionId = null;
let cachedX = null, cachedY = null, cachedZ = null;

// 1. Auto-upload and show Original point cloud on file selection
document.getElementById('lasFile').addEventListener('change', async function() {
    if (!this.files.length) return;

    const formData = new FormData();
    formData.append('file', this.files[0]);

    showStatus("Extracting Original RGB point cloud...", "info");
    document.getElementById('classifyBtn').disabled = true;
    document.getElementById('loadingSpinner').classList.remove('d-none');
    
    Plotly.purge('plotOrig');
    Plotly.purge('plotClassified');

    try {
        const response = await fetch('/preview', { method: 'POST', body: formData });
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error);

        currentSessionId = data.session_id;
        cachedX = data.x; cachedY = data.y; cachedZ = data.z;

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
    
    // Check for custom model
    const customModel = document.getElementById('customModel').files[0];
    if (customModel) formData.append('model', customModel);

    showStatus("Running XGBoost Classification...", "info");
    document.getElementById('classifyBtn').disabled = true;
    document.getElementById('loadingSpinner').classList.remove('d-none');

    // START TIMER
    const startTime = performance.now();

    try {
        const response = await fetch('/classify', { method: 'POST', body: formData });
        const data = await response.json();
        
        if (!response.ok) throw new Error(data.error);

        // END TIMER
        const endTime = performance.now();
        const timeTaken = ((endTime - startTime) / 1000).toFixed(2); // Convert ms to seconds with 2 decimals

        // UPDATED SUCCESS MESSAGE WITH TIMER AND TIP
        const successMsg = `
            Classification complete! Classification time: <strong>${timeTaken} seconds</strong>.<br>
            💡 <strong>Tip:</strong> Click on a class legend to hide/show it, and double-click to isolate a specific class.
        `;
        showStatus(successMsg, "success");

        // Render Right Panel with Legends
        renderClassifiedPlot('plotClassified', cachedX, cachedY, cachedZ, data.classification);
        
        // Sync the 3D interaction between both windows
        syncCameras();

        document.getElementById('replayBtn').classList.remove('d-none');
    } catch (err) {
        showStatus(`Error: ${err.message}`, "danger");
    } finally {
        document.getElementById('classifyBtn').disabled = false;
        document.getElementById('loadingSpinner').classList.add('d-none');
    }
}

// 3. Render Original
function renderOriginalPlot(containerId, x, y, z, colors) {
    const trace = {
        x: x, y: y, z: z, mode: 'markers',
        marker: { size: 2, color: colors },
        type: 'scatter3d', name: 'Original'
    };
    Plotly.newPlot(containerId, [trace], getBaseLayout(), { responsive: true });
}

// 4. Render Classified with BIGGER Legends
function renderClassifiedPlot(containerId, x, y, z, classes) {
    const traces = [];
    // Groups mapped to specific requested colors
    const groups = {
        0: { name: 'Ground', color: '#8B4513', x:[], y:[], z:[] },       // Brown
        1: { name: 'Vegetation', color: '#228B22', x:[], y:[], z:[] },   // Green
        2: { name: 'Building', color: '#DC143C', x:[], y:[], z:[] }      // Red
    };

    // Sort points into their classes
    classes.forEach((c, i) => {
        if (groups[c]) {
            groups[c].x.push(x[i]);
            groups[c].y.push(y[i]);
            groups[c].z.push(z[i]);
        }
    });

    // Create a trace for each class
    for (const key in groups) {
        if (groups[key].x.length > 0) {
            traces.push({
                x: groups[key].x, y: groups[key].y, z: groups[key].z,
                mode: 'markers',
                marker: { size: 2, color: groups[key].color },
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
        itemsizing: 'constant', // Forces the legend markers to be large
        font: { size: 14 }      // Makes the legend text a bit larger and easier to read
    };

    Plotly.newPlot(containerId, traces, layout, { responsive: true });
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
    
    Plotly.purge('plotOrig');
    Plotly.purge('plotClassified');
}

function showStatus(text, type) {
    const statusDiv = document.getElementById('statusMessage');
    statusDiv.className = `alert alert-${type} mt-3 mb-0`;
    // Changed to innerHTML so we can use <br> and <strong> tags for the tip!
    statusDiv.innerHTML = text;
}