/* Exact accepted-header ABI audit for Capsule C2B materialized runner v4. */

#include <stdint.h>

#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wcomment"
#include "libkrun.h"
#pragma clang diagnostic pop

#define ABI_ASSERT(symbol, pointer_type)                                      \
    _Static_assert(                                                          \
        __builtin_types_compatible_p(__typeof__(&(symbol)), pointer_type),    \
        "accepted libkrun ABI changed: " #symbol)

typedef int32_t (*krun_create_ctx_accepted_header_type)();
typedef int32_t (*krun_set_vm_config_type)(uint32_t, uint8_t, uint32_t);
typedef int32_t (*krun_context_only_type)(uint32_t);
typedef int32_t (*krun_read_only_root_type)(uint32_t, int, uint64_t, uint64_t,
                                            uint64_t);
typedef int32_t (*krun_root_remount_type)(uint32_t, const char *, const char *,
                                          const char *);
typedef int32_t (*krun_console_port_type)(uint32_t, uint32_t, const char *, int,
                                          int);
typedef int32_t (*krun_context_string_type)(uint32_t, const char *);
typedef int32_t (*krun_set_exec_type)(uint32_t, const char *,
                                      const char *const *,
                                      const char *const *);

_Static_assert(sizeof(int32_t) == 4, "int32_t width");
_Static_assert(sizeof(uint32_t) == 4, "uint32_t width");
_Static_assert(sizeof(uint8_t) == 1, "uint8_t width");
_Static_assert(sizeof(uint64_t) == 8, "uint64_t width");
_Static_assert(sizeof(int) == 4, "C int width");

ABI_ASSERT(krun_create_ctx, krun_create_ctx_accepted_header_type);
ABI_ASSERT(krun_set_vm_config, krun_set_vm_config_type);
ABI_ASSERT(krun_disable_implicit_console, krun_context_only_type);
ABI_ASSERT(krun_disable_implicit_init, krun_context_only_type);
ABI_ASSERT(krun_disable_implicit_vsock, krun_context_only_type);
ABI_ASSERT(krun_add_read_only_raw_root_fd, krun_read_only_root_type);
ABI_ASSERT(krun_set_root_disk_remount, krun_root_remount_type);
ABI_ASSERT(krun_add_virtio_console_multiport, krun_context_only_type);
ABI_ASSERT(krun_add_console_port_inout, krun_console_port_type);
ABI_ASSERT(krun_set_kernel_console, krun_context_string_type);
ABI_ASSERT(krun_set_workdir, krun_context_string_type);
ABI_ASSERT(krun_set_exec, krun_set_exec_type);
ABI_ASSERT(krun_start_enter, krun_context_only_type);

int capsule_c2b_libkrun_abi_audit_translation_unit(void) {
    return 0;
}
