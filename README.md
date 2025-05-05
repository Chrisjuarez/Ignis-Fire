# Ignis AI - Complete Setup & Run Guide

Welcome! This guide will walk you through setting up Ignis AI from scratch on a fresh machine.

This README ensures you can spin up both services locally, on **macOS**, **Linux**, or **Windows (VSCode)**, without surprises.

---
## Prerequisites

1. **Git**
2. **Node.js** LTS **v16.x–v18.x** & **npm** (v8+)
   ```bash
   node --version   # expect v16.x or v18.x
   npm --version
   ```
3. **Python 3.11+**
   ```bash
   python --version # expect 3.11.x
   ```
4. **MongoDB** (local or Atlas)

---
Before you begin, make sure you have these installed on your machine:

1. **Git**
   - macOS/Linux: usually pre-installed. If not, install via your package manager (e.g. `brew install git`).
   - Windows: download & install from https://git-scm.com/downloads.

2. **Node.js & npm**
   - Download the **LTS** installer from https://nodejs.org and follow the prompts.
   - Verify:
     ```bash
     node --version   # expect v16.x or v18.x LTS
     npm --version    # expect v8.x+
     ```

3. **Python 3.11+**
   - Download from https://www.python.org/downloads/ and install (ensure "Add to PATH" on Windows).
   - Verify:
     ```bash
     python --version # expect 3.11.x
     ```

4. **MongoDB Community Server** (for local development)
   - **macOS (Homebrew)**:
     ```bash
     brew tap mongodb/brew
     brew install mongodb-community@6.0
     brew services start mongodb-community@6.0
     ```
   - **Windows**:
     - Download the MSI installer from https://www.mongodb.com/try/download/community and install as a service.
   - **Linux (Ubuntu/Debian)**:
     ```bash
     sudo apt update
     sudo apt install -y mongodb
     sudo systemctl enable --now mongodb
     ```
   - Verify:
     ```bash
     mongo --eval "db.runCommand({ connectionStatus: 1 })"
     ```

5. **MongoDB Compass** (optional)
   - GUI for MongoDB: download from https://www.mongodb.com/products/compass if you prefer a visual database explorer.

---

## 1. Clone the Repo

```bash
# Any terminal (macOS, Linux, Windows PowerShell or VSCode)
git clone https://github.com/your-org/ignis-ai.git
cd ignis-ai
```  
You should have:
```
ignis-ai-backend/
ignis-ai-frontend/
```

---
## 2. Backend & ML Setup

### 2.1 Install Backend Dependencies (Node)

```bash
cd ignis-ai-backend
npm install
```  
> **Same** on macOS, Linux, or VSCode terminal in Windows.

### 2.2 **Create & Configure `.env`**

We default to `PORT=5000`, but on macOS, port 5000 is often in use, so you can change it to `5001`.

### **Create .env File**

**macOS/Linux:**
```bash
cd ignis-ai-backend
touch .env
```

**Windows (PowerShell):**
```powershell
cd ignis-ai-backend
New-Item .env -ItemType File
```

### **Edit .env File**

Open `.env` in your code editor and add the following lines:

```
# On macOS, default to 5001 due to 5000 often being in use
PORT=5001
MONGODB_URI=<your MongoDB URI>
NASA_API_KEY=<your NASA FIRMS API key>
MAPBOX_ACCESS_TOKEN=<your Mapbox secret token>
```

### 2.3 Python Virtual Environment & ML Dependencies

Navigate into the ML folder and create a venv:

#### macOS / Linux
```bash
cd ml
python3 -m venv venv              # create a virtual environment
source venv/bin/activate          # activate venv
pip install tensorflow scikit-learn pandas numpy joblib tqdm requests   # install all required Python packages
# Once you're done working in this environment, run:
deactivate                         # exit the virtual environment
```

#### Windows (PowerShell / VSCode)
```powershell
cd ml
python -m venv venv               # create a virtual environment
.env\Scripts\Activate.ps1    # activate venv
pip install tensorflow scikit-learn pandas numpy joblib tqdm requests
# Once you're done, run:
deactivate                         # exit the virtual environment
```

Note: **`deactivate`** simply returns your shell to its original state; only use it when you want to stop using the venv.

### 2.4 Pre‑trained Model Files

Copy (or confirm) these into `ignis-ai-backend/ml/`:
```
wildfire_spread_classifier_advanced.joblib
wildfire_spread_regressor_advanced.joblib
```
We **do not** commit the large TFRecord training files.

### 2.5 Start the Backend Server

Make sure the Python path used in `predictfirespread.js` is aligned with your venv location (e.g., `./ml/venv/bin/python` or `./ml/venv/Scripts/python.exe`).

Then run:
```bash
npm start
```  
Verify you see:
```
Server started on port 5001
MongoDB connected successfully
```

---
## 3. Frontend Setup (React + Mapbox)

Open a **new** terminal/tab:

```bash
cd ignis-ai-frontend
npm install
touch .env  # or create manually on Windows
```  
In `.env`, set:
```ini
REACT_APP_MAPBOX_TOKEN=<your Mapbox public token>
REACT_APP_API_BASE_URL=http://localhost:5001/api
```

Also ensure `api.js` reflects the same port (5001):
```javascript
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:5001/api";
```

Then launch:
```bash
npm start
```  
App runs at **http://localhost:3000** (API calls proxy to `http://localhost:5001/api`).

---
## 4. (Optional) Retrain ML Models

If you want to retrain on Kaggle’s TFRecords:

1. Place TFRecords under `ignis-ai-backend/ml/data/`
2. Activate your Python venv (see 2.2)
3. Run:
   ```bash
   python process_data_dual.py       # extract features
   python train_classifier_advanced.py  # train classifier
   python train_regressor_advanced.py   # train regressor
   ```  
4. New `*.joblib` files will replace the ones in `ml/`.

---
## 5. Verify Everything Works

- **Backend API**: visit `http://localhost:5001/api/wildfires` → JSON of current fires
- **Frontend Map**: visit `http://localhost:3000` → Map with fire markers; click one and hit “Predict Fire Spread”

---

---
## 🔧 Python Path for Spawn (Backend - `predictfirespread.js`)

Make sure the `pythonPath` used in `ignis-ai-backend/routes/predictfirespread.js` matches your environment setup.

🪟 **For Windows**:
```js
const python = 'ml\venv\Scripts\python.exe';
```

🍎 **For macOS (with venv)**:
```js
const python = 'ml/venv/bin/python3';
```

If using **system Python** (without venv):
```js
const python = 'python3';
```

🐧 **For Linux**:
```js
const python = 'python3';
```


🎉 Our Ignis AI app is now running locally, ready to detect and predict wildfire spread with a single `npm start` for each service.
