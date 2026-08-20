from pydantic import BaseModel


class PushTokenIn(BaseModel):
    expo_push_token: str


class PushTokenOut(BaseModel):
    ok: bool = True
