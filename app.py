import os
import tempfile
import pickle
import numpy as np
import xgboost as xgb
import laspy
from flask import Flask, render_template, request, jsonify

app = Flask(__name__, static_folder='ui', static_url_path='/ui')

MODEL_PATH = os.path.join("model", "xgb_best.pkl")
model = None
if os.path.exists(MODEL_PATH):
    with open(MODEL_PATH, "rb") as f:
        model = pickle.load(f)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/predict", methods=["POST"])
def predict():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded."}), 400
    
    file = request.files["file"]
    if not file.filename.lower().endswith((".las", ".laz")):
        return jsonify({"error": "Invalid file format. Please upload .las or .laz"}), 400

    if model is None:
        return jsonify({"error": f"Model not found at {MODEL_PATH}"}), 500

    temp_in = tempfile.NamedTemporaryFile(delete=False, suffix=".las")
    file.save(temp_in.name)
    temp_in.close()

    try:
        las = laspy.read(temp_in.name)
        x = np.array(las.x, dtype=np.float64)
        y = np.array(las.y, dtype=np.float64)
        z = np.array(las.z, dtype=np.float64)

        try:
            r = np.array(las.red, dtype=np.float32)
            g = np.array(las.green, dtype=np.float32)
            b = np.array(las.blue, dtype=np.float32)
        except AttributeError:
            r = g = b = np.zeros_like(x, dtype=np.float32)

        # Feature extraction
        X_features = np.column_stack((x, y, z, r, g, b))
        dtest = xgb.DMatrix(X_features)
        Y_pred_raw = model.predict(dtest)

        if len(Y_pred_raw.shape) > 1 and Y_pred_raw.shape[1] > 1:
            Y_pred = np.argmax(Y_pred_raw, axis=1)
        else:
            Y_pred = Y_pred_raw

        # Subsample for browser preview
        MAX_PREVIEW_PTS = 50000  # Raised capacity now that precision jitter is fixed
        total_pts = len(x)
        if total_pts > MAX_PREVIEW_PTS:
            idx = np.random.choice(total_pts, MAX_PREVIEW_PTS, replace=False)
            x_sub, y_sub, z_sub = x[idx], y[idx], z[idx]
            r_sub, g_sub, b_sub = r[idx], g[idx], b[idx]
            pred_sub = Y_pred[idx]
        else:
            x_sub, y_sub, z_sub = x, y, z
            r_sub, g_sub, b_sub = r, g, b
            pred_sub = Y_pred

        # --- UTM PRECISION FIX ---
        # Re-center coordinates around (0,0,0) to prevent WebGL 32-bit float quantization
        x_vis = (x_sub - np.min(x_sub)).tolist()
        y_vis = (y_sub - np.min(y_sub)).tolist()
        z_vis = (z_sub - np.min(z_sub)).tolist()

        if np.max(r_sub) > 255:
            r_sub, g_sub, b_sub = r_sub / 256.0, g_sub / 256.0, b_sub / 256.0

        return jsonify({
            "total_points": total_pts,
            "preview_points": len(x_sub),
            "x": x_vis,
            "y": y_vis,
            "z": z_vis,
            "r": r_sub.tolist(),
            "g": g_sub.tolist(),
            "b": b_sub.tolist(),
            "classification": pred_sub.tolist()
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        if os.path.exists(temp_in.name):
            os.remove(temp_in.name)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)