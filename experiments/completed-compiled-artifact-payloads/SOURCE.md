# Source binding

- Source repository: `https://github.com/Shrimpworks/capsule-corp`
- Source commit: `d11cf94704ea8647614f4c8f4424e90821f2dcb3`
- Source branch state: freshly fetched `origin/main`; archive task branch started at exact `50108417ebf1aa45788a4e9a6b4ca6b4448e9972` in this repository
- Authorized environment: repository-local files and controlled temporary copies only
- Copy scope: six completed artifact trees, including V2's V1-dependent process harness, plus the
  exact Capsule tests and canonical documents listed in `source-bindings/`
- Excluded: ignored build outputs, caches, private keys, provisioning-profile bytes, authentication material, installed applications, processes, services, containers, runtime/backend/VM/guest state, and Release publication

The source commit remains the historical oracle for paths outside the copied scope. `SOURCE_FILES.txt` and `SHA256SUMS` bind every copied regular file and executable mode.
