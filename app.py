import os
import tempfile
import pickle
import uuid
import numpy as np
import xgboost as xgb
import laspy
from flask import Flask, render_template, request, jsonify

app = Flask(__name__, static_folder='ui', static_url_path='/ui')

# Store temporary data here
app.config['UPLOAD_FOLDER'] = tempfile.gettempdir()
DEFAULT_MODEL_PATH = os.path.join("model", "xgb_best.pkl")

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/preview", methods=["POST"])
def preview():
    """Reads LAS, extracts points, and returns Original RGB instantly."""
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded."}), 400

    file = request.files["file"]
    session_id = str(uuid.uuid4())
    las_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{session_id}.las")
    file.save(las_path)

    try:
        las = laspy.read(las_path)
        x = np.array(las.x, dtype=np.float64)
        y = np.array(las.y, dtype=np.float64)
        z = np.array(las.z, dtype=np.float64)

        try:
            r = np.array(las.red, dtype=np.float32)
            g = np.array(las.green, dtype=np.float32)
            b = np.array(las.blue, dtype=np.float32)
        except AttributeError:
            r = g = b = np.zeros_like(x, dtype=np.float32)

        total_pts = len(x)
        MAX_PREVIEW_PTS = 50000

        # Subsample for web preview
        if total_pts > MAX_PREVIEW_PTS:
            idx = np.random.choice(total_pts, MAX_PREVIEW_PTS, replace=False)
            x_sub, y_sub, z_sub = x[idx], y[idx], z[idx]
            r_sub, g_sub, b_sub = r[idx], g[idx], b[idx]
        else:
            x_sub, y_sub, z_sub = x, y, z
            r_sub, g_sub, b_sub = r, g, b

        # Save raw features to a fast .npy file for instant classification later
        features = np.column_stack((x_sub, y_sub, z_sub, r_sub, g_sub, b_sub))
        feat_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{session_id}_features.npy")
        np.save(feat_path, features)

        # UTM WebGL Precision Fix (Center to 0,0,0)
        x_vis = (x_sub - np.min(x_sub)).tolist()
        y_vis = (y_sub - np.min(y_sub)).tolist()
        z_vis = (z_sub - np.min(z_sub)).tolist()

        if np.max(r_sub) > 255:
            r_sub, g_sub, b_sub = r_sub / 256.0, g_sub / 256.0, b_sub / 256.0

        return jsonify({
            "session_id": session_id,
            "total_points": total_pts,
            "x": x_vis, "y": y_vis, "z": z_vis,
            "r": r_sub.tolist(), "g": g_sub.tolist(), "b": b_sub.tolist()
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if os.path.exists(las_path):
            os.remove(las_path)

@app.route("/classify", methods=["POST"])
def classify():
    """Runs XGBoost only on the subsampled preview points."""
    session_id = request.form.get("session_id")
    if not session_id:
        return jsonify({"error": "No session ID provided."}), 400

    feat_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{session_id}_features.npy")
    if not os.path.exists(feat_path):
        return jsonify({"error": "Session expired. Please upload the file again."}), 400

    model_file = request.files.get("model")
    model = None

    try:
        # 1. Load Model (Custom or Default)
        if model_file and model_file.filename.endswith('.pkl'):
            model_path = os.path.join(app.config['UPLOAD_FOLDER'], f"{session_id}_model.pkl")
            model_file.save(model_path)
            with open(model_path, "rb") as f:
                model = pickle.load(f)
            os.remove(model_path)
        else:
            if os.path.exists(DEFAULT_MODEL_PATH):
                with open(DEFAULT_MODEL_PATH, "rb") as f:
                    model = pickle.load(f)
            else:
                return jsonify({"error": "Default model not found."}), 500

        # 2. Load Features & Predict
        features = np.load(feat_path)
        dtest = xgb.DMatrix(features)
        Y_pred_raw = model.predict(dtest)

        if len(Y_pred_raw.shape) > 1 and Y_pred_raw.shape[1] > 1:
            Y_pred = np.argmax(Y_pred_raw, axis=1)
        else:
            Y_pred = Y_pred_raw

        return jsonify({"classification": Y_pred.tolist()})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)