# ctfd-helper
Alternative web client interface for Capture The Flags events. It stores in local the challenges, flags submitted, etc.

## Installation
```bash
# Minimal requirement: make sure you have Flask
apt install python3-pip git
pip install Flask requests --break-system-packages # (or use python -m venv ctfd-helper)

# Fetch the code
git clone https://github.com/Amodio/ctfd-helper.git
cd ctfd-helper/

# For building the javascript/HTML source code (with rollup)
apt install npm rollup
npm i
```

## Usage
This will run a web server and launch your browser on it (http://127.0.0.1:5000):
```bash
npm run build # required after cloning and each time JS/HTML source code is changed
./ctfd-helper.py
```

## Notes
The final aim is to provide an interface for CTFd that would solve some challenges by itself.

No automation in that regard is implemented yet, stay tuned :)
Any help will be appreciated as the task is huge.

Backend is powered by Python3/Flask, frontend by [Lit](https://lit.dev) (packed with rollup).
