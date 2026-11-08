"""Linux child entrypoint. Owner code shares the deployment's OS permissions."""
import ctypes
import os
import resource
import signal
import sys


if __name__ == '__main__':
    # A killed supervisor must not leave its direct child running.
    parent = int(sys.argv[1])
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(1, signal.SIGTERM, 0, 0, 0) != 0 or os.getppid() != parent:
        raise SystemExit(1)
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    os.execvpe(sys.argv[2], sys.argv[2:], os.environ)
