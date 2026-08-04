/*
 * Development-only Gate D probe. This is not a Capsule production component
 * or security boundary.
 *
 * It verifies that the macOS libxpc SDK/runtime can box a read-only descriptor,
 * retain an independent duplicate after the sender closes its descriptor, and
 * return an equivalent descriptor without resolving a path.
 */

#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <xpc/xpc.h>

static int fail(const char *message) {
  fprintf(stderr, "%s: %s\n", message, strerror(errno));
  return 1;
}

int main(void) {
  char path[] = "/tmp/capsule-gate-d-xpc.XXXXXX";
  const char expected[] = "exact-xpc-descriptor-bytes";
  char actual[sizeof(expected)] = {0};

  int writable = mkstemp(path);
  if (writable < 0) {
    return fail("mkstemp");
  }
  if (write(writable, expected, sizeof(expected)) != (ssize_t)sizeof(expected)) {
    close(writable);
    unlink(path);
    return fail("write");
  }
  if (close(writable) != 0) {
    unlink(path);
    return fail("close writable");
  }
  int sender = open(path, O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
  if (sender < 0) {
    unlink(path);
    return fail("open read-only sender");
  }
  if (unlink(path) != 0) {
    close(sender);
    return fail("unlink");
  }

  xpc_object_t message = xpc_dictionary_create_empty();
  if (message == NULL) {
    close(sender);
    errno = ENOMEM;
    return fail("xpc_dictionary_create_empty");
  }
  xpc_dictionary_set_fd(message, "content", sender);
  if (close(sender) != 0) {
    xpc_release(message);
    return fail("close sender");
  }

  int receiver = xpc_dictionary_dup_fd(message, "content");
  xpc_release(message);
  if (receiver < 0) {
    return fail("xpc_dictionary_dup_fd");
  }
  if (read(receiver, actual, sizeof(actual)) != (ssize_t)sizeof(actual)) {
    close(receiver);
    return fail("read receiver");
  }
  if (write(receiver, "x", 1) >= 0 || errno != EBADF) {
    close(receiver);
    fprintf(stderr, "received descriptor was not read-only\n");
    return 1;
  }
  if (close(receiver) != 0) {
    return fail("close receiver");
  }
  if (memcmp(actual, expected, sizeof(expected)) != 0) {
    fprintf(stderr, "received bytes did not match\n");
    return 1;
  }

  puts("PASS xpc fd boxing/duplication preserved exact bytes and read-only mode");
  return 0;
}
