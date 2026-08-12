# E1 App Group preflight result

The exact preflight is `PASSED`: it determinately rejected Developer-portal registration of the
frozen macOS-style identity before mutation. That portal-registration path is `NO_GO`; the exact
E0/ADR-0045 App Group identity remains intended and `BLOCKED` on signed execution evidence. The
E1 platform matrix is still `BLOCKED`, ADR-0045 remains `Proposed`, and installed/product
admission remains `BLOCKED`.

The immutable inputs, host, and restored legacy profile matched. The authenticated portal form
rewrote the frozen App Group entry by prepending `group.`. No registration form was submitted and
all portal, signing, bundle, process, container, sentinel, service, key, root/store, runtime, and
guest mutation flags remain false.

Apple's current App Groups entitlement documentation explicitly says that the frozen
`<team identifier>.<group name>` form is supported on macOS and needs no Developer-website App
Group registration. The original broader candidate-level `NO_GO` interpretation is superseded by
this result.
