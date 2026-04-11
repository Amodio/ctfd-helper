# ctfd-helper
Alternative web client interface for Capture The Flags events. It stores locally the challenges, flags, etc.

## Installation
### Preparation
```bash
# Minimal requirement: Python3 with Flask
apt install python3-pip
pip install Flask requests --break-system-packages # (or use python -m venv ctfd-helper)
```

### Finalization
```bash
wget https://github.com/Amodio/ctfd-helper/releases/latest/download/ctfd-helper.zip && \
unzip ctfd-helper.zip && cd ctfd-helper/
./ctfd-helper.py
```

Note: on Windows, you can also just directly use the bundled package (a bit slower): [ctfd-helper.exe](https://github.com/Amodio/ctfd-helper/releases/latest/download/ctfd-helper.exe).

## Installation for developpers
```bash
git clone https://github.com/Amodio/ctfd-helper.git
cd ctfd-helper/

# Node modules (dependencies)
apt install npm rollup
npm ci

# Required after cloning and each time JS/HTML src/ code is changed
npm run clean; npm run dev
./ctfd-helper.py
```

## Notes
If you did not unlock all the challenges, some calculations (number of challenges and scores) can differ from the scoreboard (there is none currently inside this project).

The final aim is to provide an interface for CTFd that would solve some challenges by itself.

No automation in that regard is implemented yet, stay tuned :)
Any help would be appreciated as the task is huge.

Backend is powered by Python3/Flask, frontend by [Lit](https://lit.dev) (packed with rollup).
