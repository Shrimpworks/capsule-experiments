#define _DARWIN_C_SOURCE

#include <errno.h>
#include <fcntl.h>
#include <inttypes.h>
#include <libkrun.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

enum { kFixtureLength = 4096 };

struct fixture {
    int fd;
    char path[128];
    struct stat stat;
};

static void die(const char *message) {
    perror(message);
    exit(1);
}

static void expect(const char *name, bool condition) {
    if (!condition) {
        fprintf(stderr, "FD_API_CONTRACT_FAIL case=%s errno=%d\n", name, errno);
        exit(1);
    }
    printf("FD_API_CONTRACT_PASS case=%s\n", name);
}

static struct fixture make_fixture(bool read_only, bool unlink_file, mode_t mode) {
    struct fixture fixture = {.fd = -1};
    snprintf(fixture.path, sizeof(fixture.path),
             "/private/tmp/capsule-fd-api-%ld-XXXXXX", (long)getpid());
    int writer = mkstemp(fixture.path);
    if (writer < 0) {
        die("mkstemp");
    }
    unsigned char block[kFixtureLength];
    memset(block, 0x5a, sizeof(block));
    if (write(writer, block, sizeof(block)) != (ssize_t)sizeof(block) ||
        fsync(writer) != 0 || fchmod(writer, mode) != 0) {
        die("populate fixture");
    }
    if (read_only) {
        fixture.fd = open(fixture.path, O_RDONLY);
        if (fixture.fd < 0) {
            die("open read-only fixture");
        }
        close(writer);
    } else {
        fixture.fd = writer;
    }
    if (unlink_file && unlink(fixture.path) != 0) {
        die("unlink fixture");
    }
    if (fstat(fixture.fd, &fixture.stat) != 0) {
        die("fstat fixture");
    }
    return fixture;
}

static int add_fixture(uint32_t context, const struct fixture *fixture,
                       uint64_t device, uint64_t inode, uint64_t length) {
    return krun_add_read_only_raw_root_fd(context, fixture->fd, device, inode,
                                          length);
}

static uint32_t new_context(void) {
    int context = krun_create_ctx();
    if (context < 0) {
        errno = -context;
        die("krun_create_ctx");
    }
    return (uint32_t)context;
}

static void free_context(uint32_t context) {
    int result = krun_free_ctx(context);
    if (result != 0) {
        errno = -result;
        die("krun_free_ctx");
    }
}

int main(void) {
    struct fixture finalized = make_fixture(true, true, 0400);
    uint64_t device = (uint64_t)finalized.stat.st_dev;
    uint64_t inode = (uint64_t)finalized.stat.st_ino;
    uint64_t length = (uint64_t)finalized.stat.st_size;
    int original_flags = fcntl(finalized.fd, F_GETFL);
    if (original_flags < 0 || lseek(finalized.fd, 23, SEEK_SET) != 23) {
        die("prepare positional-I/O canary");
    }

    uint32_t context = new_context();
    expect("valid-finalized-read-only-root",
           add_fixture(context, &finalized, device, inode, length) == 0);
    expect("caller-flags-unchanged",
           fcntl(finalized.fd, F_GETFL) == original_flags);
    expect("caller-offset-unchanged", lseek(finalized.fd, 0, SEEK_CUR) == 23);
    errno = 0;
    expect("caller-pwrite-refused",
           pwrite(finalized.fd, "X", 1, 0) == -1 && errno == EBADF);
    expect("duplicate-runtime-root-role-refused",
           add_fixture(context, &finalized, device, inode, length) == -EEXIST);
    expect("path-vda-after-fd-role-refused",
           krun_add_disk(context, "vda", "/does/not/matter", true) == -EEXIST);
    close(finalized.fd);
    free_context(context);
    printf("FD_API_CONTRACT_PASS case=caller-close-after-api\n");

    struct fixture closed = make_fixture(true, true, 0400);
    int closed_number = closed.fd;
    device = (uint64_t)closed.stat.st_dev;
    inode = (uint64_t)closed.stat.st_ino;
    context = new_context();
    close(closed.fd);
    expect("closed-descriptor-refused",
           krun_add_read_only_raw_root_fd(context, closed_number, device, inode,
                                          kFixtureLength) == -EBADF);
    free_context(context);

    struct fixture writable = make_fixture(false, true, 0400);
    context = new_context();
    expect("writable-descriptor-refused",
           add_fixture(context, &writable, (uint64_t)writable.stat.st_dev,
                       (uint64_t)writable.stat.st_ino,
                       (uint64_t)writable.stat.st_size) == -EACCES);
    free_context(context);
    close(writable.fd);

    struct fixture linked = make_fixture(true, false, 0400);
    context = new_context();
    expect("linked-descriptor-refused",
           add_fixture(context, &linked, (uint64_t)linked.stat.st_dev,
                       (uint64_t)linked.stat.st_ino,
                       (uint64_t)linked.stat.st_size) == -EINVAL);
    free_context(context);
    close(linked.fd);
    unlink(linked.path);

    struct fixture wrong_mode = make_fixture(true, true, 0444);
    context = new_context();
    expect("wrong-mode-refused",
           add_fixture(context, &wrong_mode, (uint64_t)wrong_mode.stat.st_dev,
                       (uint64_t)wrong_mode.stat.st_ino,
                       (uint64_t)wrong_mode.stat.st_size) == -EINVAL);
    free_context(context);
    close(wrong_mode.fd);

    struct fixture reused = make_fixture(true, true, 0400);
    context = new_context();
    expect("reused-wrong-object-refused",
           add_fixture(context, &reused, (uint64_t)reused.stat.st_dev,
                       (uint64_t)reused.stat.st_ino + 1,
                       (uint64_t)reused.stat.st_size) == -ESTALE);
    expect("wrong-length-refused",
           add_fixture(context, &reused, (uint64_t)reused.stat.st_dev,
                       (uint64_t)reused.stat.st_ino,
                       (uint64_t)reused.stat.st_size + 512) == -EINVAL);
    free_context(context);
    close(reused.fd);

    printf("FD_API_CONTRACT_SUMMARY pass=13 fail=0\n");
    return 0;
}
