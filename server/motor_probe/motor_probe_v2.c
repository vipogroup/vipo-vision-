/*
 * motor_probe_v2.c — Precise movement test for CloseLi camera motors
 * 
 * Target: Ingenic T23 MIPS32, Linux 3.10
 * Compile: mipsel-linux-gnu-gcc -static -Os -Wall -mips32 -o motor_probe motor_probe_v2.c
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <sys/ioctl.h>

#define MOTOR_STOP        0x1
#define MOTOR_RESET       0x2
#define MOTOR_MOVE        0x3
#define MOTOR_GET_STATUS  0x4
#define MOTOR_SPEED       0x5
#define MOTOR_GOBACK      0x6
#define MOTOR_CRUISE      0x7

struct motors_steps { int x; int y; };

/* Raw 32-byte status buffer — we'll decode manually since struct layout may differ */
typedef unsigned char status_buf_t[32];

static const char *devs[] = { "/dev/motor", "/dev/motor1", "/dev/motor2" };
#define NUM_DEVS 3

static void dump_hex(const char *prefix, const void *data, int len) {
    const unsigned char *p = (const unsigned char *)data;
    printf("%s", prefix);
    for (int i = 0; i < len; i++) printf("%02x ", p[i]);
    printf("\n");
}

static void decode_status(const char *label, status_buf_t buf) {
    int *ints = (int *)buf;
    /* Print both raw hex and interpreted int32 fields */
    printf("  %s raw: ", label);
    for (int i = 0; i < 8; i++) printf("[%d]=%d ", i, ints[i]);
    printf("\n");
    dump_hex("  hex: ", buf, 32);
}

static int get_status(int fd, status_buf_t buf) {
    memset(buf, 0, 32);
    errno = 0;
    return ioctl(fd, MOTOR_GET_STATUS, buf);
}

static int motor_move(int fd, int x, int y) {
    struct motors_steps s = { .x = x, .y = y };
    errno = 0;
    return ioctl(fd, MOTOR_MOVE, &s);
}

static int motor_stop(int fd) {
    errno = 0;
    return ioctl(fd, MOTOR_STOP, NULL);
}

static int motor_speed(int fd, int spd) {
    errno = 0;
    return ioctl(fd, MOTOR_SPEED, &spd);
}

/* ── Single micro-movement test ── */
static void test_micromove(int fd, const char *devname, int dx, int dy, int step_size) {
    status_buf_t before, after;
    int *b, *a;

    /* Get status before */
    get_status(fd, before);
    b = (int *)before;

    /* Move */
    int ret = motor_move(fd, dx, dy);
    printf("    MOVE(%+d,%+d): ret=%d errno=%d\n", dx, dy, ret, errno);

    /* Wait for movement */
    usleep(500000); /* 500ms */

    /* Stop */
    motor_stop(fd);
    usleep(200000); /* 200ms settle */

    /* Get status after */
    get_status(fd, after);
    a = (int *)after;

    /* Compare all int fields */
    printf("    BEFORE: ");
    for (int i = 0; i < 8; i++) printf("[%d]=%d ", i, b[i]);
    printf("\n");
    printf("    AFTER:  ");
    for (int i = 0; i < 8; i++) printf("[%d]=%d ", i, a[i]);
    printf("\n");

    /* Check which fields changed */
    int any_changed = 0;
    for (int i = 0; i < 8; i++) {
        if (b[i] != a[i]) {
            printf("    CHANGED: field[%d] %d → %d (delta=%d)\n", i, b[i], a[i], a[i] - b[i]);
            any_changed = 1;
        }
    }
    if (!any_changed) {
        printf("    NO CHANGE in status fields\n");
    }
    printf("\n");
}

/* ── Full device test ── */
static void test_device(int dev_idx) {
    int fd = open(devs[dev_idx], O_RDWR);
    if (fd < 0) {
        printf("  OPEN %s FAILED: errno=%d %s\n\n", devs[dev_idx], errno, strerror(errno));
        return;
    }

    printf("══════════════════════════════════════\n");
    printf("  DEVICE: %s (dev_idx=%d)\n", devs[dev_idx], dev_idx);
    printf("══════════════════════════════════════\n\n");

    /* Baseline status */
    status_buf_t baseline;
    get_status(fd, baseline);
    decode_status("BASELINE", baseline);
    printf("\n");

    /* Set safe speed */
    int ret = motor_speed(fd, 200);
    printf("  SET_SPEED(200): ret=%d errno=%d\n\n", ret, errno);

    /* ── Phase 1: ±5 steps ── */
    printf("  ── Phase 1: ±5 steps ──\n\n");

    printf("  [1a] X +5:\n");
    test_micromove(fd, devs[dev_idx], 5, 0, 5);

    printf("  [1b] X -5:\n");
    test_micromove(fd, devs[dev_idx], -5, 0, 5);

    printf("  [1c] Y +5:\n");
    test_micromove(fd, devs[dev_idx], 0, 5, 5);

    printf("  [1d] Y -5:\n");
    test_micromove(fd, devs[dev_idx], 0, -5, 5);

    /* ── Phase 2: ±20 steps ── */
    printf("  ── Phase 2: ±20 steps ──\n\n");

    printf("  [2a] X +20:\n");
    test_micromove(fd, devs[dev_idx], 20, 0, 20);

    printf("  [2b] X -20:\n");
    test_micromove(fd, devs[dev_idx], -20, 0, 20);

    printf("  [2c] Y +20:\n");
    test_micromove(fd, devs[dev_idx], 0, 20, 20);

    printf("  [2d] Y -20:\n");
    test_micromove(fd, devs[dev_idx], 0, -20, 20);

    /* Final status */
    status_buf_t final_st;
    get_status(fd, final_st);
    decode_status("FINAL", final_st);

    close(fd);
    printf("\n\n");
}

/* ── Status only ── */
static void show_status_all(void) {
    printf("╔═══════════════════════════════════════╗\n");
    printf("║  MOTOR STATUS — ALL DEVICES           ║\n");
    printf("╚═══════════════════════════════════════╝\n\n");

    for (int d = 0; d < NUM_DEVS; d++) {
        int fd = open(devs[d], O_RDWR);
        if (fd < 0) { printf("  %s: OPEN FAILED\n", devs[d]); continue; }
        status_buf_t buf;
        get_status(fd, buf);
        int *ints = (int *)buf;
        printf("  %s:\n", devs[d]);
        printf("    int32 fields: ");
        for (int i = 0; i < 8; i++) printf("[%d]=%d ", i, ints[i]);
        printf("\n");
        dump_hex("    hex: ", buf, 32);
        close(fd);
    }
}

/* ── Single move command ── */
static void do_move(int dev_idx, int x, int y) {
    if (dev_idx < 0 || dev_idx >= NUM_DEVS) { printf("Bad dev\n"); return; }
    int fd = open(devs[dev_idx], O_RDWR);
    if (fd < 0) { printf("Open failed\n"); return; }

    status_buf_t before, after;
    get_status(fd, before);

    motor_speed(fd, 200);
    int ret = motor_move(fd, x, y);
    printf("MOVE(%s, %+d, %+d): ret=%d errno=%d\n", devs[dev_idx], x, y, ret, errno);
    usleep(800000);
    motor_stop(fd);
    usleep(200000);

    get_status(fd, after);
    int *b = (int *)before, *a = (int *)after;
    for (int i = 0; i < 8; i++) {
        if (b[i] != a[i])
            printf("  field[%d]: %d → %d\n", i, b[i], a[i]);
    }
    close(fd);
}

int main(int argc, char *argv[]) {
    if (argc < 2) {
        printf("motor_probe v2 — CloseLi motor movement test\n\n");
        printf("  %s status             Status of all devices\n", argv[0]);
        printf("  %s test               Full ±5/±20 test on all devices\n", argv[0]);
        printf("  %s testdev <0|1|2>    Test single device\n", argv[0]);
        printf("  %s move <dev> <x> <y> Single move\n", argv[0]);
        printf("  %s stop <dev>         Stop motor\n", argv[0]);
        return 1;
    }

    if (strcmp(argv[1], "status") == 0) {
        show_status_all();
    } else if (strcmp(argv[1], "test") == 0) {
        printf("╔═══════════════════════════════════════╗\n");
        printf("║  FULL MOVEMENT TEST — ALL DEVICES     ║\n");
        printf("╚═══════════════════════════════════════╝\n\n");
        for (int d = 0; d < NUM_DEVS; d++)
            test_device(d);
        printf("═══ ALL TESTS COMPLETE ═══\n");
    } else if (strcmp(argv[1], "testdev") == 0) {
        if (argc < 3) { printf("Usage: %s testdev <0|1|2>\n", argv[0]); return 1; }
        test_device(atoi(argv[2]));
    } else if (strcmp(argv[1], "move") == 0) {
        if (argc < 5) { printf("Usage: %s move <dev> <x> <y>\n", argv[0]); return 1; }
        do_move(atoi(argv[2]), atoi(argv[3]), atoi(argv[4]));
    } else if (strcmp(argv[1], "stop") == 0) {
        if (argc < 3) { printf("Usage: %s stop <dev>\n", argv[0]); return 1; }
        int fd = open(devs[atoi(argv[2])], O_RDWR);
        if (fd >= 0) { motor_stop(fd); printf("STOPPED\n"); close(fd); }
    } else {
        printf("Unknown: %s\n", argv[1]);
        return 1;
    }
    return 0;
}
