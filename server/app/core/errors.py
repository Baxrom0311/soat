"""Errors the domain layer raises, independent of HTTP.

Services used to raise fastapi.HTTPException directly, which tied business rules to the
web framework: a background job or the websocket path calling the same service got an
HTTP object back, and nothing outside a request could tell "not found" from "conflict"
except by status number. These carry the same status and detail the API has always
sent -- app.main maps them to exactly the response HTTPException produced, so no client
sees a difference.
"""


class DomainError(Exception):
    status_code = 400

    def __init__(self, detail: str):
        super().__init__(detail)
        self.detail = detail


class Unauthorized(DomainError):
    status_code = 401


class PaymentRequired(DomainError):
    status_code = 402


class Forbidden(DomainError):
    status_code = 403


class NotFound(DomainError):
    status_code = 404


class Conflict(DomainError):
    status_code = 409


class Invalid(DomainError):
    status_code = 422


class RateLimited(DomainError):
    status_code = 429
