async function processFile() {
    const fileInput = document.getElementById('lasFile');
    const statusDiv = document.getElementById('statusMessage');
    const uploadBtn = document.getElementById('uploadBtn');
    const replayBtn = document.getElementById('replayBtn');
    const spinner = document.getElementById('loadingSpinner');

    if (!fileInput.files.length) {
        showStatus("Please select a .las or .laz file first.", "danger");
        return;
    }

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    showStatus("Uploading point cloud and running XGBoost classification...", "info");
    uploadBtn.disabled = true;
    spinner.classList.remove('d-none');

    try {
        const response = await fetch('/predict', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Classification failed.');
        }

        showStatus(`Successfully classified ${data.total_points.toLocaleString()} points! Rendering high-precision 3D preview...`, "success");

        // Show Reset/Replay Button
        replayBtn.classList.remove('d-none');

        // Render 3D Point Clouds
        renderPlot('plotOrig', data.x, data.y, data.z, getRgbColors(data.r, data.g, data.b));
        renderPlot('plotClassified', data.x, data.y, data.z, getClassColors(data.classification));

    } catch (err) {
        showStatus(`Error: ${err.message}`, "danger");
    } finally {
        uploadBtn.disabled = false;
        spinner.classList.add('d-none');
    }
}

function resetApp() {
    document.getElementById('lasFile').value = '';
    document.getElementById('statusMessage').className = 'alert d-none';
    document.getElementById('replayBtn').classList.add('d-none');
    
    // Purge Plotly instances
    Plotly.purge('plotOrig');
    Plotly.purge('plotClassified');
}

function showStatus(text, type) {
    const statusDiv = document.getElementById('statusMessage');
    statusDiv.className = `alert alert-${type} mt-3 mb-0`;
    statusDiv.innerText = text;
}

function getRgbColors(r, g, b) {
    return r.map((rv, i) => `rgb(${Math.round(rv)}, ${Math.round(g[i])}, ${Math.round(b[i])})`);
}

function getClassColors(classifications) {
    const colorMap = {
        0: 'rgb(139, 69, 19)',   // Ground (Brown)
        1: 'rgb(34, 139, 34)',   // Vegetation (Green)
        2: 'rgb(220, 20, 60)'    // Building (Red)
    };
    return classifications.map(c => colorMap[c] || 'rgb(128, 128, 128)');
}

function renderPlot(containerId, x, y, z, colors) {
    const trace = {
        x: x, y: y, z: z,
        mode: 'markers',
        marker: {
            size: 2,
            color: colors
        },
        type: 'scatter3d'
    };

    const layout = {
        margin: { l: 0, r: 0, b: 0, t: 0 },
        scene: {
            xaxis: { visible: false },
            yaxis: { visible: false },
            zaxis: { visible: false },
            aspectmode: 'data'
        }
    };

    Plotly.newPlot(containerId, [trace], layout, { responsive: true });
}