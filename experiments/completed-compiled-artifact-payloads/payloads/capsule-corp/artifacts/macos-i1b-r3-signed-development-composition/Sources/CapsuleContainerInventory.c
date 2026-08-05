#include "CapsuleContainerInventory.h"

#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

static int has_suffix(const char *value, const char *suffix) {
    size_t value_length = strlen(value);
    size_t suffix_length = strlen(suffix);
    return value_length >= suffix_length &&
           strcmp(value + value_length - suffix_length, suffix) == 0;
}

int capsule_run_private_scratch_cleanup(const char *bundle_identifier) {
    const char *home = getenv("HOME");
    char expected_suffix[PATH_MAX];
    char scratch_root[PATH_MAX];
    char marker_path[PATH_MAX];
    const char marker[] = "capsule-i1b-r3-fixed-benign-scratch\n";
    struct stat status;
    int descriptor = -1;
    int marker_created = 0;
    int result = 70;
    int scratch_root_created = 0;

    if (home == NULL || bundle_identifier == NULL || strchr(bundle_identifier, '/') != NULL) {
        return 70;
    }
    if (snprintf(expected_suffix, sizeof(expected_suffix),
                 "/Library/Containers/%s/Data", bundle_identifier) >=
        (int)sizeof(expected_suffix)) {
        return 70;
    }
    if (!has_suffix(home, expected_suffix)) {
        return 70;
    }
    if (snprintf(scratch_root, sizeof(scratch_root),
                 "%s/Library/Caches/CapsuleI1BR3", home) >=
        (int)sizeof(scratch_root) ||
        snprintf(marker_path, sizeof(marker_path), "%s/fixed-benign-scratch", scratch_root) >=
        (int)sizeof(marker_path)) {
        return 70;
    }

    if (mkdir(scratch_root, 0700) != 0) {
        return 70;
    }
    scratch_root_created = 1;
    descriptor = open(marker_path, O_CREAT | O_EXCL | O_WRONLY | O_NOFOLLOW, 0600);
    if (descriptor < 0) {
        goto cleanup;
    }
    marker_created = 1;
    if (write(descriptor, marker, sizeof(marker) - 1) != (ssize_t)(sizeof(marker) - 1)) {
        goto cleanup;
    }
    if (close(descriptor) != 0) {
        descriptor = -1;
        goto cleanup;
    }
    descriptor = -1;
    if (lstat(marker_path, &status) != 0 || !S_ISREG(status.st_mode) ||
        status.st_size != (off_t)(sizeof(marker) - 1)) {
        goto cleanup;
    }
    if (unlink(marker_path) != 0 || rmdir(scratch_root) != 0) {
        goto cleanup;
    }
    if (lstat(scratch_root, &status) == 0 || errno != ENOENT) {
        goto cleanup;
    }
    result = 0;

cleanup:
    if (descriptor >= 0) {
        close(descriptor);
    }
    if (result != 0) {
        /* Delete only the exact fixed marker created by this test. */
        if (marker_created) {
            unlink(marker_path);
        }
        if (scratch_root_created) {
            rmdir(scratch_root);
        }
    }
    return result;
}
