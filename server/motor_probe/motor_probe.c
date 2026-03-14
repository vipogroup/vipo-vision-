/*
 * motor_probe.c — Minimal ioctl probe for CloseLi camera motors
 * 
 * Target: Ingenic T23 MIPS32, Linux 3.10
 * Compile: mipsel-linux-gnu-gcc -static -o motor_probe motor_probe.c
 * 
 * Usage:
 *   ./motor_probe probe              Probe all ioctl cmds 0x0-0x10 on all devices
 *   ./motor_probe status             Get motor status from all devices
 *   ./motor_probe move <dev> <x> <y> Move motor (e.g. move 0 100 0)
 *   ./motor_probe stop <dev>         Stop motor
 *   ./motor_probe speed <dev> <spd>  Set speed
 *   ./motor_probe test               Run safe movement test sequence
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <sys/ioctl.h>

/* ── Known ioctl commands from ingenic-motor (standard T31 motor.ko) ── */
#define MOTOR_STOP        0x1
#define MOTOR_RESET       0x2
#define MOTOR_MOVE        0x3
#define MOTOR_GET_STATUS  0x4
#define MOTOR_SPEED       0x5
#define MOTOR_GOBACK      0x6
#define MOTOR_CRUISE      0x7

/* ── Data structures from ingenic-motor ── */
struct motors_steps {
    int x;
    int y;
};

struct motor_message {
    int x;
    int y;
    int status;     /* 0=stop, 1=running */
    int speed;
    unsigned int x_max_steps;
    unsigned int y_max_steps;
};

struct motor_reset_data {
    unsigned int x_max_steps;
    unsigned int y_max_steps;
    unsigned int x_cur_step;
    unsigned int y_cur_step;
};

/* ── Device paths ── */
static const char *devs[] = { "/dev/motor", "/dev/motor1", "/dev/motor2" };
#define NUM_DEVS 3

/* ── Command name helper ── */
static const char *cmd_name(int cmd) {
    switch (cmd) {
        case 0x0: return "0x00 (NOP?)";
        case 0x1: return "0x01 (STOP)";
        case 0x2: return "0x02 (RESET)";
        case 0x3: return "0x03 (MOVE)";
        case 0x4: return "0x04 (GET_STATUS)";
        case 0x5: return "0x05 (SPEED)";
        case 0x6: return "0x06 (GOBACK)";
        case 0x7: return "0x07 (CRUISE)";
        default: {
            static char buf[32];
            snprintf(buf, sizeof(buf), "0x%02x (unknown)", cmd);
            return buf;
        }
    }
}

/* ── Hex dump helper ── */
static void hexdump(const char *label, const void *data, int len) {
    const unsigned char *p = (const unsigned char *)data;
    printf("  %s (%d bytes): ", label, len);
    for (int i = 0; i < len && i < 64; i++)
        printf("%02x ", p[i]);
    printf("\n");
}

/* ── Open device ── */
static int open_dev(const char *path) {
    int fd = open(path, O_RDWR);
    if (fd < 0) {
        printf("  OPEN %s: FAILED (errno=%d: %s)\n", path, errno, strerror(errno));
    }
    return fd;
}

/* ── Probe: try all ioctl cmds on all devices ── */
static void do_probe(void) {
    printf("╔═══════════════════════════════════════════════╗\n");
    printf("║  MOTOR IOCTL PROBE — cmds 0x00 to 0x10       ║\n");
    printf("╚═══════════════════════════════════════════════╝\n\n");

    for (int d = 0; d < NUM_DEVS; d++) {
        int fd = open_dev(devs[d]);
        if (fd < 0) continue;

        printf("── %s (fd=%d) ──\n", devs[d], fd);

        for (int cmd = 0x0; cmd <= 0x10; cmd++) {
            /* Prepare a large buffer for any returned data */
            unsigned char arg[64];
            memset(arg, 0, sizeof(arg));

            /* For GET_STATUS-like commands, pass the buffer */
            /* For MOVE, pass a small safe {x=0, y=0} so we don't actually move */
            /* For SPEED, pass a reasonable speed value */
            if (cmd == MOTOR_SPEED) {
                int spd = 400;
                memcpy(arg, &spd, sizeof(int));
            }

            errno = 0;
            int ret = ioctl(fd, cmd, arg);
            int e = errno;

            printf("  cmd=%s ret=%d errno=%d(%s)",
                   cmd_name(cmd), ret, e, e ? strerror(e) : "OK");

            /* If success, dump returned data */
            if (ret == 0) {
                /* Check if the buffer has any non-zero data */
                int has_data = 0;
                for (int i = 0; i < 32; i++) {
                    if (arg[i] != 0) { has_data = 1; break; }
                }
                if (has_data) {
                    printf(" → DATA:");
                    hexdump("", arg, 32);
                } else {
                    printf(" → (no data returned)\n");
                }

                /* If this looks like motor_message, try to decode */
                if (cmd == MOTOR_GET_STATUS || has_data) {
                    struct motor_message *msg = (struct motor_message *)arg;
                    if (msg->x_max_steps > 0 || msg->y_max_steps > 0 ||
                        msg->speed > 0 || msg->x != 0 || msg->y != 0) {
                        printf("    → Decoded: x=%d y=%d status=%d speed=%d xmax=%u ymax=%u\n",
                               msg->x, msg->y, msg->status, msg->speed,
                               msg->x_max_steps, msg->y_max_steps);
                    }
                }
            } else {
                printf("\n");
            }
        }

        close(fd);
        printf("\n");
    }
}

/* ── Get status from one device ── */
static void do_status_one(const char *path) {
    int fd = open_dev(path);
    if (fd < 0) return;

    struct motor_message msg;
    memset(&msg, 0, sizeof(msg));

    /* Try standard GET_STATUS (0x4) first */
    errno = 0;
    int ret = ioctl(fd, MOTOR_GET_STATUS, &msg);
    if (ret == 0 && (msg.x_max_steps > 0 || msg.y_max_steps > 0 || msg.speed > 0)) {
        printf("  %s [cmd=0x4] → x=%d y=%d status=%d speed=%d xmax=%u ymax=%u\n",
               path, msg.x, msg.y, msg.status, msg.speed,
               msg.x_max_steps, msg.y_max_steps);
        close(fd);
        return;
    }

    /* If standard didn't work, try all cmds with a buffer to find which returns data */
    printf("  %s [cmd=0x4] failed (ret=%d errno=%d). Scanning...\n", path, ret, errno);
    for (int cmd = 0x0; cmd <= 0x10; cmd++) {
        unsigned char buf[64];
        memset(buf, 0, sizeof(buf));
        errno = 0;
        ret = ioctl(fd, cmd, buf);
        if (ret == 0) {
            int has_data = 0;
            for (int i = 0; i < 32; i++) {
                if (buf[i] != 0) { has_data = 1; break; }
            }
            if (has_data) {
                struct motor_message *m = (struct motor_message *)buf;
                printf("  %s [cmd=0x%02x] → x=%d y=%d status=%d speed=%d xmax=%u ymax=%u\n",
                       path, cmd, m->x, m->y, m->status, m->speed,
                       m->x_max_steps, m->y_max_steps);
                hexdump("raw", buf, 32);
            }
        }
    }

    close(fd);
}

/* ── Status for all devices ── */
static void do_status(void) {
    printf("╔═══════════════════════════════════════════════╗\n");
    printf("║  MOTOR STATUS                                 ║\n");
    printf("╚═══════════════════════════════════════════════╝\n\n");

    for (int d = 0; d < NUM_DEVS; d++)
        do_status_one(devs[d]);
}

/* ── Move motor ── */
static void do_move(int dev_idx, int x, int y) {
    if (dev_idx < 0 || dev_idx >= NUM_DEVS) {
        printf("Invalid device index %d (use 0-2)\n", dev_idx);
        return;
    }

    int fd = open_dev(devs[dev_idx]);
    if (fd < 0) return;

    struct motors_steps steps = { .x = x, .y = y };

    printf("Moving %s: x=%d y=%d\n", devs[dev_idx], x, y);

    /* Try setting speed first */
    int spd = 400;
    errno = 0;
    int ret = ioctl(fd, MOTOR_SPEED, &spd);
    printf("  SPEED(0x5) ret=%d errno=%d\n", ret, errno);

    /* Then move */
    errno = 0;
    ret = ioctl(fd, MOTOR_MOVE, &steps);
    printf("  MOVE(0x3) ret=%d errno=%d\n", ret, errno);

    /* If standard cmd failed, try alternatives */
    if (ret != 0) {
        printf("  Standard MOVE failed, trying alternatives...\n");
        for (int cmd = 0x0; cmd <= 0x10; cmd++) {
            if (cmd == MOTOR_STOP || cmd == MOTOR_RESET) continue; /* skip dangerous ones */
            errno = 0;
            ret = ioctl(fd, cmd, &steps);
            if (ret == 0) {
                printf("  cmd=0x%02x SUCCEEDED for move! ret=%d\n", cmd, ret);
                sleep(2);
                /* Try to stop */
                ioctl(fd, MOTOR_STOP, NULL);
                break;
            }
        }
    } else {
        printf("  MOVE succeeded! Waiting 2s for motor...\n");
        sleep(2);
    }

    close(fd);
}

/* ── Stop motor ── */
static void do_stop(int dev_idx) {
    if (dev_idx < 0 || dev_idx >= NUM_DEVS) {
        printf("Invalid device index %d\n", dev_idx);
        return;
    }

    int fd = open_dev(devs[dev_idx]);
    if (fd < 0) return;

    errno = 0;
    int ret = ioctl(fd, MOTOR_STOP, NULL);
    printf("  STOP %s: ret=%d errno=%d\n", devs[dev_idx], ret, errno);

    close(fd);
}

/* ── Set speed ── */
static void do_speed(int dev_idx, int speed) {
    if (dev_idx < 0 || dev_idx >= NUM_DEVS) {
        printf("Invalid device index %d\n", dev_idx);
        return;
    }

    int fd = open_dev(devs[dev_idx]);
    if (fd < 0) return;

    errno = 0;
    int ret = ioctl(fd, MOTOR_SPEED, &speed);
    printf("  SPEED %s: speed=%d ret=%d errno=%d\n", devs[dev_idx], speed, ret, errno);

    close(fd);
}

/* ── Safe movement test sequence ── */
static void do_test(void) {
    printf("╔═══════════════════════════════════════════════╗\n");
    printf("║  SAFE MOVEMENT TEST SEQUENCE                  ║\n");
    printf("╚═══════════════════════════════════════════════╝\n\n");

    for (int d = 0; d < NUM_DEVS; d++) {
        int fd = open_dev(devs[d]);
        if (fd < 0) continue;

        printf("── Testing %s ──\n", devs[d]);

        /* 1. Get initial status */
        struct motor_message msg;
        memset(&msg, 0, sizeof(msg));
        errno = 0;
        int ret = ioctl(fd, MOTOR_GET_STATUS, &msg);
        printf("  [1] GET_STATUS: ret=%d errno=%d x=%d y=%d status=%d speed=%d xmax=%u ymax=%u\n",
               ret, errno, msg.x, msg.y, msg.status, msg.speed,
               msg.x_max_steps, msg.y_max_steps);

        /* 2. Set slow speed */
        int spd = 200;
        errno = 0;
        ret = ioctl(fd, MOTOR_SPEED, &spd);
        printf("  [2] SET_SPEED(200): ret=%d errno=%d\n", ret, errno);

        /* 3. Move forward: +100 x steps, 0 y */
        struct motors_steps fwd = { .x = 100, .y = 0 };
        errno = 0;
        ret = ioctl(fd, MOTOR_MOVE, &fwd);
        printf("  [3] MOVE(+100,0): ret=%d errno=%d\n", ret, errno);
        if (ret == 0) {
            printf("      >>> MOTOR SHOULD BE MOVING NOW (watch camera!) <<<\n");
            sleep(3);
        }

        /* 4. Stop */
        errno = 0;
        ret = ioctl(fd, MOTOR_STOP, NULL);
        printf("  [4] STOP: ret=%d errno=%d\n", ret, errno);
        sleep(1);

        /* 5. Get status after move */
        memset(&msg, 0, sizeof(msg));
        errno = 0;
        ret = ioctl(fd, MOTOR_GET_STATUS, &msg);
        printf("  [5] STATUS after move: ret=%d x=%d y=%d status=%d speed=%d\n",
               ret, msg.x, msg.y, msg.status, msg.speed);

        /* 6. Move reverse: -100 x steps */
        struct motors_steps rev = { .x = -100, .y = 0 };
        errno = 0;
        ret = ioctl(fd, MOTOR_MOVE, &rev);
        printf("  [6] MOVE(-100,0): ret=%d errno=%d\n", ret, errno);
        if (ret == 0) {
            printf("      >>> MOTOR SHOULD REVERSE NOW <<<\n");
            sleep(3);
        }

        /* 7. Stop */
        errno = 0;
        ret = ioctl(fd, MOTOR_STOP, NULL);
        printf("  [7] STOP: ret=%d errno=%d\n", ret, errno);
        sleep(1);

        /* 8. Final status */
        memset(&msg, 0, sizeof(msg));
        errno = 0;
        ret = ioctl(fd, MOTOR_GET_STATUS, &msg);
        printf("  [8] FINAL STATUS: ret=%d x=%d y=%d status=%d speed=%d\n",
               ret, msg.x, msg.y, msg.status, msg.speed);

        /* 9. Also try Y axis */
        printf("  [9] Testing Y axis...\n");
        struct motors_steps yfwd = { .x = 0, .y = 100 };
        errno = 0;
        ret = ioctl(fd, MOTOR_MOVE, &yfwd);
        printf("  [9] MOVE(0,+100): ret=%d errno=%d\n", ret, errno);
        if (ret == 0) {
            printf("      >>> Y AXIS SHOULD MOVE NOW <<<\n");
            sleep(3);
        }

        errno = 0;
        ret = ioctl(fd, MOTOR_STOP, NULL);
        printf("  [10] STOP: ret=%d errno=%d\n", ret, errno);
        sleep(1);

        /* Reverse Y */
        struct motors_steps yrev = { .x = 0, .y = -100 };
        errno = 0;
        ret = ioctl(fd, MOTOR_MOVE, &yrev);
        printf("  [11] MOVE(0,-100): ret=%d errno=%d\n", ret, errno);
        if (ret == 0) {
            printf("      >>> Y AXIS SHOULD REVERSE <<<\n");
            sleep(3);
        }

        errno = 0;
        ioctl(fd, MOTOR_STOP, NULL);
        printf("  [12] STOP: ret=%d errno=%d\n", ret, errno);

        close(fd);
        printf("\n");
    }

    printf("═══ TEST COMPLETE ═══\n");
}

/* ── Main ── */
int main(int argc, char *argv[]) {
    if (argc < 2) {
        printf("motor_probe — CloseLi camera motor ioctl test tool\n\n");
        printf("Usage:\n");
        printf("  %s probe              Probe ioctl cmds 0x0-0x10 on all devices\n", argv[0]);
        printf("  %s status             Get motor status\n", argv[0]);
        printf("  %s move <dev> <x> <y> Move motor (dev: 0,1,2)\n", argv[0]);
        printf("  %s stop <dev>         Stop motor\n", argv[0]);
        printf("  %s speed <dev> <spd>  Set speed\n", argv[0]);
        printf("  %s test               Run safe movement test\n", argv[0]);
        printf("\nDevices: 0=/dev/motor, 1=/dev/motor1, 2=/dev/motor2\n");
        return 1;
    }

    if (strcmp(argv[1], "probe") == 0) {
        do_probe();
    } else if (strcmp(argv[1], "status") == 0) {
        do_status();
    } else if (strcmp(argv[1], "move") == 0) {
        if (argc < 5) { printf("Usage: %s move <dev> <x> <y>\n", argv[0]); return 1; }
        do_move(atoi(argv[2]), atoi(argv[3]), atoi(argv[4]));
    } else if (strcmp(argv[1], "stop") == 0) {
        if (argc < 3) { printf("Usage: %s stop <dev>\n", argv[0]); return 1; }
        do_stop(atoi(argv[2]));
    } else if (strcmp(argv[1], "speed") == 0) {
        if (argc < 4) { printf("Usage: %s speed <dev> <spd>\n", argv[0]); return 1; }
        do_speed(atoi(argv[2]), atoi(argv[3]));
    } else if (strcmp(argv[1], "test") == 0) {
        do_test();
    } else {
        printf("Unknown command: %s\n", argv[1]);
        return 1;
    }

    return 0;
}
