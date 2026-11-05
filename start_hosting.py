"""Bot-Hosting.net panel entrypoint."""
import os

from hosting.__main__ import main

if __name__ == '__main__':
    os.environ.setdefault('K9_HOSTING_RUNTIME', 'bot-hosting')
    os.environ.setdefault('K9_HOSTING_DIR', './k9-hosting-data')
    raise SystemExit(main())
