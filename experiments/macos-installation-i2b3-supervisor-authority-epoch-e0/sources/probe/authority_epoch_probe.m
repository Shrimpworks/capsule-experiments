#import <Foundation/Foundation.h>

#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>

#ifndef CAPSULE_ROLE
#error "compile with exactly one checked-in role configuration via -include"
#endif

static const char *kParent = "CapsuleAuthorityEpochProbe";
static const char *kLinkAttempt = "e1-link-attempt";
static const char *kRenameAttempt = "e1-rename-attempt";
static const char *kForeignBytes = "cross-authority-write";

static int emit_result(const char *operation, const char *result, int error_number) {
  printf("{\"role\":\"%s\",\"operation\":\"%s\",\"result\":\"%s\",\"errno\":%d}\n",
         CAPSULE_ROLE, operation, result, error_number);
  return strcmp(result, "ok") == 0 ? 0 : 74;
}

static NSURL *application_support_url(BOOL create, NSError **error) {
  return [[NSFileManager defaultManager]
      URLForDirectory:NSApplicationSupportDirectory
             inDomain:NSUserDomainMask
    appropriateForURL:nil
               create:create
                error:error];
}

static int open_directory(const char *path) {
  return open(path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
}

static int open_parent(int base_fd, BOOL create) {
  if (create && mkdirat(base_fd, kParent, 0700) != 0 && errno != EEXIST) {
    return -1;
  }
  return openat(base_fd, kParent, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
}

static int read_exact(int parent_fd, const char *name, const char *expected) {
  int fd = openat(parent_fd, name, O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
  if (fd < 0) {
    return -1;
  }
  size_t expected_length = strlen(expected);
  char bytes[128] = {0};
  ssize_t count = read(fd, bytes, sizeof(bytes));
  int saved_errno = errno;
  close(fd);
  if (count < 0) {
    errno = saved_errno;
    return -1;
  }
  if ((size_t)count != expected_length || memcmp(bytes, expected, expected_length) != 0) {
    errno = EPROTO;
    return -1;
  }
  return 0;
}

static int self_create_read(void) {
  NSError *error = nil;
  NSURL *base = application_support_url(YES, &error);
  if (base == nil) {
    return emit_result("self-create-read", "platform-url-error", EIO);
  }
  int base_fd = open_directory(base.fileSystemRepresentation);
  if (base_fd < 0) {
    return emit_result("self-create-read", "base-open-error", errno);
  }
  int parent_fd = open_parent(base_fd, YES);
  int saved_errno = errno;
  close(base_fd);
  if (parent_fd < 0) {
    return emit_result("self-create-read", "parent-open-error", saved_errno);
  }
  int fd = openat(parent_fd, CAPSULE_SENTINEL_NAME,
                  O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0600);
  if (fd >= 0) {
    size_t length = strlen(CAPSULE_SENTINEL_BYTES);
    ssize_t count = write(fd, CAPSULE_SENTINEL_BYTES, length);
    if (count != (ssize_t)length) {
      saved_errno = count < 0 ? errno : EIO;
      close(fd);
      close(parent_fd);
      return emit_result("self-create-read", "sentinel-write-error", saved_errno);
    }
    if (fchmod(fd, 0600) != 0 || fsync(fd) != 0) {
      saved_errno = errno;
      close(fd);
      close(parent_fd);
      return emit_result("self-create-read", "sentinel-write-error", saved_errno);
    }
    close(fd);
  } else if (errno != EEXIST) {
    saved_errno = errno;
    close(parent_fd);
    return emit_result("self-create-read", "sentinel-create-error", saved_errno);
  }
  int result = read_exact(parent_fd, CAPSULE_SENTINEL_NAME, CAPSULE_SENTINEL_BYTES);
  saved_errno = errno;
  close(parent_fd);
  return result == 0 ? emit_result("self-create-read", "ok", 0)
                     : emit_result("self-create-read", "sentinel-read-error", saved_errno);
}

static int self_read(void) {
  NSError *error = nil;
  NSURL *base = application_support_url(NO, &error);
  if (base == nil) {
    return emit_result("self-read", "platform-url-error", EIO);
  }
  int base_fd = open_directory(base.fileSystemRepresentation);
  if (base_fd < 0) {
    return emit_result("self-read", "base-open-error", errno);
  }
  int parent_fd = open_parent(base_fd, NO);
  int saved_errno = errno;
  close(base_fd);
  if (parent_fd < 0) {
    return emit_result("self-read", "parent-open-error", saved_errno);
  }
  int result = read_exact(parent_fd, CAPSULE_SENTINEL_NAME, CAPSULE_SENTINEL_BYTES);
  saved_errno = errno;
  close(parent_fd);
  return result == 0 ? emit_result("self-read", "ok", 0)
                     : emit_result("self-read", "sentinel-read-error", saved_errno);
}

static int cleanup(void) {
  NSError *error = nil;
  NSURL *base = application_support_url(NO, &error);
  if (base == nil) {
    return emit_result("cleanup", "platform-url-error", EIO);
  }
  int base_fd = open_directory(base.fileSystemRepresentation);
  if (base_fd < 0) {
    return emit_result("cleanup", "base-open-error", errno);
  }
  int parent_fd = open_parent(base_fd, NO);
  int saved_errno = errno;
  if (parent_fd < 0) {
    close(base_fd);
    return emit_result("cleanup", "parent-open-error", saved_errno);
  }
  if (unlinkat(parent_fd, CAPSULE_SENTINEL_NAME, 0) != 0) {
    saved_errno = errno;
    close(parent_fd);
    close(base_fd);
    return emit_result("cleanup", "sentinel-remove-error", saved_errno);
  }
  close(parent_fd);
  if (unlinkat(base_fd, kParent, AT_REMOVEDIR) != 0) {
    saved_errno = errno;
    close(base_fd);
    return emit_result("cleanup", "parent-remove-error", saved_errno);
  }
  close(base_fd);
  return emit_result("cleanup", "ok", 0);
}

static int peer_operation(const char *operation, const char *peer_base_path) {
  if (peer_base_path == NULL || peer_base_path[0] != '/' || strstr(peer_base_path, "/../") != NULL) {
    return emit_result(operation, "peer-url-refused", EINVAL);
  }
  int base_fd = open_directory(peer_base_path);
  if (base_fd < 0) {
    return emit_result(operation, "peer-base-denied", errno);
  }
  int parent_fd = open_parent(base_fd, NO);
  int saved_errno = errno;
  close(base_fd);
  if (parent_fd < 0) {
    return emit_result(operation, "peer-parent-denied", saved_errno);
  }

  int result = -1;
  if (strcmp(operation, "peer-read") == 0) {
    result = read_exact(parent_fd, CAPSULE_PEER_SENTINEL_NAME, CAPSULE_PEER_SENTINEL_BYTES);
  } else if (strcmp(operation, "peer-write") == 0) {
    int fd = openat(parent_fd, CAPSULE_PEER_SENTINEL_NAME,
                    O_WRONLY | O_TRUNC | O_NOFOLLOW | O_CLOEXEC);
    if (fd >= 0) {
      result = write(fd, kForeignBytes, strlen(kForeignBytes)) == (ssize_t)strlen(kForeignBytes)
                   ? 0
                   : -1;
      close(fd);
    }
  } else if (strcmp(operation, "peer-create") == 0) {
    int fd = openat(parent_fd, CAPSULE_SENTINEL_NAME,
                    O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0600);
    if (fd >= 0) {
      close(fd);
      result = 0;
    }
  } else if (strcmp(operation, "peer-link") == 0) {
    result = linkat(parent_fd, CAPSULE_PEER_SENTINEL_NAME, parent_fd, kLinkAttempt, 0);
  } else if (strcmp(operation, "peer-rename") == 0) {
    result = renameat(parent_fd, CAPSULE_PEER_SENTINEL_NAME, parent_fd, kRenameAttempt);
  } else if (strcmp(operation, "peer-map") == 0) {
    int fd = openat(parent_fd, CAPSULE_PEER_SENTINEL_NAME,
                    O_RDWR | O_NOFOLLOW | O_CLOEXEC);
    if (fd >= 0) {
      void *mapping = mmap(NULL, 1, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
      if (mapping != MAP_FAILED) {
        result = 0;
        munmap(mapping, 1);
      }
      close(fd);
    }
  } else {
    close(parent_fd);
    return emit_result(operation, "unknown-operation", EINVAL);
  }
  saved_errno = errno;
  close(parent_fd);
  return result == 0 ? emit_result(operation, "unexpected-success", 0)
                     : emit_result(operation, "denied", saved_errno);
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    NSString *bundle_id = NSBundle.mainBundle.bundleIdentifier;
    if (![bundle_id isEqualToString:@CAPSULE_BUNDLE_IDENTIFIER]) {
      return emit_result("startup", "bundle-identifier-refused", EINVAL);
    }
    if (argc == 2 && strcmp(argv[1], "container-url") == 0) {
      NSError *error = nil;
      NSURL *base = application_support_url(NO, &error);
      if (base == nil) {
        return emit_result("container-url", "platform-url-error", EIO);
      }
      printf("%s\n", base.fileSystemRepresentation);
      return 0;
    }
    if (argc == 2 && strcmp(argv[1], "self-create-read") == 0) {
      return self_create_read();
    }
    if (argc == 2 && strcmp(argv[1], "self-read") == 0) {
      return self_read();
    }
    if (argc == 2 && strcmp(argv[1], "cleanup") == 0) {
      return cleanup();
    }
    if (argc == 3 && strncmp(argv[1], "peer-", 5) == 0) {
      return peer_operation(argv[1], argv[2]);
    }
    return emit_result("startup", "arguments-refused", EINVAL);
  }
}
