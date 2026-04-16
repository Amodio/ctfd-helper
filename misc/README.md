To test ctfd-helper, you can use it against a local CTFd.

### Dump Hackropole challenges

```bash
./dump_hackropole.py
```

### Launch/setup CTFd instance

```bash
git clone https://github.com/CTFd/CTFd.git
cp -rf hashed_flags/ CTFd/CTFd/plugins/ # We only have the sha256 of the flags
docker compose --project-directory CTFd/ up -d && ./ctfd_setup.sh
```

### Challenge injection

```bash
./import_hackropole.py --year 2025
```

### Cleanup

```bash
docker compose --project-directory CTFd/ down && sudo rm -rf CTFd/.data/
```
