# ctfd-helper/windows_builder
Docker image to build a Windows .EXE from Python on GNU/Linux.
Do not run these commands here but at the root of the project.

## Build
```bash
docker build -t ctfd-helper/windows_builder windows_builder/
```

## Run
```bash
docker run --rm -it -v "$(pwd):/mnt" --name windows_builder ctfd-helper/windows_builder
```
