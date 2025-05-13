# 🔥 Ignis AI — Wildfire Detection & Spread Prediction (Executable Install)

### This folder aims to run IgnisAI locally on MacOS or Windows.
-Download Zip Folder(best to save right under ex. /Users/Chrisjuarez/Ignis-Fire)
-UnZip in same directory 
-Make sure all Prerequisites are met by testing versions
-Once Git, Node.js, Python 3.10+ are installed 
    -Press start.command (MacOS)
    -Press start.bat (windows)
-This should install the venv with dependencies for the Ml folder
-Should run both backend and frontend and load in a browser.
-IF THIS DOESNT WORK, sadly follow the instructions below. As well as the other README.md


-Open Terminal/Command Prompt to install ml dependencies under venv (ex./Users/Chrisjuarez/Ignis-Fire/ml)
-Now Run executable scripts start.bat for Windows and start.command for MacOS
-Note: .env files are provided in each frontend and backend with keys

## 📦 Project Structure

Ignis-Fire/
├── backend/              # Express server (includes ML subprocess calls)
│   └── ml/               # Python model + virtual environment
│       ├── predict_spread.py
│       ├── *.joblib      # Pre-trained ML models
│       └── requirements.txt
├── frontend/             # React web app (Mapbox visualization)
├── train/                # Jupyter notebooks (already executed)
├── start.bat             # One-click launcher for Windows
├── start.command         # One-click launcher for macOS
├── README.txt            # You’re reading it
|-- README.md             #Step by Step Manual Install(Not Executable instructions)

## ✅ Prerequisites

### 🔹 Required on **all platforms**:
- [Node.js & npm](https://nodejs.org/)
- [Python 3.10+](https://www.python.org/downloads/) with `pip`
- Internet connection (to access NASA FIRMS, Mapbox and MongoDB)
Verify:
node --version   # expect v16.x or v18.x LTS
npm --version    # expect v8.x+
Verify:
python --version # expect 3.11.x

###MongoDB does not need to be downloaded the database in in the cloud.
-Some Wifi connections make the DB connection not work.(DB is set up as whitelisted so any IP should work)

---
###TIP: After unzipping open Terminal Or Command Prompt to install ML/Model dependencies
###ML Backend Setup (Python)

-macOS / Linux
cd ml
python3 -m venv venv              # create a virtual environment
source venv/bin/activate          # activate venv
pip install tensorflow scikit-learn pandas numpy joblib tqdm requests   # install all required Python packages
or (of tensorflow fails)
pip install scikit-learn pandas numpy joblib tqdm requests

-Windows (Command Prompt/PowerShell)
cd ml
python -m venv venv               # create a virtual environment
venv\Scripts\activate  # activate venv
pip install tensorflow scikit-learn pandas numpy joblib tqdm requests
---

cd backend/ml
python -m venv venv             # or python3 on macOS
venv\Scripts\activate           # Windows
# or
source venv/bin/activate        # macOS/Linux

pip install scikit-learn pandas numpy joblib tqdm requests

---
###Now that dependencies are done lets try to run the executable 

### 💻 On Windows:
1. Double-click `start.bat`
2. Two windows will open:
   - Backend (Express server)
   - Frontend (React app)

---

### 🍎 On Mac:
1. Open Terminal
2. Run this once: `chmod +x start.command`
3. Then double-click `start.command`

cd /path/to/Ignis-Fire
chmod +x start.command
./start.command
---

### 📦 Contents:
- `frontend/`: React app (Mapbox, wildfire UI)
- `backend/`: Express API + ML model inference
- `train/`: Pre-ran Jupyter notebooks + final ML model files


### 🔧 Option 2: Run Manually in Terminal

```bash
cd backend
npm install

cd ../frontend
npm install

cd ..
start.bat
or 
start.command


### Troubleshooting Tips  
Include the most common gotchas at the bottom:

- Node/npm not found → install Node + restart terminal  
- Python not found → install Python + add to PATH  
- ML script errors → re-activate venv and reinstall  
