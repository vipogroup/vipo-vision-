# motor_probe Makefile — Cross-compile for Ingenic T23 (MIPS32 little-endian)
#
# Option 1: WSL/Linux with mipsel toolchain
#   sudo apt install gcc-mipsel-linux-gnu
#   make
#
# Option 2: Bootlin toolchain (download from bootlin.com)
#   CROSS=path/to/mipsel-buildroot-linux-uclibc-gcc make
#

CROSS ?= mipsel-linux-gnu-gcc
CFLAGS = -static -Os -Wall -mips32
TARGET = motor_probe

all: $(TARGET)

$(TARGET): motor_probe.c
	$(CROSS) $(CFLAGS) -o $(TARGET) motor_probe.c
	@echo "Built: $(TARGET)"
	@file $(TARGET) 2>/dev/null || true
	@ls -la $(TARGET)

clean:
	rm -f $(TARGET)

# Base64 encode for Telnet upload
b64: $(TARGET)
	base64 $(TARGET) > $(TARGET).b64
	@echo "Base64 file: $(TARGET).b64 ($$(wc -c < $(TARGET).b64) bytes)"

.PHONY: all clean b64
