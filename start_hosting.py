"""Single-deployment panel entrypoint (Free plan); legacy adapters remain optional."""
import os

from hosting.__main__ import main

if __name__ == '__main__':
    os.environ.setdefault('K9_HOSTING_RUNTIME', 'local')
    os.environ.setdefault('K9_HOSTING_DIR', './k9-hosting-data')
    raise SystemExit(main())
