# ctfd-helper
Alternative web client interface for Capture The Flags events. It stores locally the challenges, flags submitted, etc.

## Installation
```bash
# Minimal requirement: Python3 with Flask
apt install python3-pip
pip install Flask requests --break-system-packages # (or use python -m venv ctfd-helper)

wget https://github.com/Amodio/ctfd-helper/releases/download/main/ctfd-helper.zip && \
unzip ctfd-helper.zip && cd ctfd-helper/
./ctfd-helper.py
```

For Windows, you can also use the bundled package (a bit slower): [ctfd-helper.exe](https://github.com/Amodio/ctfd-helper/releases/download/main/ctfd-helper.exe).

## Installation for developpers
```bash
git clone https://github.com/Amodio/ctfd-helper.git
cd ctfd-helper/

# For building the javascript/HTML source code (with rollup)
apt install npm rollup
npm ci

npm run build # required after cloning and each time JS/HTML src/ code is changed
./ctfd-helper.py
```

## Notes
If you did not unlock all the challenges, some calculations (number of challenges, etc.) can differ from the scoreboard (we do not care about it).

The final aim is to provide an interface for CTFd that would solve some challenges by itself.

No automation in that regard is implemented yet, stay tuned :)
Any help will be appreciated as the task is huge.

Backend is powered by Python3/Flask, frontend by [Lit](https://lit.dev) (packed with rollup).
