"""Keep credentials out of the logs.

The websocket handshake used to carry the JWT as `?token=...`, which uvicorn's access
logger and nginx both write verbatim -- a real production journal was found holding 131
valid, year-long session tokens in plaintext. The handshake now prefers the
Sec-WebSocket-Protocol header, but the query parameter is still accepted so that an
already-loaded dashboard tab keeps working, and anything else in the codebase could
grow a query-string credential later. So the redaction is applied at the logging layer
rather than trusting every call site: a filter cannot be bypassed by a new route.

Installed on the uvicorn access logger (and the root logger) from app.main.
"""

import logging
import re

# Matches token=..., access_token=..., key=..., api_key=... up to the next delimiter.
# Deliberately broad: over-redacting a log line costs nothing, under-redacting leaks a
# credential.
_SENSITIVE_QUERY = re.compile(
    r"((?:access_token|token|api_key|apikey|key|password|secret)=)([^\s&\"'<>]+)",
    re.IGNORECASE,
)
_REDACTED = r"\1<redacted>"


def scrub(text: str) -> str:
    return _SENSITIVE_QUERY.sub(_REDACTED, text)


class RedactSecretsFilter(logging.Filter):
    """Rewrites the record in place. Returns True always -- this filters CONTENT, it
    never drops a log line, because a silently missing access-log entry is worse than a
    redacted one."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str) and "=" in record.msg:
            record.msg = scrub(record.msg)
        if record.args:
            if isinstance(record.args, dict):
                record.args = {
                    k: scrub(v) if isinstance(v, str) else v for k, v in record.args.items()
                }
            elif isinstance(record.args, tuple):
                record.args = tuple(
                    scrub(a) if isinstance(a, str) else a for a in record.args
                )
        return True


def install() -> None:
    f = RedactSecretsFilter()
    for name in ("uvicorn.access", "uvicorn.error", "uvicorn", ""):
        logging.getLogger(name).addFilter(f)
