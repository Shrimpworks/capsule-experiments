#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#ifndef DESCRIPTOR_MANIFEST_SHA256
#define DESCRIPTOR_MANIFEST_SHA256 "missing"
#endif

static int expected_access_mode(int fd) {
    switch (fd) {
        case 0: case 3: case 6: case 7: return O_RDONLY;
        case 1: case 2: case 4: case 5: return O_WRONLY;
        default: return -1;
    }
}

int main(void) {
    for (int fd = 0; fd < 256; fd++) {
        errno = 0;
        int flags = fcntl(fd, F_GETFL);
        if (flags < 0 && errno == EBADF) {
            continue;
        }
        if (flags < 0) {
            fprintf(stderr, "descriptor-check-error fd=%d errno=%d\n", fd, errno);
            return 74;
        }
        int expected = expected_access_mode(fd);
        int observed = flags & O_ACCMODE;
        if (expected < 0) {
            fprintf(stderr, "descriptor-refused unexpectedFd=%d manifestSha256=%s\n",
                    fd, DESCRIPTOR_MANIFEST_SHA256);
            return 78;
        }
        if (observed != expected) {
            fprintf(stderr, "descriptor-refused fd=%d expectedMode=%d observedMode=%d\n",
                    fd, expected, observed);
            return 78;
        }
    }
    printf("descriptorManifestSha256=%s descriptorSet=exact pid=%d\n",
           DESCRIPTOR_MANIFEST_SHA256, getpid());
    fflush(stdout);
    unsigned char authorization = 0;
    ssize_t count = read(7, &authorization, 1);
    if (count != 1 || authorization != 'G') {
        fputs("descriptor-refused missing-record-before-start-byte\n", stderr);
        return 78;
    }
    puts("descriptorProbe=pass guestStarted=false");
    return 0;
}
