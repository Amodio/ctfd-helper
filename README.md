# ctfd-helper
Alternative web client interface for Capture The Flags events. It stores in local the challenge list and details, flags submitted, etc.

## Installation
```
# Minimal requirement: make sure you have Flask
apt install python3
pip install Flask requests

# Fetch the code
git clone https://github.com/Amodio/ctfd-helper.git
cd ctfd-helper/

# For building the javascript/HTML source code (with rollup)
apt install npm rollup
pip install lit
npm init -y
npm install --save lit
npm i --save-dev rollup \
  @web/rollup-plugin-html \
  @rollup/plugin-node-resolve \
  @rollup/plugin-terser \
  rollup-plugin-minify-html-literals

npm pkg set scripts.build="rollup --config"
```

## Usage
This will run a web server listening on: `http://127.0.0.1:5000`:
```
npm run build # required after cloning and each time JS/HTML source code is changed
./ctfd-helper.py
```

## Notes
The final aim is to provide an interface for CTFd that would solve some challenges by itself.

No automation in that regard is implemented yet, stay focused :)
Any help will be appreciated as the task is pretty large.

Backend is powered by Python3/Flask, frontend by [Lit](https://lit.dev) (packed with rollup).
