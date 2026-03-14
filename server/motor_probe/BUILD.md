# Building motor_probe for CloseLi Camera (Ingenic T23 MIPS32)

## Target
- SoC: Ingenic T23 (MIPS32, **little-endian**)
- Kernel: Linux 3.10.14
- Binary: Static ELF, no dependencies

## Option 1: WSL (Fastest on Windows)

```bash
# In WSL terminal:
sudo apt update
sudo apt install -y gcc-mipsel-linux-gnu

# Navigate to the source
cd /mnt/c/Users/ALFA\ DPM/CascadeProjects/vipo-vision/server/motor_probe

# Build static binary
mipsel-linux-gnu-gcc -static -Os -Wall -mips32 -o motor_probe motor_probe.c

# Verify
file motor_probe
# Expected: ELF 32-bit LSB executable, MIPS, MIPS32 version 1 (SYSV), statically linked
```

## Option 2: Docker (No WSL needed)

```bash
docker run --rm -v "%CD%:/src" -w /src debian:bullseye bash -c \
  "apt-get update && apt-get install -y gcc-mipsel-linux-gnu && \
   mipsel-linux-gnu-gcc -static -Os -Wall -mips32 -o motor_probe motor_probe.c"
```

## Option 3: Bootlin Pre-built Toolchain

1. Download from: https://toolchains.bootlin.com/
2. Select: Architecture=mips32el, Libc=uclibc, Variant=stable
3. Extract and use:
```bash
./mipsel-buildroot-linux-uclibc-gcc -static -Os -Wall -o motor_probe motor_probe.c
```

## Upload to Camera

### Method A: Local HTTP server + wget (Recommended)
```bash
# On your PC (in the motor_probe directory):
python -m http.server 8888

# On the camera via Telnet:
cd /tmp
wget http://YOUR_PC_IP:8888/motor_probe
chmod +x motor_probe
```

### Method B: Base64 via Telnet
```bash
# On your PC:
base64 motor_probe > motor_probe.b64

# Then paste the base64 content via Telnet:
# (use the upload script: telnet-upload.mjs)
```

## Running on Camera

```bash
# Probe all ioctl commands on all devices
./motor_probe probe

# Get motor status
./motor_probe status

# Run safe movement test (small steps + reverse)
./motor_probe test

# Manual move: device 0 (/dev/motor), +100 X steps, 0 Y steps
./motor_probe move 0 100 0

# Stop device 0
./motor_probe stop 0
```
